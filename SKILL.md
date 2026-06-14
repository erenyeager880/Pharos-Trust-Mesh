# Pharos TrustMesh v0.1.0

Pharos TrustMesh lets an AI agent perform on-chain operations on Pharos — check balances, send transactions, deploy contracts, and run multi-agent trust workflows — through CLI commands (`cast`, `forge`, `node`).

**Core capabilities:** compile dependency-ordered task DAGs, bind Pyth Hermes off-chain oracle data into layer evidence hashes, register executions on Pharos DAGRegistry, multi-agent signoff with verifier reward points (`verificationScore`), cross-agent verification, SALI-friendly parallel layers, and canonical workflow replay by `dagHash`.

Do not attempt operations outside this skill package without explicit user approval.

---

## Prerequisites

1. **Foundry** — `cast` and `forge` must be installed (`forge --version`, `cast --version`). Run `forge test` (33 tests) before Atlantic writes — see `references/testing.md`.
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
| Fetch Pyth price / **any token symbol** (ETH, BTC, ARB, PEPE, LINK, …) / off-chain oracle / Hermes market data | `fetch-pyth-hermes.js` + Hermes API (dynamic catalog lookup) | → `references/dag-executor.md#fetch-pyth-hermes` |
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
| Run contract tests / validate DAGRegistry behavior | `forge test` | → `references/testing.md` |

---

## User prompts → agent workflow

Users speak in plain English. They will **not** say "run the oracle-validation template" — they say things like *"I want to check BTC price, snapshot my wallet, and verify a source, then prove it on-chain."* Your job is to turn that into the right workflow. Always follow these five steps in order.

### Step 1 — Understand & decompose the request

Break the user's sentence into individual capabilities (tasks). Map each phrase to a task type:

| User phrase (any wording) | Task |
|---------------------------|------|
| "price of X", "how much is X", "check X/USD", "oracle for X" | Pyth oracle price (**any token** — see Step 5) |
| "my balance", "wallet balance", "how much PHRS I have", "wallet risk" | native PHRS balance read |
| "consensus", "multiple agents agree", "cross-check price" | oracle consensus (N price fetches) |
| "market signal", "funding", "order book", "liquidity" | DeFi market signal |
| "verify this URL/source", "hash this document/article" | URL / content-hash evidence |
| "prove it", "record on-chain", "make it trustworthy", "anchor", "register" | run through DAGRegistry (on-chain lifecycle) |
| "list / what can you do / show workflows" | `node assets/dag-executor/compile-dag.js --catalog` |

If it is **just a price** with no "prove/record on-chain" intent → run `fetch-pyth-hermes.js` and stop (no wallet needed). Otherwise continue.

### Step 2 — ALWAYS ask: demo or live testnet?

Before any run that touches the chain, ask the user **exactly this**:

> Do you want to run this as a **demo** (local Anvil, no real keys or gas) or **live on Atlantic testnet** (real PRIVATE_KEY + PHRS gas)?

- **demo** → `--network local` (no keys required, uses Anvil test accounts)
- **live / atlantic / testnet** → `--network atlantic` → go to Step 3 first

Never assume. Default to **demo** only if the user explicitly says "quick", "just show me", or "demo".

### Step 3 — Atlantic preflight (only if user chose live testnet)

Before sending any Atlantic transaction, confirm the required keys are present in `.env`:

1. **`PRIVATE_KEY`** — required (executor). Reject the run if missing.
2. For **multi-agent** runs (consensus, verifier signoff, "multiple agents"): check **`VERIFIER_B_PRIVATE_KEY`** and **`VERIFIER_C_PRIVATE_KEY`**.
   - Both set → independent verifier agents (best for real multi-agent proof).
   - Neither set → tell the user it will fall back to funded demo verifier wallets, and confirm that's OK.
   - Only one set → **stop**; the runner requires both or neither.
3. Confirm the three addresses are **distinct** and that the executor has PHRS for gas (`cast balance <addr> --rpc-url $RPC --ether`).

Quick check command (reads `.env` directly, no extra deps):

```bash
node -e "const fs=require('fs');const e=fs.existsSync('.env')?fs.readFileSync('.env','utf8'):'';['PRIVATE_KEY','VERIFIER_B_PRIVATE_KEY','VERIFIER_C_PRIVATE_KEY'].forEach(k=>console.log(k, new RegExp('^'+k+'=.+','m').test(e)?'set':'MISSING'))"
```

Report which keys are set/missing before proceeding, and only continue once the requirements above are met.

### Step 4 — Select & run the workflow

Pick the smallest thing that satisfies the decomposed tasks:

| Decomposed tasks | Command (`<net>` = `local` or `atlantic`) |
|------------------|-------------------------------------------|
| Balance + price → record (payment-style) | `npm run workflow -- --catalog payment --network <net>` |
| Multiple price fetches → consensus | `npm run workflow -- --template oracle-validation --oracle <TOKEN>/USD --network <net>` |
| Price + funding + order book → signal | `npm run workflow -- --template defi-market-signal --network <net>` |
| Wallet balance risk snapshot | `npm run workflow -- --template wallet-risk-snapshot --network <net>` |
| Verify URLs / sources by content hash | `npm run workflow -- --template research-url-verification --network <net>` |
| Mixed ad-hoc (e.g. "X price + my balance") | `npm run compose-dag -- --oracle <TOKEN>/USD --balance` then `npm run workflow -- --dag assets/dag-executor/generated/<file>.json --network <net>` |
| Something none of these cover | author DAG JSON per `references/dag-schema.md`, then `npm run workflow -- --dag <path> --network <net>` |

### Step 5 — Tokens: any symbol works

Pass the user's token straight through as `<SYMBOL>` or `<SYMBOL>/USD`. The resolver checks the local fast-path map first, then **looks the symbol up live in the Pyth Hermes catalog**, so tokens beyond ETH/BTC/USDC (e.g. `ARB`, `PEPE`, `LINK`, `SOL`) work without editing any file.

```bash
node assets/dag-executor/fetch-pyth-hermes.js ARB        # dynamic lookup
node assets/dag-executor/fetch-pyth-hermes.js PEPE/USD   # explicit pair
node assets/dag-executor/fetch-pyth-hermes.js 0x<feedId> # raw feed id override
```

If a symbol has no Pyth crypto feed, report that and suggest the closest matches the catalog returned (or ask for a raw `0x` feed id). For Pharos native **PHRS** there is no Pyth feed — use the native balance read instead.

### Step 6 — Verify

After any run, verify the on-chain evidence:

```bash
npm run verify-execution demo-workflow-<dagId>-<network>.json
```

### Worked example

> **User:** "Check the price of ARB and PEPE, snapshot my wallet, and prove it on-chain."

1. Decompose → 2 oracle prices (ARB, PEPE) + balance + on-chain record.
2. Ask: demo or live Atlantic? → user says "demo".
3. (skip — demo needs no keys)
4. Run: `npm run compose-dag -- --oracle ARB/USD --oracle PEPE/USD --balance` then `npm run workflow -- --dag assets/dag-executor/generated/custom.json --network local`
5. ARB/PEPE resolved live from Hermes.
6. `npm run verify-execution demo-workflow-custom-local.json`

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
