#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const script = path.join(__dirname, "run-workflow.js");
const result = spawnSync(process.execPath, [script, "--catalog", "payment", "--network", "atlantic"], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});
process.exit(result.status ?? 1);
