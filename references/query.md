# Query Operation Instructions

> Network Configuration: `<rpc>` is read from `assets/networks.json` -> Atlantic `rpcUrl`.
> Private Key: Not required for read-only queries.

---

## Check Native PHRS Balance

### Overview

Returns the native PHRS balance for an address on Pharos.

### Command Template

```bash
cast balance <address> --rpc-url <rpc> --ether
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<address>` | string | Yes | Wallet address (`0x` + 40 hex chars) |
| `<rpc>` | string | Yes | From `assets/networks.json` -> `atlantic.rpcUrl` |

### Output Parsing

| Field | Description |
|-------|-------------|
| Balance | PHRS amount in ether units |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid address` | Malformed address | Use 42-char `0x` address |
| `connection refused` | Missing `--rpc-url` | Pass `--rpc-url` explicitly |

> **Agent Guidelines:**
> 1. Read `rpcUrl` from `assets/networks.json`
> 2. Execute `cast balance`
> 3. Report balance in PHRS

---

## Read Contract State

### Overview

Calls a view/pure function on a deployed contract.

### Command Template

```bash
cast call <contract> "<method()(<returns>)>" [args...] --rpc-url <rpc>
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<contract>` | string | Yes | Contract address |
| `<method>` | string | Yes | ABI signature e.g. `balanceOf(address)(uint256)` |
| `<rpc>` | string | Yes | Atlantic RPC URL |

### Output Parsing

| Field | Description |
|-------|-------------|
| Return value | Raw ABI-encoded result |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| Empty return value | No contract at address | Confirm address and network |

> **Agent Guidelines:**
> 1. Read RPC from `assets/networks.json`
> 2. Execute `cast call`
> 3. Parse return per method signature
