# Transaction Operation Instructions

> **Environment (set once before any command in this file):**
> ```bash
> export RPC=https://atlantic.dplabs-internal.com    # from assets/networks.json -> atlantic.rpcUrl
> export PRIVATE_KEY=0x...                           # your executor wallet key
> export EXPLORER=https://atlantic.pharosscan.xyz
> ```
> Explorer tx link: `$EXPLORER/tx/<transactionHash>`
>
> Network Configuration: `<rpc>` = `$RPC`. Private Key: pass explicitly via `--private-key $PRIVATE_KEY`.

---

## Send Native PHRS

### Overview

Transfers native PHRS to a recipient address.

### Command Template

```bash
cast send <recipient> --value <amount>ether --private-key $PRIVATE_KEY --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<recipient>` | string | Yes | Recipient address |
| `<amount>` | number | Yes | PHRS amount e.g. `0.1ether` |
| `--private-key` | string | Yes | `$PRIVATE_KEY` env var |
| `$RPC` | string | Yes | Atlantic RPC URL |

### Output Parsing

| Field | Description |
|-------|-------------|
| `transactionHash` | Use for explorer link: `$EXPLORER/tx/<transactionHash>` |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `insufficient funds` | Low balance | Check `cast balance` |
| `connection refused` | Missing RPC | Pass `--rpc-url $RPC` |

> **Agent Guidelines:**
> 1. Complete Write Operation Pre-checks (see SKILL.md)
> 2. Execute `cast send`
> 3. Show `$EXPLORER/tx/<txHash>`

---

## Call Contract Write Method

### Overview

Sends a transaction that calls a non-payable contract function.

### Command Template

```bash
cast send <contract> "<method(type)>" <arg> --private-key $PRIVATE_KEY --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<contract>` | string | Yes | Target contract |
| `<method>` | string | Yes | Function signature (no return-type suffix for `cast send`) |
| `<arg>` | varies | Varies | Encoded arguments |

### Output Parsing

| Field | Description |
|-------|-------------|
| `status` | `1` = success |
| `transactionHash` | `$EXPLORER/tx/<transactionHash>` |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `execution reverted` | Contract revert | Read revert reason |

> **Agent Guidelines:**
> 1. Complete Write Operation Pre-checks (see SKILL.md)
> 2. Execute `cast send`
> 3. Show `$EXPLORER/tx/<transactionHash>`
