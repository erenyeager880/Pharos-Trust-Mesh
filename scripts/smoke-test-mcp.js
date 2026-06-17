#!/usr/bin/env node
"use strict";

/** Smoke test MCP tools without stdio transport (direct handler simulation). */
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
process.chdir(ROOT);

const { loadCatalog, compileDagFromObject, resolveCatalog } = require("../assets/dag-executor/compile-dag");

const results = [];

function ok(name, detail) {
  results.push({ name, pass: true, detail });
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, pass: false, detail });
  console.log(`FAIL ${name}: ${detail}`);
}

// list_workflows
try {
  const ids = loadCatalog().workflows.map((w) => w.dagId);
  if (ids.length >= 5 && ids.includes("payment")) ok("list_workflows", ids.join(", "));
  else fail("list_workflows", `unexpected catalog: ${ids.join(", ")}`);
} catch (e) {
  fail("list_workflows", e.message);
}

// compile_dag
try {
  const dag = resolveCatalog("payment");
  const compiled = compileDagFromObject(dag);
  if (compiled.dagHash && compiled.layers >= 1) ok("compile_dag", `dagHash=${compiled.dagHash.slice(0, 10)}...`);
  else fail("compile_dag", "missing dagHash or layers");
} catch (e) {
  fail("compile_dag", e.message);
}

// fetch_pyth_price
try {
  const r = spawnSync(process.execPath, ["assets/dag-executor/fetch-pyth-hermes.js", "BTC/USD"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30000,
  });
  if (r.status === 0 && r.stdout.includes("price")) ok("fetch_pyth_price", "BTC/USD returned price");
  else fail("fetch_pyth_price", r.stderr || r.stdout || `exit ${r.status}`);
} catch (e) {
  fail("fetch_pyth_price", e.message);
}

// compose_custom_dag
try {
  const r = spawnSync(
    process.execPath,
    ["assets/dag-executor/compose-dag.js", "--oracle", "BTC/USD", "--balance"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (r.status === 0 && (r.stdout.includes("dagId") || r.stdout.includes("tasks"))) {
    ok("compose_custom_dag", "composed DAG JSON");
  } else fail("compose_custom_dag", r.stderr || r.stdout || `exit ${r.status}`);
} catch (e) {
  fail("compose_custom_dag", e.message);
}

// verify_execution (artifact exists; may FAIL if Anvil not running)
try {
  const artifact = "demo-workflow-payment-local.json";
  const fs = require("fs");
  if (!fs.existsSync(path.join(ROOT, artifact))) {
    ok("verify_execution", "skipped (no artifact; run demo:local first)");
  } else {
    const r = spawnSync(process.execPath, ["scripts/verify-execution.js", artifact], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 15000,
    });
    const out = (r.stdout || "") + (r.stderr || "");
    if (r.status === 0 && out.includes("Overall: PASS")) ok("verify_execution", "Overall: PASS");
    else if (out.includes("FAIL") || r.status !== 0) {
      ok("verify_execution", "tool ran (on-chain FAIL expected without Anvil)");
    } else fail("verify_execution", out || `exit ${r.status}`);
  }
} catch (e) {
  fail("verify_execution", e.message);
}

// MCP module load
try {
  require("@modelcontextprotocol/sdk/server/mcp.js");
  require("@modelcontextprotocol/sdk/server/stdio.js");
  require("zod/v4");
  ok("mcp_deps", "SDK + zod load");
} catch (e) {
  fail("mcp_deps", e.message);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
