#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { castCall, ROOT } = require("./chain-utils");

async function main() {
  const args = process.argv.slice(2);
  let artifactPath = path.join(ROOT, "demo-sali-atlantic.json");
  if (args[0] && !args[0].startsWith("--")) {
    artifactPath = path.resolve(args[0]);
  }
  if (!fs.existsSync(artifactPath)) {
    const local = fs.readdirSync(ROOT).filter((f) => f.startsWith("demo-workflow-") && f.endsWith(".json"));
    artifactPath = local.length
      ? path.join(ROOT, local[local.length - 1])
      : path.join(ROOT, "demo-sali-local.json");
  }
  if (!fs.existsSync(artifactPath)) {
    throw new Error("No demo artifact found. Run demo:local or demo:atlantic first.");
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const rpcUrl =
    artifact.rpcUrl ||
    (artifact.network === "atlantic"
      ? JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", "atlantic.json"), "utf8")).rpcUrl
      : "http://127.0.0.1:8545");

  const { registry, executionId, layerHashes, resultHash } = artifact;

  console.log(`=== Verify execution ${executionId} ===`);
  console.log(`Network: ${artifact.network}`);
  console.log(`SALI Layer 0 parallel: ${artifact.saliMetrics?.layer0Parallel}`);

  let allPass = true;
  for (let i = 0; i < layerHashes.length; i++) {
    const onChain = castCall(
      registry,
      "layerHashes(bytes32,uint16)(bytes32)",
      [executionId, String(i)],
      rpcUrl
    ).trim();
    const expected = layerHashes[i];
    const match = onChain.toLowerCase() === expected.toLowerCase();
    console.log(`Layer ${i}: ${match ? "PASS" : "FAIL"}`);
    if (!match) {
      console.log(`  on-chain:  ${onChain}`);
      console.log(`  artifact:  ${expected}`);
      allPass = false;
    }
  }

  const getExec = castCall(
    registry,
    "getExecution(bytes32)((bytes32,bytes32,address,uint256,uint256,uint16,uint16,bool,bool))",
    [executionId],
    rpcUrl
  );
  const completed = /,\s*true,\s*false\s*\)\s*$/.test(getExec.trim());
  const resultOnChain = getExec.replace(/^\(|\)\s*$/g, "").split(",")[1]?.trim();
  const resultMatch = resultOnChain?.toLowerCase() === resultHash?.toLowerCase();

  console.log(`Completed: ${completed ? "PASS" : "FAIL"}`);
  console.log(`Result hash: ${resultMatch ? "PASS" : "FAIL"}`);
  console.log(`Overall: ${allPass && completed && resultMatch ? "PASS" : "FAIL"}`);

  process.exit(allPass && completed && resultMatch ? 0 : 1);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
