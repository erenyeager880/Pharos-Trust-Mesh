# DAG Executor Operation Instructions

> Network Configuration: `<rpc>`, `chainId`, and `explorerUrl` from `assets/networks.json` → Atlantic.
> Private Key: Pass explicitly via `--private-key $PRIVATE_KEY` for all write operations.
>
> Atlantic defaults: RPC `https://atlantic.dplabs-internal.com`, chain ID `688689`, explorer `https://atlantic.pharosscan.xyz`.
> Payment DAG `dagHash`: `0xbe898bd57dac5a3cfc6628951dfa811396c023bf396a28cb73a49a6c6c866e91`.

---

## Shared environment and registry validation

Set once before any command in this file:

```bash
export RPC=https://atlantic.dplabs-internal.com    # assets/networks.json → atlantic.rpcUrl
export EXPLORER=https://atlantic.pharosscan.xyz
export PRIVATE_KEY=0x...                           # executor / submitter key
# Atlantic DAGRegistry — from deployments/atlantic.json → DAGRegistry.address
export REGISTRY=0x14Ae8fcfD157ddfaEdC7c03A24363EA63619EEA2
```

Local Anvil (`--network local`) uses a freshly deployed registry (default `0x5FbDB2315678afecb367f032d93F642f64180aa3`). **Never use the Anvil address on Atlantic** — transactions will succeed against the wrong contract with no error.

**Validate `$REGISTRY` before every write:**

```bash
RESULT=$(cast call $REGISTRY "requiredApprovals()(uint16)" --rpc-url $RPC 2>&1)
echo "$RESULT" | grep -qE '^[0-9]+$' || { echo "REGISTRY not found or wrong network"; exit 1; }
```

**Terminal-state pre-check** (required before `completeLayer`, `approveExecution`, `finalizeExecution`, and `failExecution` when `$EXECUTION_ID` is already set):

```bash
STATE=$(cast call $REGISTRY \
  "getExecution(bytes32)((bytes32,bytes32,address,uint256,uint256,uint16,uint16,bool,bool))" \
  $EXECUTION_ID --rpc-url $RPC)
# Tuple fields (0-indexed): 5=totalLayers, 6=completedLayers, 7=completed, 8=failed
# Abort if completed==true or failed==true unless you intend a terminal read-only query.
echo "$STATE"
```

Explorer tx link: `$EXPLORER/tx/<transactionHash>`

### Event topic0 hashes (indexed log filtering)

| Event | topic0 (`cast keccak "<signature>"`) |
|-------|--------------------------------------|
| `ExecutionRegistered(bytes32,bytes32,address,uint16)` | `0x8166bb75f747b87b590b2d1e79be2ea0658c51a25f74a1eeac1fa4f2765f65bc` |
| `LayerCompleted(bytes32,uint16,bytes32)` | `0x392257d0cc9c00491d57ead8c794828942d16b685529b6672d03a63de799c6ec` |
| `ExecutionApproved(bytes32,address)` | `0xbb969c206831a5429b009ea44845d2a6e033b04f88d67bdf2e203dcf4152993f` |
| `ExecutionFinalized(bytes32,bytes32)` | `0x2f891a3973d8185f684a7c6461505e16f58de43df7761ca73d2ae41ff49b05ff` |
| `ExecutionFailed(bytes32)` | `0xabfd711ecdd15ae3a6b3ad16ff2e9d81aec026a39d16725ee164be4fbf857a7c` |
| `CanonicalDagPublished(bytes32,string)` | `0x6af2f393bb1cf443ffe80177eb10cf72c7ccfb3381c86014283dfab835b01501` |

Indexed topics: `ExecutionRegistered` → topic1=`executionId`, topic2=`dagHash`, topic3=`submitter`. `LayerCompleted` → topic1=`executionId`. Filter with `--topic1 $EXECUTION_ID`.

---

## compile-dag

### Overview

Compiles a workflow DAG JSON into a layered execution plan, computes `dagHash`, and emits `hashSpec` for per-layer hashing. Validates acyclic dependencies, write-key conflicts, and SALI layer limits.

### Command Template

