# Pharos TrustMesh MCP Server

Model Context Protocol (stdio) server that exposes Pharos TrustMesh as **agent-callable tools**. Each tool wraps the existing CLI/scripts - no duplicate business logic.

Use MCP when the host (Cursor, Claude Desktop, or another MCP client) can call tools directly. Use CLI when running manually or in CI.

**Related docs:** [`SKILL.md`](../SKILL.md) (agent playbook) | [`README.md`](../README.md) (judge quickstart) | [`references/dag-schema.md`](../references/dag-schema.md) (workflow catalog)

---

## Prerequisites

| Requirement | Used by |
|-------------|---------|
| Node.js 18+ | All tools |
| `npm install` (includes `@modelcontextprotocol/sdk`) | MCP server |
| Foundry (`forge`, `cast`, `anvil`) on PATH | `run_workflow_local`, `verify_execution` |
| Internet access | `fetch_pyth_price`, workflow runners (Pyth/API evidence) |

Install Foundry: https://book.getfoundry.sh/getting-started/installation

**Note:** `@modelcontextprotocol/sdk` is a devDependency. Run `npm install` (not `npm ci --omit=dev`) before starting the server.

---

## Quick start

```bash
npm install
npm run mcp:start
```

`mcp:start` launches a **stdio** server. It is meant to be spawned by an MCP client, not used interactively in a terminal (the process waits for JSON-RPC on stdin).

### Verify installation

```bash
# Tool logic (no stdio)
node scripts/smoke-test-mcp.js

# Full MCP protocol (spawns server, lists tools, calls two tools)
node scripts/smoke-test-mcp-stdio.js
```

Expected stdio test output includes all six tool names and `stdio MCP protocol: OK`.

---

## Architecture

```
MCP Client (Cursor / Claude Desktop)
        |  stdio JSON-RPC
        v
   mcp/server.js
        |  spawnSync / require
        v
   Existing scripts (compile-dag, run-workflow, verify-execution, ...)
```

| MCP tool | Underlying implementation |
|----------|---------------------------|
| `list_workflows` | `loadCatalog()` in `assets/dag-executor/compile-dag.js` |
| `compile_dag` | `compileDagFromObject()` / `resolveCatalog()` |
| `run_workflow_local` | `node scripts/run-workflow.js --network local ...` |
| `verify_execution` | `node scripts/verify-execution.js <artifact>` |
| `fetch_pyth_price` | `node assets/dag-executor/fetch-pyth-hermes.js <symbol>` |
| `compose_custom_dag` | `node assets/dag-executor/compose-dag.js ...` |

---

## Tool reference

All tools return MCP `text` content. On failure, `isError: true` is set and stderr/exit details appear in the text body.

### `list_workflows`

List canonical workflows from `assets/dag-executor/catalog.json`.

**Arguments:** none

**Example output (tab-separated):**

```
payment	Payment workflow	canonical/payment-dag.json	0xbe898bd5...
oracle-validation	Oracle validation	templates/oracle-validation-dag.json	...
```

**CLI equivalent:**

```bash
node assets/dag-executor/compile-dag.js --catalog
```

---

### `compile_dag`

Compile a DAG to layered plan, `hashSpec`, `saliPlan`, and `dagHash`.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `catalog_id` | string | one of | Catalog `dagId` (e.g. `payment`, `oracle-validation`) |
| `dag_path` | string | one of | Path to DAG JSON (relative to repo root or absolute) |

Provide **either** `catalog_id` **or** `dag_path`.

**Example (MCP arguments JSON):**

```json
{ "catalog_id": "payment" }
```

**CLI equivalent:**

```bash
npm run compile-dag -- assets/dag-executor/canonical/payment-dag.json
node assets/dag-executor/compile-dag.js --catalog payment
```

---

### `run_workflow_local`

Run a full workflow on **local Anvil** (no `PRIVATE_KEY`). Starts Anvil if needed, deploys `DAGRegistry`, executes layers, submits on-chain lifecycle, writes artifact.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `catalog` | string | no | Catalog id (default: `payment` if nothing else set) |
| `template` | string | no | Template id: `oracle-validation`, `defi-market-signal`, `wallet-risk-snapshot`, `research-url-verification` |
| `oracle` | string | no | Oracle pair for `oracle-validation` (e.g. `BTC/USD`) |
| `dag_path` | string | no | Custom DAG JSON path |

**Selection order:** `catalog` > `template` (+ optional `oracle`) > `dag_path` > default `payment`.

**Example - payment demo:**

```json
{ "catalog": "payment" }
```

**Example - BTC oracle validation:**

```json
{ "template": "oracle-validation", "oracle": "BTC/USD" }
```

**Artifact written:** `demo-workflow-<dagId>-local.json` in repo root.

**CLI equivalent:**

```bash
npm run demo:local
npm run workflow -- --template oracle-validation --oracle BTC/USD --network local
```

---

### `verify_execution`

Compare on-chain `layerHashes` and final state to a workflow artifact.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `artifact_path` | string | yes | e.g. `demo-workflow-payment-local.json` |

**Success output includes:**

```
Layer 0: PASS
Layer 1: PASS
...
Completed: PASS
Result hash: PASS
Overall: PASS
```

**Requires:** Anvil still running with the same registry state as when the artifact was created. If Anvil was restarted, re-run `run_workflow_local` first.

**CLI equivalent:**

```bash
npm run verify-execution demo-workflow-payment-local.json
```

---

### `fetch_pyth_price`

Fetch live Pyth Hermes price for a symbol. No wallet or chain required.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `symbol` | string | yes | e.g. `BTC/USD`, `ETH`, `ARB`, `PEPE` |

**Example:**

```json
{ "symbol": "ETH/USD" }
```

