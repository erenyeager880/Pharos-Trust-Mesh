# Pharos TrustMesh v0.1.0

Pharos TrustMesh lets an AI agent perform on-chain operations on Pharos — check balances, send transactions, deploy contracts, and run multi-agent trust workflows — through CLI commands (`cast`, `forge`, `node`).

**Core capabilities:** compile dependency-ordered task DAGs, bind Pyth Hermes off-chain oracle data into layer evidence hashes, register executions on Pharos DAGRegistry, multi-agent signoff with verifier reward points (`verificationScore`), cross-agent verification, SALI-friendly parallel layers, and canonical workflow replay by `dagHash`.

Do not attempt operations outside this skill package without explicit user approval.

---

## Prerequisites

1. **Foundry** — `cast` and `forge` must be installed (`forge --version`, `cast --version`).
2. **Node.js** — for `compile-dag.js` and `fetch-pyth-hermes.js` (`node --version`).
3. **Wallet** — export private key: `export PRIVATE_KEY=0x...`
4. **Convenience vars:**

```bash
export RPC=https://atlantic.dplabs-internal.com
export DEPLOYER=$(cast wallet address --private-key $PRIVATE_KEY)
```

**Critical:** Foundry does NOT read `$PRIVATE_KEY` automatically. Always pass `--private-key $PRIVATE_KEY` on every write command.

### Atlantic wallet modes

For local workflows (`--network local`), no private key is required; Anvil test accounts are used.

For Atlantic workflows (`--network atlantic`), set at least:

```bash
PRIVATE_KEY=0x...
RPC_URL=https://atlantic.dplabs-internal.com
```

For real multi-agent testnet runs, also set independent verifier keys:

```bash
VERIFIER_B_PRIVATE_KEY=0x...
VERIFIER_C_PRIVATE_KEY=0x...
```

If verifier keys are present, the runner checks that executor, verifier B, and verifier C are distinct and funded. If verifier keys are omitted, the runner falls back to deterministic demo verifier wallets and funds them from `PRIVATE_KEY`.

---

## Network Configuration

Read `assets/networks.json` for RPC URLs, chain IDs, and explorer URLs.

| Network | chainId | rpcUrl |
|---------|---------|--------|
| Atlantic Testnet | 688689 | `https://atlantic.dplabs-internal.com` |
| Pacific Mainnet | 688688 | `https://pacific.dplabs-internal.com` |

Default to **Atlantic** unless the user specifies mainnet.

---

## Capability Index

| User Need | Capability | Detailed Instructions |
|-----------|------------|----------------------|
| Check PHRS / token balance | `cast balance` / `cast call` | → `references/query.md` |
| Send PHRS or call contract write | `cast send` | → `references/transaction.md` |
| Deploy Solidity contract | `forge script` | → `references/contract.md` |
| Generate interaction scripts | templates in `assets/templates/` | → `references/script-gen.md` |
| Compile task DAG / dependency graph / workflow optimization | `node` + `compile-dag.js` | → `references/dag-executor.md#compile-dag` |
| Fetch Pyth price / ETH BTC USDC / off-chain oracle / Hermes market data | `fetch-pyth-hermes.js` + Hermes API | → `references/dag-executor.md#fetch-pyth-hermes` |
| Run canonical workflow / replay payment DAG / DAG by ID / workflow catalog | `--catalog` lookup | → `references/dag-executor.md#catalog-lookup` |
| Deploy DAG Registry / execution registry / agent trust contract on Pharos | `forge script` + DAGRegistry template | → `references/dag-executor.md#deploy-dagregistry` |
| Verify DAG Registry / confirm contract on Pharos Scan | `forge verify-contract` | → `references/dag-executor.md#verify-dagregistry` |
| Register DAG execution / start agent workflow on-chain | `cast send registerExecution()` | → `references/dag-executor.md#register-execution` |
| Complete DAG layer / submit layer proof / parallel batch evidence | `cast send completeLayer()` + layerHash | → `references/dag-executor.md#complete-layer` |
| Approve agent workflow / verifier signoff / multi-agent consensus | `cast send approveExecution()` | → `references/dag-executor.md#approve-execution` |
| Finalize DAG / store workflow result / bind resultHash | `cast send finalizeExecution()` | → `references/dag-executor.md#finalize-execution` |
| Fail DAG execution / abort workflow | `cast send failExecution()` | → `references/dag-executor.md#fail-execution` |
| Check DAG status / read execution record | `cast call getExecution()` | → `references/dag-executor.md#get-execution` |
| Get layer hash / read layer evidence | `cast call layerHashes()` | → `references/dag-executor.md#get-layer-hash` |
| Verify another agent's work / cross-agent check / trust executor output | `cast call` + hash + Hermes verify | → `references/dag-executor.md#cross-agent-verification` |
| Check verifier score / verification points / trusted checker | `cast call verificationScore()` | → `references/dag-executor.md#get-verification-score` |
| Publish standard workflow / register canonical DAG on-chain | `cast send publishCanonicalDag()` | → `references/dag-executor.md#publish-canonical-dag` |
| Query DAG events / execution audit trail / approval history | `cast logs` | → `references/dag-executor.md#query-events` |
| Execute SALI parallel layer / run workflow tasks concurrently | `execute-layer.js` + `npm run demo:local` | → `references/dag-executor.md#execute-layer` |
| Verify on-chain layer evidence / cross-agent hash check | `npm run verify-execution` | → `references/dag-executor.md#verify-execution` |
| Multi-agent workflow from plain English | `npm run workflow -- --template <id>` | → `references/dag-schema.md` |
| Compose custom DAG (oracles, balance) | `npm run compose-dag` | → `references/dag-schema.md` |
| Real-data workflow templates | `--template oracle-validation|defi-market-signal|wallet-risk-snapshot|research-url-verification` | → `references/dag-schema.md` |