```bash
# Compile a local DAG file (default: canonical/payment-dag.json)
node assets/dag-executor/compile-dag.js [path/to/dag.json]

# Compile a catalog workflow by dagId
node assets/dag-executor/compile-dag.js --catalog payment
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `[path]` | string | No | DAG JSON path; defaults to `assets/dag-executor/canonical/payment-dag.json` |
| `--catalog` | flag | No | Use catalog entry instead of file path |
| `<dagId>` | string | With `--catalog` | Catalog ID: `payment` |

### Output Parsing

| Field | Description |
|-------|-------------|
| `dagHash` | `keccak256(JSON.stringify({ tasks: canonicalTasks }))` — workflow identity |
| `layers` | Number of topological layers |
| `layerPlan` | Per-layer task lists and oracle hints |
| `hashSpec` | Per-layer task hash field requirements |
| `layerGroups` | Raw topological layer groupings |
| Trailing JSON | Full machine-readable result object |

**Layer hash formula:** `layerHash = keccak256(abi.encode(uint16 layerIndex, bytes32[] taskOutputHashes))`. Task hashes must be ordered by task execution order within the layer per `hashSpec`.

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `DAG has no tasks` | Empty tasks object | Add at least one task |
| `depends on unknown task` | Invalid dependency | Fix `depends_on` references |
| `Cyclic DAG detected` | Circular deps | Remove cycle |
| `Write conflict in same layer` | Duplicate `write_key` in one layer | Reschedule or rename keys |
| `Unknown catalog dagId` | Bad `--catalog` arg | Run `--catalog` without ID to list |

### Agent Guidelines

1. Run `compile-dag` before any on-chain registration to obtain `dagHash` and `layers` (total layer count).
2. Save `hashSpec` — it defines which fields each task type must include when computing task output hashes.
3. For payment DAG, expect `dagHash` `0xbe898bd57dac5a3cfc6628951dfa811396c023bf396a28cb73a49a6c6c866e91` and 3 layers.
4. Use `layerPlan` to drive sequential `completeLayer` calls (index 0 … N−1).
5. Capture compile output as shell variables (trailing JSON line is always machine-readable):

```bash
COMPILE_OUT=$(node assets/dag-executor/compile-dag.js --catalog payment | tail -1)
DAG_HASH=$(node -e "const d=JSON.parse(process.argv[1]);process.stdout.write(d.dagHash)" "$COMPILE_OUT")
TOTAL_LAYERS=$(node -e "const d=JSON.parse(process.argv[1]);process.stdout.write(String(d.layers))" "$COMPILE_OUT")
echo "dagHash=$DAG_HASH layers=$TOTAL_LAYERS"
```

---

## fetch-pyth-hermes

### Overview

Fetches latest Pyth Hermes price data for oracle tasks. Output fields feed Pyth task hash computation per `hashSpec`.

### Command Template

```bash
node assets/dag-executor/fetch-pyth-hermes.js ETH/USD

# Or explicit feed flag / raw feed ID
node assets/dag-executor/fetch-pyth-hermes.js --feed BTC/USD
node assets/dag-executor/fetch-pyth-hermes.js 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `<alias>` | string | No | Feed alias: `ETH/USD`, `BTC/USD`, `USDC/USD` (default `ETH/USD`) |
| `--feed` | flag + value | No | Explicit feed alias or `0x` feed ID |

### Output Parsing

| Field | Description |
|-------|-------------|
| `feedId` | Pyth feed ID (`bytes32`) |
| `price` | Raw price (`int64`) |
| `conf` | Confidence interval (`uint64`) |
| `expo` | Price exponent (`int32`) |
| `publish_time` | Publish timestamp (`uint64`) — use as `publishTime` in hash |
| `humanPrice` | Human-readable USD estimate |

**Pyth task hash:** `keccak256(abi.encode(string taskId, bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime))` using Hermes values.

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown feed alias` | Unmapped alias | Use aliases from `pyth-feeds.json` or raw feed ID |
| `Hermes HTTP 4xx/5xx` | Network/API failure | Retry; check `hermes_base` in `pyth-feeds.json` |
| `Hermes returned no parsed price data` | Empty response | Verify feed ID is active |

### Agent Guidelines

1. Call before hashing oracle layers that include `type: oracle_offchain`, `provider: pyth_hermes`.
2. Use exact Hermes `price`, `conf`, `expo`, `publish_time` — do not round or substitute mock values.
3. Compute per-task hash with `hashPythTaskOutput` logic from `fetch-pyth-hermes.js`.
4. Combine task hashes into layer hash via `keccak256(abi.encode(layerIndex, taskOutputHashes[]))`.

---

## catalog-lookup

### Overview

Lists or resolves canonical workflow definitions from `assets/dag-executor/catalog.json`. Shortcut for known DAG templates with precomputed `dagHash` values.

### Command Template

```bash
# List all catalog workflows
node assets/dag-executor/compile-dag.js --catalog

# Compile a specific catalog entry
node assets/dag-executor/compile-dag.js --catalog payment
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--catalog` | flag | Yes | Enable catalog mode |
| `<dagId>` | string | No | Omit to list; provide to compile (`payment`, `oracle-validation`, `defi-market-signal`, `wallet-risk-snapshot`, `research-url-verification`) |

### Output Parsing

| Field | Description |
|-------|-------------|
| `dagId` | Catalog identifier |
| `name` | Human-readable workflow name |
| `file` | Relative path under `assets/dag-executor/` |
| `dagHash` | Precomputed hash (verify matches compile output) |

Catalog entries (see `assets/dag-executor/catalog.json` for current `dagHash` values):

| dagId | type |
|-------|------|
| `payment` | canonical |
| `oracle-validation` | template |
| `defi-market-signal` | template |
| `wallet-risk-snapshot` | template |
| `research-url-verification` | template |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown catalog dagId` | Invalid ID | List catalog with `--catalog` alone |
| File read error | Missing canonical JSON | Restore file from repo |

### Agent Guidelines

1. Prefer catalog workflows for demos and cross-agent scenarios — hashes are stable.
2. List catalog first when user asks "what workflows exist".
3. Compile chosen entry to obtain `layers` count for `registerExecution`.
4. Confirm compiled `dagHash` matches catalog `dagHash` before on-chain use.

---

## deploy-dagregistry

### Overview

