# Testing Guide

Pharos TrustMesh has two verification layers:

1. **Foundry unit tests** — `DAGRegistry.sol` lifecycle, access control, and revert strings
2. **Integration verification** — `verify-execution` compares on-chain state to demo workflow artifacts

---

## Prerequisites

| Tool | Check |
|------|-------|
| Foundry | `forge --version` |
| Node.js | `node --version` |
| Dependencies | `npm install` from project root |

---

## Contract tests (Foundry)

### Run

```bash
forge build
forge test
forge test -vvv          # verbose traces on failure
forge test --match-test finalize   # filter by name
```

### Location

- Contract: `src/dag-executor/DAGRegistry.sol`
- Tests: `test/DAGRegistry.t.sol`
- Captured output: `demo-output-forge-test.txt`

### Coverage (33 tests)

| Area | What is tested |
|------|----------------|
| `registerExecution` | Success path, zero-layer revert, unique IDs via nonce |
| `completeLayer` | Hash storage, ordering, zero hash, wrong submitter, not found, completed/failed guards |
| `approveExecution` | Success, duplicate revert, not found, completed guard, failed guard, submitter guard, `verificationScore` |
| `finalizeExecution` | Full happy path with 2 approvals, insufficient approvals, incomplete layers, wrong submitter, not found, already completed, `endBlock` |
| `failExecution` | Blocks approve/finalize, wrong submitter, duplicate fail, not found, already completed, `endBlock` |
| `publishCanonicalDag` | Name storage, duplicate publish revert |
| View helpers | `approvalCount`, `getApprovers`, `requiredApprovals` |

The test harness deploys `DAGRegistry(2)` — two independent verifier approvals are required before `finalizeExecution`.

### Revert strings under test

These strings must stay in sync with `references/dag-executor.md` error tables:

| Revert | Function |
|--------|----------|
| `Zero layers` | `registerExecution` |
| `Execution not found` | `completeLayer`, `approveExecution`, `finalizeExecution`, `failExecution` |
| `Not submitter` | `completeLayer`, `finalizeExecution`, `failExecution` |
| `Already completed` | `completeLayer`, `approveExecution`, `finalizeExecution`, `failExecution` |
| `Execution failed` | `completeLayer`, `failExecution` |
| `Zero layer hash` | `completeLayer` |
| `Layer out of order` | `completeLayer` |
| `Cannot approve failed` | `approveExecution` |
| `Submitter cannot approve` | `approveExecution` |
| `Already approved` | `approveExecution` |
| `Layers incomplete` | `finalizeExecution` |
| `Insufficient approvals` | `finalizeExecution` |
| `Cannot finalize failed` | `finalizeExecution` |
| `DAG already published` | `publishCanonicalDag` |

---

## Workflow integration tests

These are not npm/Jest tests. They exercise the full off-chain → on-chain pipeline and assert consistency afterward.

### Local demo (no keys)

```bash
npm run demo:local
npm run verify-execution demo-workflow-payment-local.json
```

### Per-template workflows

```bash
npm run workflow -- --template oracle-validation --oracle BTC/USD --network local
npm run workflow -- --template defi-market-signal --network local
npm run workflow -- --template wallet-risk-snapshot --network local
npm run workflow -- --template research-url-verification --network local
npm run verify-execution demo-workflow-<template>-local.json
```

### Atlantic (requires `.env`)

```bash
cp .env.example .env   # fill PRIVATE_KEY
npm run demo:atlantic
npm run verify-execution demo-sali-atlantic.json
```

`verify-execution` checks:

- On-chain `layerHashes` match the artifact
- `completed` / `resultHash` match expected final state
- Exit code `0` on PASS

See [`dag-executor.md#verify-execution`](dag-executor.md#verify-execution) for artifact naming.

---

## Recommended CI / pre-submit checklist

```bash
npm install
forge build && forge test
npm run demo:local
npm run verify-execution demo-workflow-payment-local.json
```

Optional Atlantic smoke (costs testnet PHRS):

```bash
npm run demo:atlantic
npm run verify-execution demo-sali-atlantic.json
```

Captured demo transcript: `demo-output.txt`.