Returns JSON with `price`, `conf`, `expo`, `publish_time`, `feedId`.

**CLI equivalent:**

```bash
npm run fetch-pyth -- BTC/USD
node assets/dag-executor/fetch-pyth-hermes.js ETH
```

---

### `compose_custom_dag`

Build a custom DAG JSON from oracle pairs and optional balance read. Writes to `assets/dag-executor/generated/` by default.

**Arguments:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `oracles` | string[] | no | Oracle pairs, e.g. `["BTC/USD", "ETH/USD"]` |
| `balance` | boolean | no | Include native PHRS balance read |
| `template` | string | no | Optional base template id |
| `out` | string | no | Output filename under `generated/` |

**Example - price + balance:**

```json
{ "oracles": ["BTC/USD"], "balance": true }
```

Then run the composed DAG:

```json
{ "dag_path": "assets/dag-executor/generated/custom.json" }
```

via `run_workflow_local`.

**CLI equivalent:**

```bash
npm run compose-dag -- --oracle BTC/USD --balance
```

---

## Agent workflow recipes

Map plain-English requests to tool sequences (same routing as [`SKILL.md`](../SKILL.md)).

### "Check BTC price and prove it on-chain"

1. `run_workflow_local` with `{ "template": "oracle-validation", "oracle": "BTC/USD" }`
2. `verify_execution` with `{ "artifact_path": "demo-workflow-oracle-validation-local.json" }`

### "Snapshot wallet risk"

1. `run_workflow_local` with `{ "template": "wallet-risk-snapshot" }`
2. `verify_execution` with `{ "artifact_path": "demo-workflow-wallet-risk-snapshot-local.json" }`

### "Verify URLs and anchor evidence"

1. `run_workflow_local` with `{ "template": "research-url-verification" }`
2. `verify_execution` with `{ "artifact_path": "demo-workflow-research-url-verification-local.json" }`

### "Custom: ARB price + my balance, on-chain"

1. `compose_custom_dag` with `{ "oracles": ["ARB/USD"], "balance": true }`
2. `run_workflow_local` with `{ "dag_path": "assets/dag-executor/generated/custom.json" }`
3. `verify_execution` with `{ "artifact_path": "demo-workflow-custom-local.json" }`

### Price only (no chain)

1. `fetch_pyth_price` with `{ "symbol": "BTC/USD" }` - stop here unless user asks to anchor on-chain.

### Discover what's available

1. `list_workflows` - catalog ids and `dagHash` values
2. Optional: `compile_dag` with `{ "catalog_id": "<id>" }` for layer plan details

---

## Client configuration

Replace `<PROJECT_ROOT>` with the absolute path to this repository (e.g. `E:/pharos2/pharos-skill-engine-0.1.0` or `/home/user/pharos-skill-engine-0.1.0`).

### Cursor

Project-level: `<PROJECT_ROOT>/.cursor/mcp.json`

User-level: Cursor Settings -> MCP -> Edit config

```json
{
  "mcpServers": {
    "pharos-trust-mesh": {
      "command": "node",
      "args": ["mcp/server.js"],
      "cwd": "<PROJECT_ROOT>"
    }
  }
}
```

**Windows tip:** If `node` is not on PATH for Cursor, use the full path:

```json
{
  "mcpServers": {
    "pharos-trust-mesh": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["E:/pharos2/pharos-skill-engine-0.1.0/mcp/server.js"],
      "cwd": "E:/pharos2/pharos-skill-engine-0.1.0"
    }
  }
}
```

Restart Cursor or reload MCP after saving. Tools appear in the agent tool list as `pharos-trust-mesh/*`.

### Claude Desktop

Edit `%APPDATA%\\Claude\\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "pharos-trust-mesh": {
      "command": "node",
      "args": ["<PROJECT_ROOT>/mcp/server.js"],
      "cwd": "<PROJECT_ROOT>"
    }
  }
}
```

Restart Claude Desktop after changes.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| MCP server exits immediately in terminal | stdio server expects a client on stdin | Configure an MCP client; use smoke tests to verify |
| `forge` / `cast` / `anvil` not found | Foundry not installed or not on PATH | Install Foundry; ensure PATH in MCP client environment |
| `verify_execution` layer FAIL | Anvil restarted or not running | Re-run `run_workflow_local`, then verify again |
| `Cannot find module '@modelcontextprotocol/sdk'` | devDependencies not installed | Run `npm install` in project root |
| `fetch_pyth_price` timeout / network error | No internet or Hermes down | Retry; check firewall |
| Empty tool list in client | Wrong `cwd` or bad `args` path | Use absolute `cwd`; point `args` at `mcp/server.js` |
| `run_workflow_local` slow first run | Anvil startup + deploy + Pyth fetch | Normal; subsequent calls reuse Anvil if still up |

### Debug logs

MCP stdio servers must not write to stdout except protocol messages. Errors go to stderr:

```
MCP server error: <message>
```

Run tool logic directly to isolate issues:

```bash
node assets/dag-executor/compile-dag.js --catalog
npm run demo:local
```

---

## Limitations

- **Local only:** `run_workflow_local` does not run Atlantic testnet workflows. Atlantic requires CLI (`npm run demo:atlantic`) with `PRIVATE_KEY` in `.env`.
- **No streaming:** Long workflows block until complete; large outputs return as single text blobs.
- **Single process:** Each MCP client spawn is one server instance; Anvil is started per workflow run inside `run-workflow.js`.

---

## Files

| Path | Purpose |
|------|---------|
| `mcp/server.js` | MCP server (stdio transport, six tools) |
| `mcp/README.md` | This document |
| `scripts/smoke-test-mcp.js` | Direct tool smoke test |
| `scripts/smoke-test-mcp-stdio.js` | Full stdio protocol smoke test |