Deploys `DAGRegistry` to Atlantic via Foundry broadcast. Constructor sets `requiredApprovals = 2`.

### Command Template

```bash
forge script script/DeployDAGRegistry.s.sol:DeployDAGRegistry \
  --rpc-url $RPC \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$RPC` | string | Yes | Atlantic RPC from `networks.json` → `atlantic.rpcUrl` |
| `--private-key` | string | Yes | `$PRIVATE_KEY` env var |
| `--broadcast` | flag | Yes | Submit deployment transaction |

### Output Parsing

| Field | Description |
|-------|-------------|
| `Registry address:` | Deployed `DAGRegistry` — save as `$REGISTRY` |
| `Required approvals:` | `2` (minimum approvers before finalize) |
| `Deployer:` | Deployer address |
| `transactionHash` | Deployment tx for explorer |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `insufficient funds` | Low PHRS balance | Fund wallet via faucet |
| `compiler error` | Build failure | Run `forge build` first |
| `connection refused` | Bad RPC | Use Atlantic RPC URL |

### Agent Guidelines

1. Complete Write Operation Pre-checks (see SKILL.md)
2. Run `forge build` from project root
3. Execute deploy script with `$PRIVATE_KEY` and Atlantic RPC
4. Save `$REGISTRY` address from console output
5. Show `https://atlantic.pharosscan.xyz/address/<registryAddress>`

---

## verify-dagregistry

### Overview

Verifies deployed `DAGRegistry` source on Pharos Scan. Wait for indexer before submitting.

### Command Template

```bash
sleep 10
forge verify-contract $REGISTRY src/dag-executor/DAGRegistry.sol:DAGRegistry \
  --chain-id 688689 \
  --verifier-url https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer/command_api/contract \
  --verifier blockscout \
  --constructor-args $(cast abi-encode "constructor(uint16)" 2)
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$REGISTRY` | string | Yes | Deployed contract address |
| `--chain-id` | number | Yes | `688689` (Atlantic) |
| `--verifier-url` | string | Yes | From `networks.json` → `atlantic.explorerApiUrl` |
| `--constructor-args` | bytes | Yes | ABI-encoded `uint16(2)` for `requiredApprovals` |

### Output Parsing

| Field | Description |
|-------|-------------|
| Verification success message | Contract marked verified on explorer |
| Explorer link | Confirms source match |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `contract not found` | Indexer delay | Increase `sleep` to 15s and retry |
| `already verified` | Prior verification | Safe to ignore |
| Constructor mismatch | Wrong args | Encode `constructor(uint16)` with value `2` |

### Agent Guidelines

1. Wait `sleep 10` after deploy before verifying
2. Use chain ID `688689` and Blockscout verifier URL from `networks.json`
3. Pass constructor args encoding `requiredApprovals = 2`
4. Confirm verified badge at `https://atlantic.pharosscan.xyz/address/$REGISTRY`

---

## register-execution

### Overview

Starts a new on-chain execution record for a compiled DAG. Returns `executionId` derived from `dagHash`, submitter, and nonce.

### Command Template

```bash
cast send $REGISTRY "registerExecution(bytes32,uint16)" \
  $DAG_HASH $TOTAL_LAYERS \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC
```

`cast send` does not decode return data — obtain `executionId` from the `ExecutionRegistered` event (see Agent Guidelines).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$REGISTRY` | string | Yes | Deployed DAGRegistry address |
| `$DAG_HASH` | bytes32 | Yes | From `compile-dag` (e.g. payment hash above) |
| `$TOTAL_LAYERS` | uint16 | Yes | Layer count from compile output |
| `--private-key` | string | Yes | Submitter wallet |
| `$RPC` | string | Yes | Atlantic RPC |

### Output Parsing

| Field | Description |
|-------|-------------|
| `transactionHash` | Registration tx — save as `$TX` |
| `ExecutionRegistered` event | topic0 `0x8166bb75…`, topic1 = `executionId`, topic2 = `dagHash`, topic3 = `submitter`; data = `totalLayers` |
| Return value | `executionId = keccak256(abi.encodePacked(dagHash, msg.sender, nonces[sender]++))` — **not** available from `cast send`; parse from logs |

Extract `executionId` from the receipt:

```bash
TX=$(cast send $REGISTRY "registerExecution(bytes32,uint16)" \
  $DAG_HASH $TOTAL_LAYERS \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC \
  --json | jq -r '.transactionHash')

# topic1 of ExecutionRegistered = executionId (indexed)
EXECUTION_ID=$(cast receipt $TX --rpc-url $RPC --json \
  | jq -r '.logs[] | select(.topics[0] == "0x8166bb75f747b87b590b2d1e79be2ea0658c51a25f74a1eeac1fa4f2765f65bc") | .topics[1]')
echo "executionId=$EXECUTION_ID"
```

Alternative (filter logs by registry address):

```bash
cast logs --from-block latest --address $REGISTRY \
  "ExecutionRegistered(bytes32,bytes32,address,uint16)" \
  --rpc-url $RPC | tail -1
```

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Zero layers` | `totalLayers == 0` | Pass correct layer count from compile |
| `Execution exists` | Duplicate executionId collision | Extremely rare; increment occurs via nonce — retry |
| `insufficient funds` | Low gas balance | Fund submitter wallet |

