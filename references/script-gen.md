# Script Generation Rules

> Generate JS/TS/Python interaction scripts from contract ABI or reference commands.

---

## Read Script Pattern

### Overview

Generate a read-only script using ethers v6 that calls `eth_call` via RPC.

### Command Template

Shipped templates (present in repo):

| File | Purpose |
|------|---------|
| `assets/templates/template_read.js.tpl` | Read-only ethers v6 script |
| `assets/templates/template_write.js.tpl` | Write script (`process.env.PRIVATE_KEY`) |

Replace placeholders when generating scripts:

```text
{{RPC_URL}}  — from assets/networks.json → atlantic.rpcUrl
{{CONTRACT}} — target contract address
{{ABI_FRAGMENT}} — e.g. "function balanceOf(address) view returns (uint256)"
{{METHOD}}   — function name
{{ARGS}}     — call arguments (empty if none)
```

Minimal inline boilerplate (if not using the template file):

```js
const { ethers } = require("ethers");
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://atlantic.dplabs-internal.com");
const abi = ["function METHOD() view returns (uint256)"];
const contract = new ethers.Contract("CONTRACT_ADDR", abi, provider);
contract.METHOD().then(console.log);
```

### Agent Guidelines

1. Read RPC from `assets/networks.json` → `atlantic.rpcUrl`
2. Prefer `assets/templates/template_read.js.tpl` when generating files
3. Use ethers `Contract` with minimal ABI fragment
4. Log parsed return values

---

## Write Script Pattern

### Overview

Generate a write script that signs and sends transactions.

### Command Template

Shipped template: `assets/templates/template_write.js.tpl` (see table in Read Script Pattern).

Placeholders: `{{RPC_URL}}`, `{{CONTRACT}}`, `{{ABI_FRAGMENT}}`, `{{METHOD}}`, `{{ARGS}}`. Private key is read from `process.env.PRIVATE_KEY` (never hardcode).

Minimal inline boilerplate:

```js
const { ethers } = require("ethers");
if (!process.env.PRIVATE_KEY) throw new Error("Set PRIVATE_KEY");
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const abi = ["function METHOD(uint256 arg)"];
const contract = new ethers.Contract("CONTRACT_ADDR", abi, wallet);
contract.METHOD(arg).then((tx) => tx.wait()).then((r) => console.log("tx:", r.hash));
```

### Agent Guidelines

1. Complete Write Operation Pre-checks before running generated write scripts
2. Use explicit RPC URL from `assets/networks.json`
3. Never commit or log `PRIVATE_KEY`
