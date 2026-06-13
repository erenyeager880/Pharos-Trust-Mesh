#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { hashPythTaskOutput, hashLayer } = require("./hash-spec");

const PYTH_FEEDS_PATH = path.join(__dirname, "pyth-feeds.json");

function loadFeeds() {
  return JSON.parse(fs.readFileSync(PYTH_FEEDS_PATH, "utf8"));
}

function normalizeAlias(arg) {
  const trimmed = String(arg).trim();
  const upper = trimmed.toUpperCase();
  if (upper.includes("/")) return upper;
  const config = loadFeeds();
  if (config.aliases?.[upper]) return config.aliases[upper];
  if (upper.endsWith("USD")) return `${upper.replace(/USD$/, "")}/USD`;
  return `${upper}/USD`;
}

function resolveFeedId(arg) {
  const config = loadFeeds();
  if (arg.startsWith("0x")) return arg;
  const normalized = normalizeAlias(arg);
  const feedId = config.feeds[normalized] || config.feeds[arg];
  if (!feedId) {
    const known = Object.keys(config.feeds).join(", ");
    throw new Error(`Unknown feed alias: ${arg}. Known: ${known}. Or pass raw 0x feed_id`);
  }
  return feedId;
}

async function fetchPrice(feedIdOrAlias) {
  const config = loadFeeds();
  const feedId = resolveFeedId(feedIdOrAlias);
  const url = `${config.hermes_base}/v2/updates/price/latest?ids[]=${feedId}&parsed=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Hermes HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  const parsed = data.parsed?.[0]?.price;
  if (!parsed) throw new Error("Hermes returned no parsed price data");

  return {
    feedId,
    alias: feedIdOrAlias.startsWith("0x") ? null : feedIdOrAlias,
    price: parsed.price,
    conf: parsed.conf,
    expo: parsed.expo,
    publish_time: parsed.publish_time,
    humanPrice: Number(parsed.price) * Math.pow(10, parsed.expo),
  };
}

async function main() {
  const args = process.argv.slice(2);
  let feedArg = "ETH/USD";
  if (args[0] === "--feed" && args[1]) feedArg = args[1];
  else if (args[0]) feedArg = args[0];

  const out = await fetchPrice(feedArg);
  console.log("Pyth Hermes Price");
  console.log("─────────────────");
  console.log(`Feed:         ${out.alias || out.feedId}`);
  console.log(`Price:        ${out.price} (expo ${out.expo})`);
  console.log(`Human:        ~$${out.humanPrice.toFixed(2)}`);
  console.log(`Confidence:   ${out.conf}`);
  console.log(`Publish time: ${out.publish_time}`);
  console.log("");
  console.log(JSON.stringify(out));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { fetchPrice, hashPythTaskOutput, hashLayer, resolveFeedId };
