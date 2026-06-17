#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "SUBMISSION.md",
      "TEMPLATE_COMPLIANCE.md",
      "SKILL.md",
      "references/dag-executor.md",
      "references/testing.md",
      "references/script-gen.md",
      "references/transaction.md",
      "references/dag-schema.md",
      "references/contract.md",
      "references/query.md",
    ];

function norm(s) {
  return s
    .replace(/\u2014/g, " - ")
    .replace(/\u2192/g, "->")
    .replace(/\u00d7/g, "x")
    .replace(/\u2212/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2265/g, ">=")
    .replace(/\u2013/g, "-")
    .replace(/\u2500/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

for (const f of files) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) {
    console.warn(`skip missing: ${f}`);
    continue;
  }
  const orig = fs.readFileSync(p, "utf8");
  const next = norm(orig);
  if (orig !== next) fs.writeFileSync(p, next);
  console.log(`${f}: ${orig !== next ? "updated" : "ok"}`);
}
