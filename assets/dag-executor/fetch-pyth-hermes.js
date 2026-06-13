#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { hashPythTaskOutput, hashLayer } = require("./hash-spec");

const PYTH_FEEDS_PATH = path.join(__dirname, "pyth-feeds.json");

// In-memory cache of dynamically resolved feeds so repeated lookups in one run
// (e.g. multiple oracle tasks in a DAG) don't re-hit the Hermes catalog.
const dynamicFeedCache = new Map();

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

// Static resolver — only checks the local pyth-feeds.json map. Kept synchronous
// for backward compatibility with existing callers.
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

// Look up an arbitrary token symbol in the live Pyth Hermes catalog.
// Works for any listed crypto feed (PEPE, ARB, LINK, ...), not just the
// hand-curated ones in pyth-feeds.json.
async function lookupFeedFromHermes(normalized, hermesBase) {
  if (dynamicFeedCache.has(normalized)) return dynamicFeedCache.get(normalized);

  const [base, quote = "USD"] = normalized.split("/");
  const url = `${hermesBase}/v2/price_feeds?query=${encodeURIComponent(base)}&asset_type=crypto`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Hermes catalog HTTP ${res.status}: ${res.statusText} while resolving ${normalized}`);
  }
  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`No Pyth crypto feed found for "${base}". Check the symbol or pass a raw 0x feed_id.`);
  }

  const wantBase = base.toUpperCase();
  const wantQuote = quote.toUpperCase();
  const match =
    list.find(
      (f) =>
        f?.attributes?.base?.toUpperCase() === wantBase &&
        f?.attributes?.quote_currency?.toUpperCase() === wantQuote
    ) ||
    // Fall back to any quote currency if the exact quote isn't listed.
    list.find((f) => f?.attributes?.base?.toUpperCase() === wantBase);

  if (!match?.id) {
    const sample = list
      .slice(0, 5)
      .map((f) => f?.attributes?.symbol)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `No exact Pyth feed for ${normalized}. Closest symbols: ${sample || "none"}. Pass a raw 0x feed_id to override.`
    );
  }

  const feedId = match.id.startsWith("0x") ? match.id : `0x${match.id}`;
  dynamicFeedCache.set(normalized, feedId);
  return feedId;
}

// Async resolver: static map first, then live Hermes catalog for any token.
async function resolveFeedIdAsync(arg, hermesBase) {
  if (String(arg).startsWith("0x")) return String(arg);
  const config = loadFeeds();
  const normalized = normalizeAlias(arg);
  const fromStatic = config.feeds[normalized] || config.feeds[arg];
  if (fromStatic) return fromStatic;
  return lookupFeedFromHermes(normalized, hermesBase || config.hermes_base);
}

async function fetchPrice(feedIdOrAlias) {
  const config = loadFeeds();
  const feedId = await resolveFeedIdAsync(feedIdOrAlias, config.hermes_base);
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
  console.log(`Feed ID:      ${out.feedId}`);
  console.log(`Price:        ${out.price} (expo ${out.expo})`);
  console.log(`Human:        ~$${out.humanPrice.toFixed(out.humanPrice < 1 ? 8 : 2)}`);
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

module.exports = {
  fetchPrice,
  hashPythTaskOutput,
  hashLayer,
  resolveFeedId,
  resolveFeedIdAsync,
  lookupFeedFromHermes,
};
