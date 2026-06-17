# DoraHacks Submission - Pharos TrustMesh

## Project

**Pharos TrustMesh** - the trust mesh that lets agents verify and trust work performed by other agents on Pharos.

Pharos TrustMesh is a reusable Agent Skill that lets AI agents compile, execute, verify, and anchor multi-step workflows on Pharos using real evidence hashes.

## Judge Quickstart (5 min)

```bash
npm install
forge build
forge test
npm run demo:local
npm run verify-execution demo-workflow-payment-local.json
```

**Success:** `33 passed` from forge; verify-execution prints `Overall: PASS`; artifact `demo-workflow-payment-local.json` is written with on-chain `executionId`, `layerHashes`, and `resultHash` anchored on local `DAGRegistry`.

**Live contract (Atlantic):** [DAGRegistry on PharosScan](https://atlantic.pharosscan.xyz/address/0xB825EAe9BA48B44374be0DD56EE701A0dF2A24E6)

Architecture: User Prompt -> Skill Router -> DAG Compiler -> Evidence Runners -> DAGRegistry -> Verifiers -> Result Hash (see README mermaid diagram).

Trust assumptions: [`references/trust-model.md`](references/trust-model.md)

## What it does

- **DAG compiler** - topological sort, optimization report, canonical `dagHash`
- **Pyth Hermes** - off-chain oracle evidence bound into `layerHash`
- **DAGRegistry** - on-chain layer evidence, multi-agent approvals, verifier `verificationScore`
- **Five real-data workflows** - payment, oracle-validation, defi-market-signal, wallet-risk-snapshot, research-url-verification
- **Compose CLI** - `npm run compose-dag -- --oracle BTC/USD --balance`
- **MCP tools** - agent-callable wrappers with full tool reference in [`mcp/README.md`](mcp/README.md) (`npm run mcp:start`)

## Live contract (Atlantic)

- **DAGRegistry:** [0xB825EAe9BA48B44374be0DD56EE701A0dF2A24E6](https://atlantic.pharosscan.xyz/address/0xB825EAe9BA48B44374be0DD56EE701A0dF2A24E6) (verified). Details: `deployments/atlantic.json`

## Test suite

**33 Foundry unit tests** in `test/DAGRegistry.t.sol` cover the full `DAGRegistry` lifecycle:

```bash
npm install
forge build && forge test
```

Coverage includes registration, ordered layer completion, multi-agent approvals (`requiredApprovals = 2`), submitter approval guard, finalization, failure paths, canonical DAG publishing, and all documented revert strings. Captured output: `demo-output-forge-test.txt`.

**Integration verification** (off-chain evidence -> on-chain anchors):

```bash
npm run verify-execution demo-workflow-payment-local.json
npm run verify-execution demo-workflow-payment-atlantic.json
```

See [`references/testing.md`](references/testing.md) for the full matrix and CI workflow.

## Full demo

```bash
npm install && forge test
npm run demo:local
npm run workflow -- --template oracle-validation --oracle BTC/USD --network local
npm run workflow -- --template defi-market-signal --network local
npm run workflow -- --template wallet-risk-snapshot --network local
npm run workflow -- --template research-url-verification --network local
npm run verify-execution demo-workflow-payment-local.json
```

Atlantic (requires `PRIVATE_KEY` in `.env`; optional independent verifier keys are supported):

```bash
npm run demo:atlantic
npm run verify-execution demo-workflow-payment-atlantic.json
npm run verify-execution demo-sali-atlantic.json
```

For real multi-agent testnet runs, set `VERIFIER_B_PRIVATE_KEY` and `VERIFIER_C_PRIVATE_KEY`. If omitted, the demo runner uses funded deterministic verifier wallets.

Demo transcript: `demo-output.txt`.
