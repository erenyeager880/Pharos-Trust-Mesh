#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { keccak256, toUtf8Bytes } = require("ethers");
const { HASH_SPEC_FIELDS } = require("./hash-spec");

const ROOT = path.resolve(__dirname, "../..");
const CATALOG_PATH = path.join(__dirname, "catalog.json");
const PYTH_FEEDS_PATH = path.join(__dirname, "pyth-feeds.json");
const SALI_LAYER_LIMIT = 10;

function canonicalizeTasks(tasks) {
  const sortedIds = Object.keys(tasks).sort();
  const out = {};
  for (const id of sortedIds) {
    const t = { ...tasks[id] };
    if (Array.isArray(t.depends_on)) {
      t.depends_on = [...t.depends_on].sort();
    }
    out[id] = t;
  }
  return out;
}

function computeDagHash(tasks) {
  const canonical = canonicalizeTasks(tasks);
  const payload = JSON.stringify({ tasks: canonical });
  return keccak256(toUtf8Bytes(payload));
}

function validateTasks(tasks) {
  const ids = Object.keys(tasks);
  if (ids.length === 0) throw new Error("DAG has no tasks");

  for (const id of ids) {
    const deps = tasks[id].depends_on || [];
    for (const dep of deps) {
      if (!tasks[dep]) {
        throw new Error(`Task "${id}" depends on unknown task "${dep}"`);
      }
    }
  }

  const inDegree = {};
  const adj = {};
  for (const id of ids) {
    inDegree[id] = 0;
    adj[id] = [];
  }
  for (const id of ids) {
    for (const dep of tasks[id].depends_on || []) {
      inDegree[id]++;
      adj[dep].push(id);
    }
  }

  const layers = [];
  let queue = ids.filter((id) => inDegree[id] === 0).sort();
  let visited = 0;

  while (queue.length > 0) {
    layers.push([...queue]);
    visited += queue.length;
    const next = [];
    for (const id of queue) {
      for (const child of adj[id]) {
        inDegree[child]--;
        if (inDegree[child] === 0) next.push(child);
      }
    }
    queue = next.sort();
  }

  if (visited !== ids.length) {
    throw new Error("Cyclic DAG detected — topological sort failed");
  }

  detectWriteConflicts(tasks, layers);
  return layers;
}

function detectWriteConflicts(tasks, layers) {
  for (const layer of layers) {
    const keys = new Map();
    for (const id of layer) {
      const wk = tasks[id].write_key;
      if (!wk) continue;
      if (keys.has(wk)) {
        throw new Error(
          `Write conflict in same layer: tasks "${keys.get(wk)}" and "${id}" share write_key "${wk}"`
        );
      }
      keys.set(wk, id);
    }
  }
}

function buildHashSpec(tasks, layerPlan) {
  return layerPlan.map((tasksInLayer, index) => ({
    index,
    tasks: tasksInLayer.map((taskId) => {
      const t = tasks[taskId];
      const spec = { taskId, type: t.type };
      const fields = HASH_SPEC_FIELDS[t.type];
      if (fields) spec.fields = fields;
      if (t.type === "oracle_offchain") spec.provider = t.provider;
      return spec;
    }),
  }));
}

function layerConflictFree(tasks, taskIds) {
  const writeContracts = new Map();
  for (const id of taskIds) {
    const t = tasks[id];
    if (t.write_key) {
      const key = `${t.contract || ""}:${t.write_key}`;
      if (writeContracts.has(key)) return false;
      writeContracts.set(key, id);
    }
  }
  const contractWrites = new Map();
  for (const id of taskIds) {
    const t = tasks[id];
    if (t.type === "contract_call" && t.contract) {
      const c = t.contract.toLowerCase();
      if (contractWrites.has(c)) return false;
      contractWrites.set(c, id);
    }
  }
  return true;
}

function buildSaliPlan(tasks, layerGroups) {
  return layerGroups.map((taskIds, layerIndex) => {
    const sorted = [...taskIds].sort();
    const offChain = sorted.filter((id) => {
      const t = tasks[id];
      return t.type === "oracle_offchain" || t.type === "compute";
    });
    const onChainReads = sorted.filter((id) => tasks[id].type === "read");
    const onChainWrites = sorted.filter((id) => tasks[id].type === "contract_call");
    const contracts = sorted
      .map((id) => tasks[id].contract)
      .filter((c) => c && !c.startsWith("0xMock"));
    const conflictFree = layerConflictFree(tasks, sorted);

    return {
      layerIndex,
      parallelTasks: sorted,
      executionMode: sorted.length > 1 && conflictFree ? "parallel" : "sequential",
      conflictFree,
      width: sorted.length,
      hints: {
        offChain,
        onChainReads,
        onChainWrites,
        contracts: [...new Set(sorted.map((id) => tasks[id].contract).filter(Boolean))],
      },
    };
  });
}

