# Transaction Operation Instructions

> Network Configuration: `<rpc>` is read from `assets/networks.json`.
> Private Key: Pass explicitly via `--private-key $PRIVATE_KEY`.

---

## Send Native PHRS

### Overview

Transfers native PHRS to a recipient address.

### Command Template

```bash
cast send <recipient> --value <amount>ether --private-key $PRIVATE_KEY --rpc-url <rpc>
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<recipient>` | string | Yes | Recipient address |
| `<amount>` | number | Yes | PHRS amount e.g. `0.1ether` |
| `--private-key` | string | Yes | `$PRIVATE_KEY` env var |
| `<rpc>` | string | Yes | Atlantic RPC URL |

### Output Parsing

| Field | Description |
|-------|-------------|
| `transactionHash` | Use for explorer link |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `insufficient funds` | Low balance | Check `cast balance` |
| `connection refused` | Missing RPC | Pass `--rpc-url` |

> **Agent Guidelines:**
> 1. Complete Write Operation Pre-checks (see SKILL.md)
> 2. Execute `cast send`
> 3. Show `<explorerUrl>/tx/<txHash>`

---

## Call Contract Write Method

### Overview

Sends a transaction that calls a non-payable contract function.

### Command Template

```bash
cast send <contract> "<method(type)>" <arg> --private-key $PRIVATE_KEY --rpc-url <rpc>
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<contract>` | string | Yes | Target contract |
| `<method>` | string | Yes | Function signature |
| `<arg>` | varies | Varies | Encoded arguments |

### Output Parsing

| Field | Description |
|-------|-------------|
| `status` | `1` = success |
| `transactionHash` | Explorer lookup |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `execution reverted` | Contract revert | Read revert reason |

> **Agent Guidelines:**
> 1. Complete Write Operation Pre-checks (see SKILL.md)
> 2. Execute `cast send`
> 3. Show explorer transaction link
