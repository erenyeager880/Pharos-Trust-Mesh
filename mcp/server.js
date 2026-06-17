#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const z = require("zod/v4");
const { loadCatalog, compileDagFromObject, resolveCatalog } = require("../assets/dag-executor/compile-dag");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;

function runNode(scriptRel, args = [], opts = {}) {
  const script = path.join(ROOT, scriptRel);
  const result = spawnSync(NODE, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    ...opts,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function textResult(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

const server = new McpServer({
  name: "pharos-trust-mesh",
  version: "0.1.0",
});

server.registerTool(
  "list_workflows",
  {
    description: "List canonical workflow catalog entries (dagId, name, file, dagHash).",
    inputSchema: {},
  },
  async () => {
    const catalog = loadCatalog();
    const lines = catalog.workflows.map(
      (w) => `${w.dagId}\t${w.name}\t${w.file}${w.dagHash ? `\t${w.dagHash}` : ""}`
    );
    return textResult(lines.join("\n") || "No workflows in catalog.");
  }
);

server.registerTool(
  "compile_dag",
  {
    description: "Compile a DAG JSON file or catalog dagId to layered plan and dagHash.",
    inputSchema: {
      dag_path: z.string().optional().describe("Path to DAG JSON file (relative to repo root or absolute)."),
      catalog_id: z.string().optional().describe("Catalog dagId (e.g. payment) instead of dag_path."),
    },
  },
  async ({ dag_path, catalog_id }) => {
    try {
      let dag;
      if (catalog_id) {
        dag = resolveCatalog(catalog_id);
      } else if (dag_path) {
        const abs = path.isAbsolute(dag_path) ? dag_path : path.join(ROOT, dag_path);
        dag = JSON.parse(fs.readFileSync(abs, "utf8"));
      } else {
        return textResult("Provide dag_path or catalog_id.", true);
      }
      const result = compileDagFromObject(dag);
      return textResult(JSON.stringify(result, null, 2));
    } catch (err) {
      return textResult(`Error: ${err.message}`, true);
    }
  }
);

server.registerTool(
  "run_workflow_local",
  {
    description: "Run a workflow on local Anvil (no PRIVATE_KEY). Writes demo-workflow-<dagId>-local.json.",
    inputSchema: {
      catalog: z.string().optional().describe("Catalog dagId (default: payment)."),
      template: z.string().optional().describe("Template id (oracle-validation, defi-market-signal, etc.)."),
      oracle: z.string().optional().describe("Oracle pair when using oracle-validation (e.g. BTC/USD)."),
      dag_path: z.string().optional().describe("Custom DAG JSON path when not using catalog/template."),
    },
  },
  async ({ catalog, template, oracle, dag_path }) => {
    const args = ["scripts/run-workflow.js", "--network", "local"];
    if (catalog) args.push("--catalog", catalog);
    else if (template) {
      args.push("--template", template);
      if (oracle) args.push("--oracle", oracle);
    } else if (dag_path) {
      args.push("--dag", dag_path);
    } else {
      args.push("--catalog", "payment");
    }
    const result = spawnSync(NODE, args, { cwd: ROOT, encoding: "utf8" });
    const out = [result.stdout, result.stderr].filter(Boolean).join("\n");
    return textResult(out || `Exit ${result.status}`, result.status !== 0);
  }
);

server.registerTool(
  "verify_execution",
  {
    description: "Verify on-chain layer hashes and result against a demo workflow artifact JSON.",
    inputSchema: {
      artifact_path: z
        .string()
        .describe("Artifact path (e.g. demo-workflow-payment-local.json)."),
    },
  },
  async ({ artifact_path }) => {
    const { status, stdout, stderr } = runNode("scripts/verify-execution.js", [artifact_path]);
    const out = [stdout, stderr].filter(Boolean).join("\n");
    return textResult(out || `Exit ${status}`, status !== 0);
  }
);

server.registerTool(
  "fetch_pyth_price",
  {
    description: "Fetch Pyth Hermes price for a symbol (e.g. BTC/USD, ETH, ARB).",
    inputSchema: {
      symbol: z.string().describe("Token symbol or pair (BTC/USD, ETH, etc.)."),
    },
  },
  async ({ symbol }) => {
    const { status, stdout, stderr } = runNode("assets/dag-executor/fetch-pyth-hermes.js", [symbol]);
    const out = [stdout, stderr].filter(Boolean).join("\n");
    return textResult(out || `Exit ${status}`, status !== 0);
  }
);

server.registerTool(
  "compose_custom_dag",
  {
    description: "Compose a custom DAG JSON from oracle pairs and optional balance read.",
    inputSchema: {
      oracles: z.array(z.string()).optional().describe('Oracle pairs, e.g. ["BTC/USD","ETH/USD"].'),
      balance: z.boolean().optional().describe("Include native PHRS balance read."),
      template: z.string().optional().describe("Base template id (optional)."),
      out: z.string().optional().describe("Output path under assets/dag-executor/generated/."),
    },
  },
  async ({ oracles = [], balance, template, out }) => {
    const args = [];
    if (template) args.push("--template", template);
    for (const o of oracles) args.push("--oracle", o);
    if (balance) args.push("--balance");
    if (out) args.push("--out", out);
    const { status, stdout, stderr } = runNode("assets/dag-executor/compose-dag.js", args);
    const outText = [stdout, stderr].filter(Boolean).join("\n");
    return textResult(outText || `Exit ${status}`, status !== 0);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`MCP server error: ${err.message}`);
  process.exit(1);
});
