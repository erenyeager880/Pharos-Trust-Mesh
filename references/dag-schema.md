# DAG Schema  -  Agent Authoring Guide

Agents compose multi-agent workflows as JSON DAGs. The compiler produces `saliPlan`, `hashSpec`, and `dagHash`. The executor runs tasks by **type + runner**, not by hardcoded task names.

## Shipped real-data workflows

| dagId | real evidence | example prompt |
|-------|---------------|----------------|
| `payment` | PHRS balance + Pyth ETH/USD | "Verify balance and price before payment" |
| `oracle-validation` | Nx Pyth price fetches + consensus | "Three agents fetch BTC/USD and compare hashes" |
| `defi-market-signal` | Pyth BTC/USD + Binance funding/book JSON | "Market signal from price, funding, liquidity" |
| `wallet-risk-snapshot` | PHRS native balance on RPC | "Snapshot wallet balance for risk evidence" |
| `research-url-verification` | Real URL fetches + content hashes | "Verify multiple source URLs by hash" |

```bash
npm run workflow -- --catalog payment --network local
npm run workflow -- --template oracle-validation --oracle BTC/USD --network local
npm run workflow -- --template defi-market-signal --network local
npm run compose-dag -- --oracle BTC/USD --balance
```

## Task types

| type | purpose | runners |
|------|---------|---------|
| `oracle_offchain` | Pyth Hermes price | `pyth_price` |
| `read` | On-chain read | `native_balance`, `eth_call` |
| `offchain_read` | HTTP/API JSON | `http_json` |
| `evidence` | URLs, documents | `url_fetch_hash`, `document_hash` |
| `compute` | Analysis / consensus | `aggregate`, `compute_signal`, `consensus_check` |
| `contract_call` | Result binding | `simulated`, `broadcast` |

## Custom DAG runners (advanced)

Custom DAGs via `--dag <path>` may use additional runners in `task-runners.js` (`kyc_flag`, `text_evidence`, `agent_signoff`, etc.). Shipped catalog workflows do **not** use mock KYC or placeholder agent text.

## Pyth feed aliases

`resolveFeedId` accepts raw `0x` feed IDs, aliases (`ETH/USD`, `BTC/USD`, `DOGE/USD`, `SOL/USD`), and short forms (`BTC`, `doge/usd`).

PHRS has no Pyth feed  -  use `native_balance` for on-chain PHRS evidence.

## Agent workflow

1. Map user prompt -> catalog or template
2. `compose-dag` or write JSON
3. `npm run workflow -- --template <id>` or `--catalog payment`
4. `npm run verify-execution demo-workflow-<dagId>-local.json`

See [`references/dag-executor.md`](dag-executor.md) for hash formulas.
