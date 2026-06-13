# Contract Operation Instructions

> Network Configuration: `<rpc>` and `chainId` from `assets/networks.json`.
> Private Key: Pass explicitly via `--private-key $PRIVATE_KEY`.

---

## Deploy Contract via Forge Script

### Overview

Deploys a Solidity contract using a Foundry broadcast script.

### Command Template

```bash
forge script script/<Script>.s.sol:<Script> \
  --rpc-url <rpc> \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<Script>` | string | Yes | Script contract name |
| `<rpc>` | string | Yes | Atlantic `rpcUrl` |
| `--private-key` | string | Yes | `$PRIVATE_KEY` |

### Output Parsing

| Field | Description |
|-------|-------------|
| `Registry address:` / logged address | Deployed contract — save for future calls |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `insufficient funds` | Low gas balance | Fund wallet with testnet PHRS |
| `compiler error` | Build failed | Run `forge build` |

> **Agent Guidelines:**
> 1. Complete Write Operation Pre-checks (see SKILL.md)
> 2. Run `forge build`
> 3. Execute `forge script` with broadcast
> 4. Show `<explorerUrl>/address/<address>`

---

## Verify Contract on Pharos Scan

### Overview

Submits source code to the block explorer for verification.

### Command Template

```bash
sleep 10
forge verify-contract <address> src/<path>:<Contract> \
  --chain-id <chainId> \
  --verifier-url <explorerApiUrl> \
  --verifier blockscout
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<address>` | string | Yes | Deployed contract |
| `<chainId>` | number | Yes | `688689` for Atlantic |
| `<explorerApiUrl>` | string | Yes | From `networks.json` |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `contract not found` | Indexer delay | Wait 10–15s and retry |

> **Agent Guidelines:**
> 1. Wait `sleep 10` after deploy
> 2. Run `forge verify-contract`
> 3. Confirm verified badge on explorer
