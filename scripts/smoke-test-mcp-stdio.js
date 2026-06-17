#!/usr/bin/env node
"use strict";

const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["mcp/server.js"],
    cwd: ROOT,
  });

  const client = new Client({ name: "mcp-smoke-client", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log("tools:", names.join(", "));

  const expected = [
    "compile_dag",
    "compose_custom_dag",
    "fetch_pyth_price",
    "list_workflows",
    "run_workflow_local",
    "verify_execution",
  ];
  for (const name of expected) {
    if (!names.includes(name)) throw new Error(`missing tool: ${name}`);
  }

  const listed = await client.callTool({ name: "list_workflows", arguments: {} });
  const text = listed.content?.find((c) => c.type === "text")?.text || "";
  if (!text.includes("payment")) throw new Error("list_workflows did not return payment");

  const price = await client.callTool({
    name: "fetch_pyth_price",
    arguments: { symbol: "ETH/USD" },
  });
  const priceText = price.content?.find((c) => c.type === "text")?.text || "";
  if (!priceText.includes("price")) throw new Error("fetch_pyth_price failed");

  console.log("stdio MCP protocol: OK");
  await client.close();
}

main().catch((err) => {
  console.error("stdio MCP test failed:", err.message);
  process.exit(1);
});
