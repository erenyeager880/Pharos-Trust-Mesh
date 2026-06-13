#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { compileDagFromObject } = require("../assets/dag-executor/compile-dag.js");

const catalogPath = path.join(__dirname, "../assets/dag-executor/catalog.json");
const dagDir = path.join(__dirname, "../assets/dag-executor");

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

for (const workflow of catalog.workflows) {
  const dagPath = path.join(dagDir, workflow.file);
  const dag = JSON.parse(fs.readFileSync(dagPath, "utf8"));
  dag.dagId = workflow.dagId;
  const result = compileDagFromObject(dag);
  workflow.dagHash = result.dagHash;
  console.log(`${workflow.dagId}: ${result.dagHash}`);
}

fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log("Updated catalog.json");