### Agent Guidelines

0. Validate `$REGISTRY` (see [Shared environment and registry validation](#shared-environment-and-registry-validation)).
1. Complete Write Operation Pre-checks (see SKILL.md)
2. Compile DAG first; assign `DAG_HASH` and `TOTAL_LAYERS` via the shell capture pattern in [compile-dag](#compile-dag)
3. Execute `cast send registerExecution` (no return-type suffix on the signature)
4. Extract `executionId` from `ExecutionRegistered` event topic1 (commands above)
5. Show `$EXPLORER/tx/<transactionHash>`

---

## complete-layer

### Overview

Submitter records a completed layer hash on-chain. Layers must be submitted sequentially starting at index 0.

### Command Template

```bash
cast send $REGISTRY "completeLayer(bytes32,uint16,bytes32)" \
  $EXECUTION_ID $LAYER_INDEX $LAYER_HASH \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$EXECUTION_ID` | bytes32 | Yes | From `registerExecution` |
| `$LAYER_INDEX` | uint16 | Yes | Must equal current `completedLayers` (0-based) |
| `$LAYER_HASH` | bytes32 | Yes | `keccak256(abi.encode(layerIndex, taskOutputHashes[]))` |
| `--private-key` | string | Yes | Submitter wallet only |

### Output Parsing

| Field | Description |
|-------|-------------|
| `LayerCompleted` event | Confirms `executionId`, `layerIndex`, `layerHash` |
| `transactionHash` | Layer submission tx |

Verify progress: `cast call $REGISTRY "getExecution(bytes32)((bytes32,bytes32,address,uint256,uint256,uint16,uint16,bool,bool))" $EXECUTION_ID` — check `completedLayers` incremented.

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Execution not found` | Invalid `$EXECUTION_ID` | Re-register or verify ID from event |
| `Not submitter` | Wrong signer | Use original submitter key |
| `Already completed` | Execution finalized | Cannot add layers after finalize |
| `Execution failed` | Execution marked failed | Register new execution |
| `Zero layer hash` | `layerHash == 0x0` | Compute valid hash from task outputs |
| `Layer out of order` | Skipped index | Submit next expected index only |

### Agent Guidelines

0. Validate `$REGISTRY` and run terminal-state pre-check on `$EXECUTION_ID` (see [Shared environment](#shared-environment-and-registry-validation)). Abort if `failed == true` or `completed == true`.
1. Complete Write Operation Pre-checks (see SKILL.md)
2. Compute `$LAYER_HASH` per layer using `hashSpec` and task output hashes (Pyth: use Hermes fields)
3. Submit layers in order: 0, 1, … until `completedLayers == totalLayers`. **Re-read `getExecution` after any external `failExecution`** — abort the loop if `failed` becomes true.
4. Confirm each layer via `getExecution` or `layerHashes` mapping
5. Show `$EXPLORER/tx/<transactionHash>`

---

## approve-execution

### Overview

External verifier approves an in-progress execution. Each approval increments the approver's `verificationScore`. Finalize requires ≥ `requiredApprovals` (default 2).

### Command Template

```bash
cast send $REGISTRY "approveExecution(bytes32)" \
  $EXECUTION_ID \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$REGISTRY` | string | Yes | DAGRegistry address |
| `$EXECUTION_ID` | bytes32 | Yes | Target execution |
| `--private-key` | string | Yes | Verifier wallet (not submitter) |

### Output Parsing

| Field | Description |
|-------|-------------|
| `ExecutionApproved` event | `executionId`, `approver` address |
| `transactionHash` | Approval tx |

Check progress: `cast call $REGISTRY "approvalCount(bytes32)(uint16)" $EXECUTION_ID`

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Execution not found` | Bad execution ID | Verify ID from registration event |
| `Already completed` | Execution finalized | Approvals no longer accepted |
| `Cannot approve failed` | Execution was failed | Cannot approve failed runs |
| `Already approved` | Same verifier twice | Each address approves at most once |

### Agent Guidelines

0. Validate `$REGISTRY` and run terminal-state pre-check on `$EXECUTION_ID`. Abort if `failed == true` or `completed == true`.
1. Complete Write Operation Pre-checks (see SKILL.md)
2. For each layer index `0 … N−1`, independently verify evidence before approving:
   - **Oracle tasks:** `node assets/dag-executor/fetch-pyth-hermes.js <SYMBOL>/USD` — use `feedId`, `price`, `conf`, `expo`, `publish_time` per `hashSpec`
   - **Compute task hash** per [Task hash encodings](#task-hash-encodings-all-types) (must match `assets/dag-executor/hash-spec.js` exactly)
   - **Layer hash:** sort task IDs alphabetically within the layer, then `hashLayer(index, [taskHash…])` via `assets/dag-executor/hash-spec.js`
   - **Compare on-chain:** `cast call $REGISTRY "layerHashes(bytes32,uint16)(bytes32)" $EXECUTION_ID <index> --rpc-url $RPC`
   - If any hash differs → **do not** call `approveExecution`; report mismatch
3. Execute `approveExecution` only after all layer hashes match
4. Ensure `approvalCount >= requiredApprovals` (2) before submitter finalizes
5. Show `$EXPLORER/tx/<transactionHash>`

> **Security:** The contract does not prevent the submitter from approving with a wallet they also control. A submitter can satisfy the approval threshold using two distinct keys they own. For production trust guarantees, verifier wallets must be independently owned. `VERIFIER_B_PRIVATE_KEY` / `VERIFIER_C_PRIVATE_KEY` in `.env` do not enforce key independence — that is the operator's responsibility.

---

## finalize-execution

### Overview

Submitter finalizes a fully layered, sufficiently approved execution with a result hash.

### Command Template

```bash
cast send $REGISTRY "finalizeExecution(bytes32,bytes32)" \
  $EXECUTION_ID $RESULT_HASH \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$EXECUTION_ID` | bytes32 | Yes | Target execution |
| `$RESULT_HASH` | bytes32 | Yes | Hash of final workflow output |
| `--private-key` | string | Yes | Original submitter wallet |

### Output Parsing

| Field | Description |
|-------|-------------|
| `ExecutionFinalized` event | `executionId`, `resultHash` |
| `getExecution` after tx | `completed = true`, `endBlock` set, `resultHash` populated |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Execution not found` | Invalid ID | Verify execution exists |
| `Not submitter` | Wrong signer | Use submitter key |
| `Already completed` | Duplicate finalize | Idempotent — already done |
| `Cannot finalize failed` | Execution marked failed | Start new execution |
| `Layers incomplete` | `completedLayers < totalLayers` | Complete remaining layers |
| `Insufficient approvals` | `approvalCount < requiredApprovals` | Collect more verifier approvals |

### Agent Guidelines

0. Validate `$REGISTRY` and run terminal-state pre-check on `$EXECUTION_ID`. Abort if `failed == true` or `completed == true`.
1. Complete Write Operation Pre-checks (see SKILL.md)
2. Pre-finalize state check (all must pass before step 4):

```bash
STATE=$(cast call $REGISTRY \
  "getExecution(bytes32)((bytes32,bytes32,address,uint256,uint256,uint16,uint16,bool,bool))" \
  $EXECUTION_ID --rpc-url $RPC)
# Verify: completedLayers (field 6) == totalLayers (field 5), completed (field 7) == false, failed (field 8) == false

APPROVALS=$(cast call $REGISTRY "approvalCount(bytes32)(uint16)" $EXECUTION_ID --rpc-url $RPC)
# Verify: APPROVALS >= 2 (or registry requiredApprovals)
echo "state=$STATE approvals=$APPROVALS"
```

3. Compute `$RESULT_HASH` from final task output
4. Execute `finalizeExecution` as submitter only when step 2 passes
5. Show `$EXPLORER/tx/<transactionHash>`

---

## fail-execution

### Overview

Submitter marks an execution as failed, blocking further layer submissions, approvals, and finalization.

### Command Template

```bash
cast send $REGISTRY "failExecution(bytes32)" \
  $EXECUTION_ID \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$EXECUTION_ID` | bytes32 | Yes | Execution to fail |
| `--private-key` | string | Yes | Submitter wallet |

### Output Parsing

| Field | Description |
|-------|-------------|
| `ExecutionFailed` event | Confirms failed status |
| `getExecution` | `failed = true`, `endBlock` set |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Execution not found` | Invalid ID | Verify execution ID |
| `Not submitter` | Wrong signer | Use submitter key |
| `Already completed` | Already finalized | Cannot fail completed execution |
| `Execution failed` | Already marked failed | Idempotent — no action needed |

### Agent Guidelines

0. Validate `$REGISTRY` and run terminal-state pre-check on `$EXECUTION_ID`. Abort if `completed == true` (already finalized).
1. Complete Write Operation Pre-checks (see SKILL.md)
2. Use when workflow cannot complete (oracle failure, task error, timeout)
3. Execute `failExecution` as submitter
4. Inform verifiers the execution is terminal — no further `completeLayer` or `approveExecution` calls possible
5. Show `$EXPLORER/tx/<transactionHash>`

---

## get-execution

### Overview

Reads full execution state from `DAGRegistry` — DAG hash, progress, completion flags, and timestamps.

### Command Template

```bash
cast call $REGISTRY \
  "getExecution(bytes32)((bytes32,bytes32,address,uint256,uint256,uint16,uint16,bool,bool))" \
  $EXECUTION_ID \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$REGISTRY` | string | Yes | DAGRegistry address |
| `$EXECUTION_ID` | bytes32 | Yes | Execution to query |
| `$RPC` | string | Yes | Atlantic RPC |

### Output Parsing

| Index | Field | Description |
|-------|-------|-------------|
| 0 | `dagHash` | Registered workflow hash |
| 1 | `resultHash` | Final result (zero until finalized) |
| 2 | `submitter` | Executor address |
| 3 | `startBlock` | Registration block |
| 4 | `endBlock` | Finalize/fail block (0 if active) |
| 5 | `totalLayers` | Expected layer count |
| 6 | `completedLayers` | Layers submitted so far |
| 7 | `completed` | Finalized flag |
| 8 | `failed` | Failed flag |

Empty record (`submitter == 0x0`) means execution not found.

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| Empty/zero submitter | Execution does not exist | Verify `$EXECUTION_ID` |
| `connection refused` | Missing RPC | Pass `--rpc-url` |

### Agent Guidelines

1. Read RPC from `assets/networks.json`
2. Query before and after each write to track progress
3. Compare `completedLayers` to `totalLayers` to determine remaining work
4. Report status: active, completed, or failed

---

## get-layer-hash

### Overview

Reads the on-chain hash stored for a specific layer index. Used by verifiers to compare against independently computed hashes.

### Command Template

```bash
cast call $REGISTRY "layerHashes(bytes32,uint16)(bytes32)" \
  $EXECUTION_ID $LAYER_INDEX \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$EXECUTION_ID` | bytes32 | Yes | Target execution |
| `$LAYER_INDEX` | uint16 | Yes | Zero-based layer index |
| `$RPC` | string | Yes | Atlantic RPC |

### Output Parsing

| Field | Description |
|-------|-------------|
| Return value | Stored `layerHash` (`bytes32`) |
| `0x0` | Layer not yet submitted |

Alternative getter: `getLayerHash(bytes32,uint16)(bytes32)` — equivalent to public mapping.

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| Zero hash returned | Layer not completed yet | Wait for submitter's `completeLayer` |
| RPC error | Network issue | Retry with Atlantic RPC |

### Agent Guidelines

1. For each layer in `hashSpec`, recompute expected hash off-chain
2. Query on-chain hash via `layerHashes` mapping
3. Flag mismatch — do not call `approveExecution` if hashes differ
4. Iterate layers 0 … `totalLayers - 1` during verification

---

## cross-agent-verification

### Overview

Multi-agent workflow where independent verifiers validate layer evidence off-chain, then sign approval on-chain. Requires `requiredApprovals = 2` distinct approvers before finalize.

### Command Template

```bash
# Step 1 — Verifier reads execution state
cast call $REGISTRY \
  "getExecution(bytes32)((bytes32,bytes32,address,uint256,uint256,uint16,uint16,bool,bool))" \
  $EXECUTION_ID --rpc-url $RPC

# Step 2 — Verifier checks each layer hash
cast call $REGISTRY "layerHashes(bytes32,uint16)(bytes32)" \
  $EXECUTION_ID $LAYER_INDEX --rpc-url $RPC

# Step 3 — Verifier checks approval progress
cast call $REGISTRY "approvalCount(bytes32)(uint16)" \
  $EXECUTION_ID --rpc-url $RPC

# Step 4 — Verifier approves (separate wallet per agent)
cast send $REGISTRY "approveExecution(bytes32)" \
  $EXECUTION_ID \
  --private-key $VERIFIER_PRIVATE_KEY \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$EXECUTION_ID` | bytes32 | Yes | Shared execution under review |
| `$LAYER_INDEX` | uint16 | Yes | Layer being verified |
| `$VERIFIER_PRIVATE_KEY` | string | Yes | Each verifier's unique key |
| `$REGISTRY` | string | Yes | DAGRegistry address |

### Output Parsing

| Field | Description |
|-------|-------------|
| Layer hash match | Off-chain computed == on-chain `layerHashes` |
| `approvalCount` | Current approver count toward threshold of 2 |
| `ExecutionApproved` events | One per distinct verifier |
| `verificationScore` | Increments per successful approval |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| Hash mismatch | Incorrect task outputs or Pyth fields | Recompute using `hashSpec`; reject approval |
| `Already approved` | Same verifier re-approving | Use distinct verifier wallets |
| `Cannot approve failed` | Execution failed | Abort verification |
| `Insufficient approvals` at finalize | < 2 approvers | Collect remaining approvals |

### Agent Guidelines

1. Verifier agent: independently fetch Pyth data and recompute all layer hashes (see [approve-execution](#approve-execution) step 2)
2. Compare each on-chain `layerHashes` entry against local computation
3. Only approve when all submitted layers match and execution is not failed
4. Coordinate two **independently owned** verifier wallets — the same address cannot approve twice, but the submitter may approve from other keys they control (see security note in approve-execution)
5. Confirm `approvalCount >= 2` before notifying submitter to finalize

---

## get-verification-score

### Overview

Returns cumulative on-chain verification score for an address — incremented each time the address successfully calls `approveExecution`.

### Command Template

```bash
cast call $REGISTRY "verificationScore(address)(uint256)" \
  $VERIFIER_ADDRESS \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$REGISTRY` | string | Yes | DAGRegistry address |
| `$VERIFIER_ADDRESS` | string | Yes | Verifier wallet to query |
| `$RPC` | string | Yes | Atlantic RPC |

### Output Parsing

| Field | Description |
|-------|-------------|
| Return value | Total successful approvals by this address |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| Zero score | Address never approved | Expected for submitters/non-verifiers |
| RPC failure | Network issue | Retry with Atlantic RPC |

### Agent Guidelines

1. Query verifier reputation after approval workflows
2. Submitter score stays 0 — only approvers accumulate score
3. Use score to rank trusted verifier agents over time

---

## publish-canonical-dag

### Overview

Publishes a human-readable name for a canonical DAG hash on-chain. One name per hash; irreversible once set.

### Command Template

```bash
cast send $REGISTRY "publishCanonicalDag(bytes32,string)" \
  $DAG_HASH "payment" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$DAG_HASH` | bytes32 | Yes | Canonical workflow hash |
| `"name"` | string | Yes | Display name (e.g. `payment`, `kyc`) |
| `--private-key` | string | Yes | Publisher wallet |
| `$RPC` | string | Yes | Atlantic RPC |

### Output Parsing

| Field | Description |
|-------|-------------|
| `CanonicalDagPublished` event | `dagHash`, `name` |
| `canonicalDagNames(dagHash)` | Returns stored name string |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `DAG already published` | Name already set for hash | Query existing name; cannot overwrite |
| `insufficient funds` | Low gas | Fund wallet |

### Agent Guidelines

0. Validate `$REGISTRY` (see [Shared environment](#shared-environment-and-registry-validation)).
1. Complete Write Operation Pre-checks (see SKILL.md)
2. Use catalog `dagHash` values — e.g. payment hash `0xbe898bd57dac5a3cfc6628951dfa811396c023bf396a28cb73a49a6c6c866e91`
3. Execute `publishCanonicalDag` once per canonical workflow
4. Verify name via `cast call $REGISTRY "canonicalDagNames(bytes32)(string)" $DAG_HASH`
5. Show `$EXPLORER/tx/<transactionHash>`

---

## query-events

### Overview

Queries `DAGRegistry` event logs for execution lifecycle auditing via `cast logs`.

### Command Template

```bash
# All ExecutionRegistered events for registry
cast logs --from-block 0 --address $REGISTRY \
  "ExecutionRegistered(bytes32,bytes32,address,uint16)" \
  --rpc-url $RPC

# Layer completions for a specific execution (filter topic1 = executionId)
cast logs --from-block 0 --address $REGISTRY \
  "LayerCompleted(bytes32,uint16,bytes32)" \
  --topic1 $EXECUTION_ID \
  --rpc-url $RPC

# All LayerCompleted events (unfiltered — use only for registry-wide audit)
cast logs --from-block 0 --address $REGISTRY \
  "LayerCompleted(bytes32,uint16,bytes32)" \
  --rpc-url $RPC

# Approvals
cast logs --from-block 0 --address $REGISTRY \
  "ExecutionApproved(bytes32,address)" \
  --rpc-url $RPC

# Finalization
cast logs --from-block 0 --address $REGISTRY \
  "ExecutionFinalized(bytes32,bytes32)" \
  --rpc-url $RPC

# Failures
cast logs --from-block 0 --address $REGISTRY \
  "ExecutionFailed(bytes32)" \
  --rpc-url $RPC

# Canonical DAG publishing
cast logs --from-block 0 --address $REGISTRY \
  "CanonicalDagPublished(bytes32,string)" \
  --rpc-url $RPC
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$REGISTRY` | string | Yes | DAGRegistry contract address |
| `--from-block` | number | Yes | Start block (use deploy block or `0`) |
| Event signature | string | Yes | One of the six registry events |
| `$RPC` | string | Yes | Atlantic RPC |

### Output Parsing

| Event | topic0 | Indexed topics | Data |
|-------|--------|----------------|------|
| `ExecutionRegistered` | `0x8166bb75f747b87b590b2d1e79be2ea0658c51a25f74a1eeac1fa4f2765f65bc` | topic1=`executionId`, topic2=`dagHash`, topic3=`submitter` | `totalLayers` |
| `LayerCompleted` | `0x392257d0cc9c00491d57ead8c794828942d16b685529b6672d03a63de799c6ec` | topic1=`executionId` | `layerIndex`, `layerHash` |
| `ExecutionApproved` | `0xbb969c206831a5429b009ea44845d2a6e033b04f88d67bdf2e203dcf4152993f` | topic1=`executionId`, topic2=`approver` | — |
| `ExecutionFinalized` | `0x2f891a3973d8185f684a7c6461505e16f58de43df7761ca73d2ae41ff49b05ff` | topic1=`executionId` | `resultHash` |
| `ExecutionFailed` | `0xabfd711ecdd15ae3a6b3ad16ff2e9d81aec026a39d16725ee164be4fbf857a7c` | topic1=`executionId` | — |
| `CanonicalDagPublished` | `0x6af2f393bb1cf443ffe80177eb10cf72c7ccfb3381c86014283dfab835b01501` | topic1=`dagHash` | `name` |

Recompute any topic0: `cast keccak "EventName(types…)"`. When parsing raw `eth_getLogs` without Foundry, match `topics[0]` to topic0 and filter execution-scoped events with `topics[1] == $EXECUTION_ID`.

Use `--to-block`, `--from-block`, and `--topic1` filters to narrow results. Parse `executionId` from `ExecutionRegistered` topic1 when `cast send` return data is unavailable (see [register-execution](#register-execution)).

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| Empty log set | Wrong address or block range | Confirm `$REGISTRY` and widen block range |
| RPC timeout | Large block range | Narrow `--from-block` to deploy block |
| Invalid signature | Typo in event name | Match ABI exactly |

### Agent Guidelines

1. Read RPC from `assets/networks.json`
2. After `registerExecution`, parse `ExecutionRegistered` to obtain `executionId`
3. Monitor `LayerCompleted` and `ExecutionApproved` during multi-agent workflows
4. Use `ExecutionFinalized` or `ExecutionFailed` to determine terminal state
5. Link events to explorer: `https://atlantic.pharosscan.xyz/tx/<transactionHash>`

---

## Task hash encodings (all types)

Canonical task output hashes (must match `assets/dag-executor/hash-spec.js` exactly):

| Task type | Formula |
|-----------|---------|
| `oracle_offchain` / `pyth_hermes` | `keccak256(abi.encode(string taskId, bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime))` |
| `read` | `keccak256(abi.encode(string taskId, address contract, bytes callResult))` where `callResult` bytes are: raw `0x` hex if `callResult` is already hex-prefixed; otherwise `zeroPad32(uint256(callResult))` (see `hashReadTaskOutput` in `hash-spec.js`) |
| `offchain_read` | `keccak256(abi.encode(string taskId, string url, bytes32 payloadHash))` |
| `evidence` | `keccak256(abi.encode(string taskId, bytes32 contentHash))` |
| `agent_work` | `keccak256(abi.encode(string taskId, string agentId, string role, bytes32 outputHash, uint64 timestamp))` |
| `compute` | `keccak256(abi.encode(string taskId, bytes32 inputsHash))` where `inputsHash = keccak256(abi.encode(bytes32[] depHashes))` |
| `contract_call` | `keccak256(abi.encode(string taskId, bytes32 txHash))` |

**Layer hash:** `keccak256(abi.encode(uint16 layerIndex, bytes32[] taskOutputHashes))` — task hashes **sorted alphabetically by `taskId`** within each layer (see `compute-layer-hash.js`).

---

## run-workflow

### Overview

Unified CLI for catalog DAGs, use-case templates, and custom DAG files. Compiles, executes all layers via generic task runners, registers on `DAGRegistry`, completes lifecycle (layers + approvals + finalize), and writes `demo-workflow-<dagId>-<network>.json`.

### Command Template

```bash
npm run workflow -- --catalog payment --network local
npm run workflow -- --template oracle-validation --oracle BTC/USD --network local
npm run workflow -- --template defi-market-signal --network local
npm run workflow -- --dag path/to/my-dag.json --network local
npm run compose-dag -- --oracle BTC/USD --balance
```

See [`dag-schema.md`](dag-schema.md) for task types, runners, and user-prompt mapping.

### Agent Guidelines

1. List workflows: `node assets/dag-executor/compile-dag.js --catalog`
2. Prefer `--catalog payment` or `--template` for real-data workflows
3. Verify immediately after local run (Anvil state): `npm run verify-execution demo-workflow-<dagId>-local.json`
4. Use `--no-anvil` only when Anvil is already running with the same registry

---

## execute-layer

### Overview

Runs DAG layers per `saliPlan` from compile output. Parallel layers use `Promise.all`; sequential layers run one task at a time. Produces real `layerHashes` for `completeLayer`.

### Command Template

```bash
node assets/dag-executor/execute-layer.js --catalog payment --network local
node assets/dag-executor/execute-layer.js --catalog payment --network atlantic
npm run demo:local
npm run demo:atlantic
```

### SALI metrics (output JSON)

| Field | Description |
|-------|-------------|
| `saliMetrics.layer0Parallel` | `true` when Layer 0 ran via `Promise.all` |
| `saliMetrics.layer0Width` | Number of parallel tasks in Layer 0 |
| `saliMetrics.layer0BatchMs` | Wall-clock ms for parallel batch |
| `layerTimings` | Per-task `startedAt` / `finishedAt` for proof |

---

## verify-execution

### Overview

Cross-agent verification: compares on-chain `layerHashes` and `getExecution` state to a demo artifact (`demo-sali-atlantic.json`, `demo-workflow-*-local.json`, or `demo-sali-local.json`).

### Command Template

```bash
npm run verify-execution
npm run verify-execution demo-sali-atlantic.json
npm run verify-execution demo-workflow-payment-local.json
npm run verify-execution demo-workflow-oracle-validation-local.json
```

### Output

Prints `PASS`/`FAIL` per layer hash, `completed`, and `resultHash`. Exit code `0` when all match.

---

## forge-test

### Overview

Runs Foundry unit tests for `DAGRegistry.sol`. Validates lifecycle transitions, access control, verifier scoring, and every documented revert string.

### Command Template

```bash
forge build
forge test
forge test -vvv
forge test --match-test finalize
```

### Output Parsing

| Field | Description |
|-------|-------------|
| `Suite result: ok` | All tests passed |
| `[PASS] test_*` | Individual test name and gas |
| Exit code `0` | Success |

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `forge: command not found` | Foundry not installed | Install Foundry |
| `Compiler run failed` | Solidity error | Run `forge build` and fix compile errors |
| `[FAIL]` | Assertion or revert mismatch | Run `forge test -vvv` for trace |

### Agent Guidelines

1. Run `forge test` after any change to `src/dag-executor/DAGRegistry.sol` or `test/DAGRegistry.t.sol`.
2. Expect **32 tests** in `test/DAGRegistry.t.sol` (captured in `demo-output-forge-test.txt`).
3. If a revert string changes in the contract, update error tables in this file **and** tests in `DAGRegistry.t.sol`.
4. Full coverage matrix: → [`references/testing.md`](testing.md).
