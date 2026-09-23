# Build stage: install everything (including TypeScript) and compile to dist/.
FROM node:22 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage: production dependencies and the compiled JavaScript only.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /src/dist ./dist
EXPOSE 8080
USER node
CMD ["node", "dist/index.js"]
