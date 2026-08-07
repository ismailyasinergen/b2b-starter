# Medusa B2B MCP

A zero-runtime-dependency MCP adapter for the official `medusajs/b2b-starter`. It maps the starter's custom company, employee, spending-limit, approval, quote and bulk-cart HTTP APIs into MCP tools.

## Compatibility

- Node.js 20+
- Medusa B2B Starter inspected at commit `3b0feaeacd4175dd6a8a5e87b991ff75dd84a96d`
- MCP stateless HTTP protocol `2026-07-28` at `POST /mcp`
- Backward-compatible stdio mode for clients still using the `initialize` handshake

No npm install is required for this MCP adapter.

## 1. Start the upstream B2B starter

The official starter requires Node 20+, PostgreSQL 15+, and pnpm. From the upstream repository:

```bash
git clone https://github.com/medusajs/b2b-starter.git
cd b2b-starter
pnpm install
cp apps/backend/.env.template apps/backend/.env
# Set DATABASE_URL in apps/backend/.env
cd apps/backend
pnpm medusa db:migrate
pnpm medusa user -e admin@example.com -p YOUR_SECURE_PASSWORD
pnpm dev
```

The backend is normally at `http://localhost:9000` and admin at `http://localhost:9000/app`.

Then configure the storefront publishable key and run it on port 8000 per the starter README.

## 2. Configure MCP

Copy `.env.example` values into your process environment. The important variables are:

```text
MEDUSA_BACKEND_URL=http://localhost:9000
MEDUSA_PUBLISHABLE_KEY=pk_...
MEDUSA_STORE_TOKEN=customer_bearer_token
MEDUSA_ADMIN_TOKEN=admin_bearer_token
MCP_ALLOW_WRITES=true
```

Keep tokens outside prompts and chat messages.

## 3. Stdio mode

```bash
node src/server.mjs --stdio
```

Use `mcp-config.example.json` as the client configuration template. Replace `/ABSOLUTE/PATH/...` with the real path.

## 4. Stateless HTTP mode

```bash
MCP_ALLOW_WRITES=true node src/server.mjs --http
```

Endpoints:

- MCP: `POST http://127.0.0.1:3333/mcp`
- Adapter health: `GET http://127.0.0.1:3333/healthz`

The HTTP implementation targets MCP `2026-07-28`. It also supports `server/discover`, `tools/list`, `tools/call`, and `ping`.

## 5. Docker

```bash
docker compose -f docker-compose.mcp.yml up --build
```

On Docker Desktop, the compose file defaults the Medusa target to `http://host.docker.internal:9000`.

## Write safety

All write tools are fail-closed. Unless `MCP_ALLOW_WRITES=true`, create/update/approve/reject/send/bulk-add operations return an MCP tool error. Read tools remain available.

## Exposed B2B tools

Customer/store side includes company CRUD-facing operations, employee membership and spending limits, approval settings/workflow actions, quote request/messaging/accept/reject/preview, and bulk add-to-cart.

Merchant/admin side includes company and employee management plus quote list/retrieve/send/reject/messaging operations.

## Validation

Run:

```bash
npm run check
npm run smoke
```

`smoke` starts a local mock Medusa service and verifies MCP initialize compatibility, tool discovery, a real HTTP read mapping, and a real HTTP write mapping through the adapter.

## Authentication note

The starter's custom Store quote/company routes use customer authentication via session or bearer middleware. This adapter is designed for bearer tokens supplied as environment variables. Admin endpoints use the admin bearer token. The publishable key is sent as `x-publishable-api-key` for Store calls when configured.

## Drop directly into `medusajs/b2b-starter`

The upstream `pnpm-workspace.yaml` includes `apps/*`, so this adapter can live as `apps/mcp` without changing the workspace definition.

```bash
# from the b2b-starter repository root
mkdir -p apps/mcp
# copy this package's files into apps/mcp/
pnpm --filter medusa-b2b-mcp start
# or
pnpm --filter medusa-b2b-mcp start:http
```

For a ready-to-overlay archive, use `b2b-starter-mcp-overlay.zip` from the delivery alongside the standalone package.
