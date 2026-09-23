# Example: Deploy a PostgreSQL-backed app to App Service within Locally

This example shows how to deploy a sample TypeScript Notes app to App Service, backed by Azure Database for PostgreSQL Flexible Server, on [Locally Build](https://locally.build).

The application is a minimal Notes app written in TypeScript (Node.js and Express). It's a plain [12-factor](https://12factor.net) service: one image, configured entirely through environment variables, connecting to PostgreSQL for storage. The source lives in [`app/`](./app), alongside the infrastructure that runs it.

The app authenticates to PostgreSQL using a **user-assigned managed identity**, which is set as the server's Entra administrator. When it opens a connection it fetches an Entra access token for that identity and presents it as the password, so no secret is stored in app settings. PostgreSQL Flexible Server still requires an administrator login, so Terraform generates a random password for it; the app never uses it. Locally supports managed identity the same way Azure does, so the identical wiring works locally and in the cloud.

## Requirements

* [Locally Build](https://locally.build).
* Either [HashiCorp Terraform](https://terraform.io) or [OpenTofu](https://opentofu.org).
* Either [Docker](https://www.docker.com) or [Podman](https://podman.io) (recommended).
* The Locally Plugin for `Microsoft.DBforPostgreSQL` installed (`locally plugin install --name Microsoft.DBforPostgreSQL`).
* The Locally Plugin for `Microsoft.Web` installed (`locally plugin install --name Microsoft.Web`).
* The Locally Plugin for `Microsoft.ContainerRegistry` installed (`locally plugin install --name Microsoft.ContainerRegistry`).

## Running the example

First up, we need to ensure our container runtime (Docker or Podman) is running, then launch Locally:

```bash
locally build
```

With Locally running, in another terminal we can initialise Terraform, which both downloads the providers we need and configures the module for use:

```bash
cd environments/locally
terraform init
```

> [!NOTE]
> It's possible to use OpenTofu here by substituting `terraform` for `tofu`.

With Terraform initialised, we can then provision the example by running:

```bash
locally run terraform apply
```

As part of the apply, the app is built with `docker build` and pushed into the Container Registry, so the `docker` command needs to be available (with Podman, the `podman-docker` shim or a `docker` alias works).

Once you approve the plan and the resources have been deployed, the application is running at the URL in the outputs:

```
https://locally-example-postgresql-app.furnace.locally:5663
```

[Open that URL in a browser](https://locally-example-postgresql-app.furnace.locally:5663) and you'll be able to add and delete notes; each one is stored as a row in the `notes` table in PostgreSQL.

---

As this Terraform configuration sends the App Service logs into a Log Analytics Workspace, we can then query them within [the Locally Dashboard, in the Monitoring section](https://localhost:5678/monitoring/components), by running:

```
AppServiceConsoleLogs | order by TimeGenerated desc
```

## Notes

This example has no sign-in of its own: anyone who can reach the URL can read and write notes. That keeps it focused on the App Service ↔ PostgreSQL wiring - a real app would sit behind authentication.

The connection to PostgreSQL is always encrypted with TLS. The server certificate is verified only when you point `PG_CA_CERT` at a CA certificate (do this against Azure, using the DigiCert Global Root); Locally's emulator uses a certificate the app image doesn't trust, so verification is skipped by default.

## Tearing it down

```bash
cd environments/locally
locally run terraform destroy
```