function compileDagFromObject(dag) {
  const tasks = dag.tasks;
  const layerGroups = validateTasks(tasks);
  const totalTasks = Object.keys(tasks).length;
  const layers = layerGroups.length;
  const maxParallel = Math.max(...layerGroups.map((g) => g.length), 1);
  const criticalPathLength = layers;
  const parallelismRatio =
    totalTasks > 0 ? 1 - criticalPathLength / totalTasks : 0;
  const estimatedGasSavingsPercent =
    totalTasks > 0 ? Math.round((1 - layers / totalTasks) * 100) : 0;
  const saliFriendly = layerGroups.every((g) => g.length <= SALI_LAYER_LIMIT);
  const dagHash = computeDagHash(tasks);
  const oracleTasks = Object.entries(tasks)
    .filter(([, t]) => t.type === "oracle_offchain")
    .map(([id]) => id);

  const layerPlan = layerGroups.map((taskIds, index) => ({
    index,
    tasks: taskIds,
    width: taskIds.length,
    ...(taskIds.some((id) => oracleTasks.includes(id))
      ? { oracleTasks: taskIds.filter((id) => oracleTasks.includes(id)) }
      : {}),
  }));

  return {
    dagHash,
    dagId: dag.dagId || null,
    layers,
    totalTasks,
    sequentialSteps: totalTasks,
    maxParallelTasks: maxParallel,
    parallelismRatio: Math.round(parallelismRatio * 100) / 100,
    criticalPathLength,
    estimatedGasSavingsPercent,
    sali_friendly: saliFriendly,
    layerPlan,
    hashSpec: buildHashSpec(tasks, layerGroups),
    saliPlan: buildSaliPlan(tasks, layerGroups),
    layerGroups,
    tasks,
  };
}

function printReport(result) {
  console.log("Workflow Optimization Report");
  console.log("────────────────────────────");
  console.log(`Original (sequential):  ${result.sequentialSteps} steps, ${result.sequentialSteps} serial rounds`);
  console.log(`Optimized (layered):    ${result.layers} layers, ${result.maxParallelTasks} max parallel tasks`);
  console.log(`Critical path:          ${result.criticalPathLength} steps`);
  console.log(`Parallelism gain:       ${result.estimatedGasSavingsPercent}%`);
  console.log(`Est. gas savings:       ~${result.estimatedGasSavingsPercent}% fewer submission rounds`);
  console.log(`SALI friendly:          ${result.sali_friendly ? "yes" : "no"}`);
  console.log("");
  for (const layer of result.layerPlan) {
    const label = layer.oracleTasks?.length
      ? ` (Pyth Hermes: ${layer.oracleTasks.join(", ")})`
      : "";
    console.log(`Layer ${layer.index}: ${layer.tasks.join(", ")}${label}`);
  }
  console.log("");
  console.log(`DAG hash: ${result.dagHash}`);
  console.log("");
  console.log(JSON.stringify(result));
}

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

function resolveCatalog(dagId) {
  const catalog = loadCatalog();
  const entry = catalog.workflows.find((w) => w.dagId === dagId);
  if (!entry) throw new Error(`Unknown catalog dagId: ${dagId}`);
  const filePath = path.join(__dirname, entry.file);
  const dag = JSON.parse(fs.readFileSync(filePath, "utf8"));
  dag.dagId = entry.dagId;
  return dag;
}

function listCatalog() {
  const catalog = loadCatalog();
  console.log("Canonical Workflows");
  console.log("───────────────────");
  for (const w of catalog.workflows) {
    console.log(`  ${w.dagId.padEnd(10)} ${w.name}`);
    console.log(`             file: ${w.file}`);
    if (w.dagHash) console.log(`             dagHash: ${w.dagHash}`);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--catalog") {
    if (!args[1]) {
      listCatalog();
      return;
    }
    const result = compileDagFromObject(resolveCatalog(args[1]));
    printReport(result);
    return;
  }

  const inputPath = args[0] || path.join(__dirname, "canonical/payment-dag.json");
  const abs = path.resolve(process.cwd(), inputPath);
  const dag = JSON.parse(fs.readFileSync(abs, "utf8"));
  const result = compileDagFromObject(dag);
  printReport(result);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  compileDagFromObject,
  computeDagHash,
  canonicalizeTasks,
  resolveCatalog,
  loadCatalog,
};
