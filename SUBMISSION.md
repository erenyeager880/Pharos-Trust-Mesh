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

- **DAGRegistry:** [0x4bC63A4350522074A174Fd1344b51cd00Cb95e7b](https://atlantic.pharosscan.xyz/address/0x4bC63A4350522074A174Fd1344b51cd00Cb95e7b) (verified)

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
```

For real multi-agent testnet runs, set `VERIFIER_B_PRIVATE_KEY` and `VERIFIER_C_PRIVATE_KEY`. If omitted, the demo runner uses funded deterministic verifier wallets.
