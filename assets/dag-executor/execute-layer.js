#!/usr/bin/env node
"use strict";

const { ethers } = require("ethers");
const { runTask } = require("./task-runners");
const { computeLayerHashes } = require("./compute-layer-hash");

async function executeLayer(layerPlan, tasks, ctx) {
  const { parallelTasks, executionMode } = layerPlan;
  const timings = [];

  const runOne = async (taskId) => {
    const t0 = Date.now();
    const { output, meta } = await runTask(taskId, tasks[taskId], ctx);
    ctx.taskOutputs[taskId] = { output, meta };
    timings.push({
      taskId,
      startedAt: meta.startedAt,
      finishedAt: meta.finishedAt,
      durationMs: meta.finishedAt - t0,
      runner: meta.runner,
    });
  };

  if (executionMode === "parallel" && parallelTasks.length > 1) {
    const batchStart = Date.now();
    await Promise.all(parallelTasks.map(runOne));
    timings.push({
      batch: true,
      layerIndex: layerPlan.layerIndex,
      batchDurationMs: Date.now() - batchStart,
    });
  } else {
    for (const taskId of parallelTasks) {
      await runOne(taskId);
    }
  }

  return timings;
}

async function executeWorkflow(compileResult, ctx = {}) {
  const tasks = compileResult.tasks;
  const taskOutputs = {};
  const innerCtx = {
    rpcUrl: ctx.rpcUrl || "http://127.0.0.1:8545",
    deployer: ctx.deployer,
    recipient: ctx.recipient,
    kycVerified: ctx.kycVerified,
    minBalanceWei: ctx.minBalanceWei,
    paymentAmountWei: ctx.paymentAmountWei,
    inputs: ctx.inputs || {},
    agents: ctx.agents || {},
    agentTexts: ctx.agentTexts || {},
    taskOutputs,
  };

  const layerTimings = [];
  for (const layerPlan of compileResult.saliPlan) {
    const timings = await executeLayer(layerPlan, tasks, innerCtx);
    layerTimings.push({ layerIndex: layerPlan.layerIndex, timings });
  }

  const hashInputs = {};
  for (const [taskId, entry] of Object.entries(taskOutputs)) {
    if (tasks[taskId].type !== "compute") {
      hashInputs[taskId] = entry.output;
    }
  }

  const { layerHashes, taskHashes } = computeLayerHashes(compileResult, tasks, hashInputs);

  const lastLayer = compileResult.layerGroups[compileResult.layerGroups.length - 1];
  const finalTaskId = lastLayer[lastLayer.length - 1];
  const resultHash = taskHashes[finalTaskId];

  return {
    layerHashes,
    taskHashes,
    taskOutputs: hashInputs,
    resultHash,
    layerTimings,
    saliMetrics: {
      layer0Parallel: compileResult.saliPlan[0]?.executionMode === "parallel",
      layer0Width: compileResult.saliPlan[0]?.width || 0,
      layer0BatchMs: layerTimings[0]?.timings?.find((t) => t.batch)?.batchDurationMs,
    },
  };
}

async function main() {
  const { compileDagFromObject, resolveCatalog } = require("./compile-dag");
  const args = process.argv.slice(2);
  const network = args.includes("--network") ? args[args.indexOf("--network") + 1] : "local";
  const rpcUrl =
    network === "atlantic"
      ? process.env.RPC_URL || "https://atlantic.dplabs-internal.com"
      : process.env.RPC || "http://127.0.0.1:8545";

  const catalog = args.includes("--catalog") ? args[args.indexOf("--catalog") + 1] || "payment" : "payment";
  const compileResult = compileDagFromObject(resolveCatalog(catalog));

  let deployer = process.env.DEPLOYER;
  if (!deployer && process.env.PRIVATE_KEY) {
    deployer = new ethers.Wallet(process.env.PRIVATE_KEY).address;
  }
  if (!deployer) deployer = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  const result = await executeWorkflow(compileResult, { rpcUrl, deployer, inputs: {} });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { executeLayer, executeWorkflow };
