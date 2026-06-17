# Trust Model and Assumptions

Pharos TrustMesh anchors **evidence hashes** on Pharos. It does not store full off-chain payloads on-chain. This document states what the system verifies, what stays off-chain, and what multi-agent approval does and does not guarantee.

---

## Verified on-chain

| Artifact | Meaning |
|----------|---------|
| `dagHash` | Canonical identity of the workflow (task graph) |
| `layerHash` (per layer) | Binding of task output hashes for that layer |
| `resultHash` | Final workflow result bound at finalize |
| Approval count | Number of distinct verifier wallets that called `approveExecution` |
| `verificationScore` | Cumulative on-chain score per verifier address |
| Execution state | `completed`, `failed`, `completedLayers`, timestamps |

Verifiers and integration tests re-read on-chain state via `layerHashes`, `getExecution`, and `verify-execution`.

---

## Off-chain (not stored on-chain)

- Raw Pyth Hermes prices, confidence, expo, publish time
- HTTP/API JSON from Binance and other endpoints
- URL/document content fetched for hashing
- Task runner logic in `task-runners.js` and `execute-layer.js`
- Full workflow artifact JSON (stored locally as `demo-workflow-*.json`)

Only **canonical hashes** derived from defined fields are submitted via `completeLayer`.

---

## Why hashes are enough for replay verification

Each task type declares a `hashSpec` (see `assets/dag-executor/hash-spec.js`). Verifiers:

1. Re-fetch off-chain evidence (Hermes, RPC, HTTP, URLs)
2. Recompute task output hashes using the same canonical field order
3. Recompute layer hashes (task IDs sorted alphabetically within the layer)
4. Compare to on-chain `layerHashes`

If any hash differs, verifiers must **not** call `approveExecution`. The contract never sees raw payloads - only commitments.

---

## Multi-agent approval: guarantees and limits

### Guarantees

- **Submitter cannot self-approve:** `approveExecution` reverts if `msg.sender == submitter`
- **Independent wallets:** Each approval must come from a distinct address
- **Threshold before finalize:** `finalizeExecution` requires `approvalCount >= requiredApprovals` (default 2)
- **Reputation:** Each successful approval increments the verifier's `verificationScore`

### Does not guarantee

- **Truth of external APIs:** If Hermes or a URL returns incorrect data, hashes still bind that incorrect data consistently
- **Verifier liveness:** Workflows can stall if verifiers never approve
- **Economic correctness:** Payment amounts and business logic are not audited by the registry
- **Privacy:** URL content and API responses are hashed off-chain; hashes may leak equality of content across runs
- **Ordering beyond layers:** Parallel tasks within a layer are independent; cross-layer order is enforced by the contract

---

## Local vs Atlantic

| Network | Registry | Trust note |
|---------|----------|------------|
| Local (Anvil) | Ephemeral deploy per demo | For judges and CI; not shared state |
| Atlantic testnet | [0xB825EAe9BA48B44374be0DD56EE701A0dF2A24E6](https://atlantic.pharosscan.xyz/address/0xB825EAe9BA48B44374be0DD56EE701A0dF2A24E6) | Persistent public audit trail |

See [`testing.md`](testing.md) for verification commands and [`dag-executor.md`](dag-executor.md) for hash formulas.
