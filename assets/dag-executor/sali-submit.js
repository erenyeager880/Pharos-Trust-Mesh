"use strict";

const { execSync } = require("child_process");

/**
 * Fire multiple cast send commands without waiting for each to mine (nonce pipeline).
 * Returns { txHashes, submitTimes }.
 */
function submitParallel(castPath, rpcUrl, privateKey, calls) {
  const submitTimes = [];
  const txHashes = [];

  for (const call of calls) {
    const t0 = Date.now();
    const cmd = `"${castPath}" send ${call.contract} "${call.sig}" ${call.args.join(" ")} --private-key ${privateKey} --rpc-url ${rpcUrl} --json`;
    const out = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const parsed = JSON.parse(out.trim());
    submitTimes.push({ label: call.label, submittedAt: t0, txHash: parsed.transactionHash });
    txHashes.push(parsed.transactionHash);
  }

  return { txHashes, submitTimes };
}

/**
 * Read block numbers for transaction hashes.
 */
function receiptBlocks(castPath, rpcUrl, txHashes) {
  return txHashes.map((hash) => {
    const out = execSync(`"${castPath}" receipt ${hash} --rpc-url ${rpcUrl} --json`, {
      encoding: "utf8",
    });
    const r = JSON.parse(out.trim());
    return { txHash: hash, blockNumber: parseInt(r.blockNumber, 16) };
  });
}

module.exports = { submitParallel, receiptBlocks };
