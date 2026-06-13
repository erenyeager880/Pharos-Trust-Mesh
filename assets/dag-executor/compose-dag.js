#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const TEMPLATES_DIR = path.join(__dirname, "templates");
const GENERATED_DIR = path.join(__dirname, "generated");

const TEMPLATE_MAP = {
  "oracle-validation": "oracle-validation-dag.json",
  "defi-market-signal": "defi-market-signal-dag.json",
  "wallet-risk-snapshot": "wallet-risk-snapshot-dag.json",
  "research-url-verification": "research-url-verification-dag.json",
};

function parseArgs(argv) {
  const out = {
    template: null,
    dagId: null,
    oracles: [],
    inputs: {},
    agents: {},
    balance: false,
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--template" && argv[i + 1]) out.template = argv[++i];
    else if (a === "--dag-id" && argv[i + 1]) out.dagId = argv[++i];
    else if (a === "--oracle" && argv[i + 1]) out.oracles.push(argv[++i]);
    else if (a === "--input" && argv[i + 1]) {
      const [k, ...rest] = argv[++i].split(":");
      out.inputs[k] = rest.join(":");
    } else if (a === "--agent" && argv[i + 1]) {
      const [role, id] = argv[++i].split(":");
      out.agents[role] = { id: id || role };
    } else if (a === "--balance") out.balance = true;
    else if (a === "--out" && argv[i + 1]) out.out = argv[++i];
  }
  return out;
}

function loadTemplate(name) {
  const file = TEMPLATE_MAP[name];
  if (!file) {
    throw new Error(`Unknown template: ${name}. Known: ${Object.keys(TEMPLATE_MAP).join(", ")}`);
  }
  const p = path.join(TEMPLATES_DIR, file);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function applyOracleAliases(dag, oracles) {
  if (!oracles.length) return;
  const primary = oracles[0];
  let idx = 0;
  for (const task of Object.values(dag.tasks)) {
    if (task.type === "oracle_offchain") {
      task.feed_alias = oracles[idx] || primary;
      delete task.feed_id;
      idx++;
    }
  }
}

function applyInputs(dag, inputs) {
  for (const task of Object.values(dag.tasks)) {
    if (task.input_key && inputs[task.input_key]) {
      if (task.type === "offchain_read") task.url = inputs[task.input_key];
      if (task.type === "evidence" && task.runner === "url_fetch_hash") {
        task.source_url = inputs[task.input_key];
      }
      if (task.type === "evidence" && task.runner === "text_evidence") {
        task.text = inputs[task.input_key];
      }
    }
  }
}

function buildCustomQuickDag(opts) {
  const tasks = {};
  const layer0 = [];

  for (const oracle of opts.oracles) {
    const id = `oracle_${oracle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`;
    tasks[id] = {
      type: "oracle_offchain",
      runner: "pyth_price",
      provider: "pyth_hermes",
      feed_alias: oracle,
      depends_on: [],
      output_key: id,
    };
    layer0.push(id);
  }

  if (opts.balance) {
    tasks.check_wallet_balance = {
      type: "read",
      runner: "native_balance",
      depends_on: [],
      output_key: "balance",
    };
    layer0.push("check_wallet_balance");
  }

  if (layer0.length === 0) throw new Error("Nothing to compose. Use --oracle and/or --balance");

  tasks.aggregate_checks = {
    type: "compute",
    runner: "aggregate",
    depends_on: [...layer0],
    output_key: "validated",
  };

  tasks.record_result = {
    type: "contract_call",
    runner: "simulated",
    depends_on: ["aggregate_checks"],
    output_key: "result",
  };

  return {
    dagId: opts.dagId || "custom",
    tasks,
  };
}

function composeDag(opts) {
  let dag;
  if (opts.template) {
    dag = loadTemplate(opts.template);
    applyOracleAliases(dag, opts.oracles);
    applyInputs(dag, opts.inputs);
    if (opts.dagId) dag.dagId = opts.dagId;
  } else if (opts.oracles.length || opts.balance) {
    dag = buildCustomQuickDag(opts);
  } else {
    throw new Error("Provide --template <name> or compose flags (--oracle, --balance)");
  }

  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const outPath =
    opts.out || path.join(GENERATED_DIR, `${dag.dagId || "workflow"}.json`);
  fs.writeFileSync(outPath, JSON.stringify(dag, null, 2));
  return { dag, outPath };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { dag, outPath } = composeDag(opts);
  console.log(`Composed DAG: ${dag.dagId}`);
  console.log(`Tasks: ${Object.keys(dag.tasks).length}`);
  console.log(`Written: ${outPath}`);
  console.log(JSON.stringify(dag));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { composeDag, loadTemplate, TEMPLATE_MAP };
