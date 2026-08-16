# Deploying the WOMS functions

The Data Store schema, File Store buckets, Authentication, and RolePermissions
seed data were created directly via the Catalyst API/MCP tools and are already
live in the `woms` project (org `zitraartech`, id `775318997`).

Functions can only be *created* via the Catalyst CLI (there is no "create
function" API) — the MCP tools here can only manage functions that already
exist. To deploy the five functions in this directory:

```bash
npm install -g zcatalyst-cli
catalyst login
cd /Users/pravmadh/Documents/Claude/woms-catalyst
catalyst init          # link this folder to the existing "woms" project if prompted
catalyst deploy
```

Each function folder (`functions/<name>/`) has its own `package.json` — run
`npm install` inside each one before deploying if the CLI doesn't do it for
you automatically.

After deploying, functions are callable via the API Gateway or directly:
`POST https://woms-775318997.development.catalystserverless.com/server/<function-name>_function/`
