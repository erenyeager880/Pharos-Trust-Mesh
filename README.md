# Pharos TrustMesh

> **The trust mesh for multi-agent workflows on Pharos.**

Pharos TrustMesh compiles dependency-ordered agent DAGs, binds **Pyth Hermes** off-chain prices into **layer evidence hashes**, registers executions on **DAGRegistry**, requires **multi-agent signoff**, and rewards verifiers with on-chain **verificationScore** points.

## Shipped Workflows (real evidence)

| dagId | evidence sources |
|-------|------------------|
| `payment` | PHRS balance + Pyth ETH/USD |
| `oracle-validation` | N× Pyth feeds + consensus |
| `defi-market-signal` | Pyth BTC/USD + Binance APIs |
| `wallet-risk-snapshot` | PHRS native balance |
| `research-url-verification` | Real URL content hashes |

```bash
node assets/dag-executor/compile-dag.js --catalog
npm run workflow -- --catalog payment --network local
npm run workflow -- --template oracle-validation --oracle BTC/USD --network local
npm run workflow -- --template defi-market-signal --network local
npm run compose-dag -- --oracle BTC/USD --balance
```

Authoring guide: [`references/dag-schema.md`](references/dag-schema.md). Agent playbook: [`SKILL.md`](SKILL.md#user-prompts--agent-workflow).

## Execution Evidence

Layer 0 runs independent tasks in parallel (e.g. balance + Pyth price), computes:

```
layerHash = keccak256(abi.encode(layerIndex, [taskOutputHashes...]))
```

and submits `completeLayer(executionId, 0, layerHash)`. Verifiers re-fetch Hermes / RPC data and compare on-chain hashes.

## Compiler Optimization (payment DAG)

```
Layer 0: PHRS balance + Pyth ETH/USD (parallel, 2 tasks)
Layer 1: validate aggregate
Layer 2: record result hash on DAGRegistry
SALI friendly: yes
```

## SALI (planning + execution)

**Planning:** The compiler groups dependency-free tasks into layers and emits `saliPlan` with `executionMode: parallel` when tasks are conflict-free.

**Execution:** `execute-layer.js` runs parallel layers via `Promise.all`, computes real evidence hashes, then anchors them on `DAGRegistry` with `completeLayer`.

```bash
npm run demo:local      # payment on Anvil — no PRIVATE_KEY
npm run demo:atlantic   # payment on Atlantic — requires PRIVATE_KEY
npm run verify-execution demo-workflow-payment-local.json
```

## Atlantic Wallet Setup

For quick demos, set only the executor key:

```env
PRIVATE_KEY=0x...
RPC_URL=https://atlantic.dplabs-internal.com
```

For stronger multi-agent testnet runs, set independent verifier wallets too:

```env
VERIFIER_B_PRIVATE_KEY=0x...
VERIFIER_C_PRIVATE_KEY=0x...
```

When verifier keys are provided, the workflow runner checks all three addresses are distinct and funded before sending transactions. If verifier keys are omitted, it uses deterministic demo verifier wallets and funds them from `PRIVATE_KEY`.

## Prerequisites

| Tool | Purpose |
|------|---------|
| [Foundry](https://book.getfoundry.sh/getting-started/installation) | `forge build`, `forge test`, `cast` |
| Node.js 18+ | DAG compiler, workflow runner, Pyth helpers |
| `.env` (Atlantic only) | Copy from `.env.example` — `PRIVATE_KEY` required for testnet writes |

Local workflows (`--network local`) use Anvil test accounts and need no keys.

## Quick Start

```bash
npm install
forge build
forge test                    # 32 DAGRegistry unit tests
node assets/dag-executor/fetch-pyth-hermes.js BTC/USD
npm run demo:local
npm run verify-execution demo-workflow-payment-local.json
```

## Testing

| Layer | Command | What it validates |
|-------|---------|-------------------|
| Unit (Solidity) | `forge test` | `DAGRegistry` register → layer → approve → finalize/fail paths |
| Integration | `npm run verify-execution <artifact.json>` | On-chain hashes match demo workflow output |

Full guide: [`references/testing.md`](references/testing.md). Captured outputs: `demo-output-forge-test.txt`, `demo-output.txt`.

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run demo:local` | Payment workflow on local Anvil |
| `npm run demo:atlantic` | Payment workflow on Atlantic (needs `PRIVATE_KEY`) |
| `npm run workflow -- --template <id> --network local` | Run a catalog/template workflow |
| `npm run compose-dag -- --oracle BTC/USD --balance` | Build a custom DAG JSON |
| `npm run verify-execution <file.json>` | Cross-check on-chain state vs artifact |
| `npm run compile-dag` | Compile DAG file to layered plan + `dagHash` |

## Live deployment

**Atlantic DAGRegistry:** [`0xB825EAe9BA48B44374be0DD56EE701A0dF2A24E6`](https://atlantic.pharosscan.xyz/address/0xB825EAe9BA48B44374be0DD56EE701A0dF2A24E6) (verified). Full Atlantic metadata: `deployments/atlantic.json`.

## Documentation map

| File | Audience | Contents |
|------|----------|----------|
| [`SKILL.md`](SKILL.md) | AI agents | Capability index, plain-English workflow routing |
| [`references/dag-executor.md`](references/dag-executor.md) | Agents / operators | Per-command templates for every DAGRegistry operation |
| [`references/dag-schema.md`](references/dag-schema.md) | Authors | DAG JSON schema and template catalog |
| [`references/testing.md`](references/testing.md) | Developers / judges | Test commands, coverage matrix, CI checklist |
| [`SUBMISSION.md`](SUBMISSION.md) | Hackathon reviewers | Demo commands and live contract link |

## Structure

```
SKILL.md                 Agent entry point
references/              query, transaction, contract, dag-executor, dag-schema, testing
assets/dag-executor/     Compiler, catalog, templates, Pyth helpers
src/dag-executor/        DAGRegistry.sol (Foundry compile target)
test/                    DAGRegistry.t.sol (32 Foundry tests)
scripts/                 Workflow runner, demo scripts, verify-execution
demo-workflow-*.json     Integration test artifacts (local + Atlantic)
```