---

## User prompts → agent workflow

When a user describes a multi-agent task in plain English, follow this decision tree:

1. **List workflows?** → `node assets/dag-executor/compile-dag.js --catalog`
2. **Price only (no on-chain)?** → `node assets/dag-executor/fetch-pyth-hermes.js BTC/USD` — no `PRIVATE_KEY` needed
3. **Known real-data workflow?** → `npm run workflow -- --template <id> --network local|atlantic`
4. **Simple price + balance?** → `npm run compose-dag -- --oracle BTC/USD --balance` then `npm run workflow -- --dag assets/dag-executor/generated/<file>.json`
5. **Payment SALI demo?** → `npm run workflow -- --catalog payment --network local|atlantic`
6. **Custom logic?** → write DAG JSON per `references/dag-schema.md`, then `npm run workflow -- --dag <path>`
7. **Verify?** → `npm run verify-execution demo-workflow-<dagId>-<network>.json`

**Network:** `--network local` needs no `PRIVATE_KEY` (Anvil). `--network atlantic` requires `PRIVATE_KEY` in `.env` and PHRS for gas. For real multi-agent runs, set `VERIFIER_B_PRIVATE_KEY` and `VERIFIER_C_PRIVATE_KEY` too; otherwise the runner uses funded demo verifier wallets.

### Example prompts

| User says | Agent runs |
|-----------|------------|
| "Verify payment: balance + ETH price before transfer" | `npm run workflow -- --catalog payment --network local` |
| "Three agents fetch BTC/USD and reach oracle consensus" | `npm run workflow -- --template oracle-validation --oracle BTC/USD --network local` |
| "DeFi market signal from price, funding, liquidity" | `npm run workflow -- --template defi-market-signal --network local` |
| "Snapshot my wallet PHRS balance for risk evidence" | `npm run workflow -- --template wallet-risk-snapshot --network local` |
| "Verify research sources by URL content hash" | `npm run workflow -- --template research-url-verification --network local` |
| "Get BTC price and check my balance" | `npm run compose-dag -- --oracle BTC/USD --balance` then workflow on generated DAG |
| "Fetch any Pyth price" | `node assets/dag-executor/fetch-pyth-hermes.js BTC/USD` |

---

## General Error Handling

| Error / CLI Signature | Cause | Fix |
|-----------------------|-------|-----|
| `invalid address` | Wrong address format | `0x` + 40 hex chars |
| `transaction not found` | TX not indexed | Wait and retry |
| `execution reverted` | Contract revert | Read revert reason |
| `insufficient funds` | Low balance for gas | `cast balance --ether` |
| `connection refused` | Missing `--rpc-url` | Always pass `--rpc-url $RPC` |
| `PRIVATE_KEY not set` | Env not exported | `export PRIVATE_KEY=0x...` |
| `forge/cast: command not found` | Foundry not installed | Install Foundry |

---

## Security Reminders

- Never commit or share `$PRIVATE_KEY`.
- Never hardcode private keys in scripts or markdown.
- Always use `--private-key $PRIVATE_KEY` explicitly on writes.

---

## Write Operation Pre-checks

Before **any** transaction (transfer, deploy, DAG registry write):

1. `cast wallet address --private-key $PRIVATE_KEY` — confirm deployer address.
2. If `VERIFIER_B_PRIVATE_KEY` and `VERIFIER_C_PRIVATE_KEY` are set, confirm both verifier addresses are distinct from deployer.
3. User confirms the addresses are correct.
4. Read `rpcUrl` and `chainId` from `assets/networks.json` (Atlantic default).
5. Check PHRS balances for deployer and verifier wallets. The workflow runner also enforces minimum balances before sending Atlantic transactions.

Only proceed when all checks pass.
