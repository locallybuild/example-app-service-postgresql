import { readFileSync } from "node:fs";
import express, { NextFunction, Request, Response } from "express";
import { Pool } from "pg";
import { DefaultAzureCredential } from "@azure/identity";

// Configuration comes entirely from the environment (12-factor). App Service
// sets these as app settings - see 5-app-service.tf.
const PORT = Number(process.env.PORT ?? 8080);
const PGHOST = required("PGHOST");
// Locally serves PostgreSQL on a non-standard port; Azure uses 5432.
const PGPORT = Number(process.env.PGPORT ?? 5432);
const PGDATABASE = required("PGDATABASE");
const PGUSER = required("PGUSER");
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
// Optional path to a CA certificate (PEM) to verify the server against. When
// set, TLS is fully verified; when unset, verification is skipped - see the
// pool's `ssl` option below.
const PG_CA_CERT = process.env.PG_CA_CERT;

// The scope Azure Database for PostgreSQL accepts Entra access tokens for.
const POSTGRES_TOKEN_SCOPE = "https://ossrdbms-aad.database.windows.net/.default";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`the environment variable ${name} must be set`);
  }
  return value;
}

// AZURE_CLIENT_ID selects the user-assigned managed identity attached to the
// web app, which is also the PostgreSQL server's Entra administrator.
const credential = new DefaultAzureCredential({ managedIdentityClientId: AZURE_CLIENT_ID });

// There's no database password: the managed identity's Entra access token IS
// the password. `pg` accepts an async function here and calls it each time the
// pool opens a new connection. Tokens expire (typically after an hour), so
// fetching one per connection - rather than once at startup - means a
// long-running pool never tries to connect with a stale token. The credential
// caches tokens internally, so this isn't a round trip every time.
const pool = new Pool({
  host: PGHOST,
  port: PGPORT,
  database: PGDATABASE,
  user: PGUSER,
  password: async () => {
    const token = await credential.getToken(POSTGRES_TOKEN_SCOPE);
    return token.token;
  },
  // Locally serves PostgreSQL over TLS (as Azure does), so always connect over
  // TLS. If a CA certificate is supplied (PG_CA_CERT), the server certificate is
  // verified against it - do this against Azure, pointing at the DigiCert Global
  // Root. Locally's emulator uses a certificate that isn't in this image's trust
  // store, so with no CA supplied verification is skipped: the connection is
  // still encrypted, but the server isn't authenticated.
  ssl: PG_CA_CERT
    ? { ca: readFileSync(PG_CA_CERT), rejectUnauthorized: true }
    : { rejectUnauthorized: false },
});

interface Note {
  id: number;
  body: string;
  created_at: Date;
}

async function initSchema(): Promise<void> {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS notes (id SERIAL PRIMARY KEY, body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())",
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage(notes: Note[]): string {
  const items = notes
    .map(
      (note) => `
      <li>
        <span>${escapeHtml(note.body)}</span>
        <small>${note.created_at.toISOString()}</small>
        <form method="post" action="/notes/${note.id}/delete">
          <button type="submit">Delete</button>
        </form>
      </li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Notes</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
    ul { list-style: none; padding: 0; }
    li { display: flex; gap: 0.75rem; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #ddd; }
    li span { flex: 1; }
    li small { color: #666; }
    li form { margin: 0; }
    form.add { display: flex; gap: 0.5rem; }
    form.add input { flex: 1; padding: 0.4rem; }
  </style>
</head>
<body>
  <h1>Notes</h1>
  <form class="add" method="post" action="/notes">
    <input name="body" placeholder="Write a note..." required>
    <button type="submit">Add</button>
  </form>
  <ul>${items || "<li>No notes yet.</li>"}</ul>
</body>
</html>`;
}

// Express 4 doesn't forward rejected promises from async handlers, so route
// any error (e.g. the database being unreachable) to the error handler below.
type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const handle = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).send("ok");
});

app.get("/", handle(async (_req, res) => {
  const result = await pool.query<Note>("SELECT id, body, created_at FROM notes ORDER BY created_at DESC");
  res.send(renderPage(result.rows));
}));

app.post("/notes", handle(async (req, res) => {
  const body = String(req.body.body ?? "").trim();
  if (body) {
    await pool.query("INSERT INTO notes (body) VALUES ($1)", [body]);
  }
  res.redirect(303, "/");
}));

app.post("/notes/:id/delete", handle(async (req, res) => {
  await pool.query("DELETE FROM notes WHERE id = $1", [Number(req.params.id)]);
  res.redirect(303, "/");
}));

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).send("Internal Server Error");
});

// The database can still be starting when the app first boots, so retry the
// schema setup with a short backoff before giving up.
async function initSchemaWithRetry(attempts = 10): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await initSchema();
      return;
    } catch (err) {
      if (attempt >= attempts) {
        throw err;
      }
      console.warn(`database not ready (attempt ${attempt}/${attempts}): ${(err as Error).message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

async function main(): Promise<void> {
  await initSchemaWithRetry();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`listening on 0.0.0.0:${PORT}, using database ${PGDATABASE} on ${PGHOST} as ${PGUSER}`);
  });
}

main().catch((err) => {
  console.error("failed to start:", err);
  process.exit(1);
});
