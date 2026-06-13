# Script Generation Rules

> Generate JS/TS/Python interaction scripts from contract ABI or reference commands.

---

## Read Script Pattern

### Overview

Generate a read-only script using ethers v6 that calls `eth_call` via RPC.

### Command Template

Use `assets/templates/template_read.js.tpl` as base. Replace `<RPC_URL>`, `<CONTRACT>`, `<METHOD>`.

### Agent Guidelines

1. Read RPC from `assets/networks.json`
2. Use ethers `Contract` with minimal ABI fragment
3. Log parsed return values

---

## Write Script Pattern

### Overview

Generate a write script that signs and sends transactions.

### Command Template

Use `assets/templates/template_write.js.tpl`. Never hardcode private keys — read from `process.env.PRIVATE_KEY`.

### Agent Guidelines

1. Complete Write Operation Pre-checks before running generated write scripts
2. Use explicit RPC URL from networks.json
