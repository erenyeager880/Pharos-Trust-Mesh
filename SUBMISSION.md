# DoraHacks Submission — Pharos TrustMesh

## Project

**Pharos TrustMesh** — the trust mesh that lets agents verify and trust work performed by other agents on Pharos.

## What it does

- **DAG compiler** — topological sort, optimization report, canonical `dagHash`
- **Pyth Hermes** — off-chain oracle evidence bound into `layerHash`
- **DAGRegistry** — on-chain layer evidence, multi-agent approvals, verifier `verificationScore`
- **Five real-data workflows** — payment, oracle-validation, defi-market-signal, wallet-risk-snapshot, research-url-verification
- **Compose CLI** — `npm run compose-dag -- --oracle BTC/USD --balance`

## Live contract (Atlantic)

- **DAGRegistry:** [0x14Ae8fcfD157ddfaEdC7c03A24363EA63619EEA2](https://atlantic.pharosscan.xyz/address/0x14Ae8fcfD157ddfaEdC7c03A24363EA63619EEA2) (verified)
- **Deployer:** `0xE2b3B061Bb750676A09c91245faf1Ec708D78c92`

## Test suite

**32 Foundry unit tests** in `test/DAGRegistry.t.sol` cover the full `DAGRegistry` lifecycle:

```bash
npm install
forge build && forge test
```

Coverage includes registration, ordered layer completion, multi-agent approvals (`requiredApprovals = 2`), finalization, failure paths, canonical DAG publishing, and all documented revert strings. Captured output: `demo-output-forge-test.txt`.

**Integration verification** (off-chain evidence → on-chain anchors):

```bash
npm run verify-execution demo-workflow-payment-local.json
```

See [`references/testing.md`](references/testing.md) for the full matrix and CI checklist.

## Demo

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
npm run verify-execution demo-sali-atlantic.json
```

For real multi-agent testnet runs, set `VERIFIER_B_PRIVATE_KEY` and `VERIFIER_C_PRIVATE_KEY`. If omitted, the demo runner uses funded deterministic verifier wallets.

Demo transcript: `demo-output.txt`.
