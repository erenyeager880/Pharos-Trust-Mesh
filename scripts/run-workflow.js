#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { compileDagFromObject, resolveCatalog } = require("../assets/dag-executor/compile-dag");
const { composeDag } = require("../assets/dag-executor/compose-dag");
const { executeWorkflow } = require("../assets/dag-executor/execute-layer");
const {
  ROOT,
  startAnvil,
  deployRegistry,
  walletFromMnemonic,
  walletAddress,
  registerExecution,
  completeLifecycle,
  castCall,
  fundAddress,
} = require("./chain-utils");

const ATLANTIC_MIN_EXECUTOR_WEI = ethers.parseEther("0.01");
const ATLANTIC_MIN_VERIFIER_WEI = ethers.parseEther("0.001");

function parseArgs(argv) {
  const out = {
    template: null,
    catalog: null,
    dag: null,
    network: "local",
    executeOnly: false,
    composeArgs: [],
    skipAnvil: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--template" && argv[i + 1]) out.template = argv[++i];
    else if (a === "--catalog" && argv[i + 1]) out.catalog = argv[++i];
    else if (a === "--dag" && argv[i + 1]) out.dag = argv[++i];
    else if (a === "--network" && argv[i + 1]) out.network = argv[++i];
    else if (a === "--execute-only") out.executeOnly = true;
    else if (a === "--no-anvil") out.skipAnvil = true;
    else if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out.composeArgs.push(a, argv[++i]);
      } else {
        out.composeArgs.push(a);
      }
    }
  }
  return out;
}

function parseComposeFromOpts(opts) {
  const composeOpts = {
    template: opts.template,
    dagId: null,
    oracles: [],
    inputs: {},
    agents: {},
    balance: false,
    out: null,
  };
  const args = opts.composeArgs;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--oracle" && args[i + 1]) composeOpts.oracles.push(args[++i]);
    else if (a === "--input" && args[i + 1]) {
      const [k, ...rest] = args[++i].split(":");
      composeOpts.inputs[k] = rest.join(":");
    } else if (a === "--balance") composeOpts.balance = true;
    else if (a === "--dag-id" && args[i + 1]) composeOpts.dagId = args[++i];
  }
  return composeOpts;
}

function resolveDag(opts) {
  if (opts.catalog) return { dag: resolveCatalog(opts.catalog), source: `catalog:${opts.catalog}` };
  if (opts.dag) {
    const abs = path.resolve(opts.dag);
    return { dag: JSON.parse(fs.readFileSync(abs, "utf8")), source: abs };
  }
  if (opts.template) {
    const composed = composeDag({ template: opts.template, ...parseComposeFromOpts(opts) });
    return { dag: composed.dag, source: composed.outPath };
  }
  throw new Error("Provide --template, --catalog, or --dag");
}

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

function readPrivateKey(name) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed 32-byte private key`);
  }
  return value;
}

async function getBalanceWei(rpcUrl, address) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return provider.getBalance(address);
}

async function assertMinBalance(rpcUrl, label, address, minWei) {
  const balance = await getBalanceWei(rpcUrl, address);
  const min = ethers.formatEther(minWei);
  const current = ethers.formatEther(balance);
  console.log(`${label}: ${address} (${current} PHRS)`);
  if (balance < minWei) {
    throw new Error(`${label} needs at least ${min} PHRS for Atlantic gas; current balance ${current}`);
  }
}

async function resolveAtlanticWallets(rpcUrl, executorKey) {
  const executorAddress = new ethers.Wallet(executorKey).address;
  const verifierBEnv = readPrivateKey("VERIFIER_B_PRIVATE_KEY");
  const verifierCEnv = readPrivateKey("VERIFIER_C_PRIVATE_KEY");
  const hasBothVerifierKeys = !!verifierBEnv && !!verifierCEnv;
  const hasOneVerifierKey = !!verifierBEnv || !!verifierCEnv;

  if (hasOneVerifierKey && !hasBothVerifierKeys) {
    throw new Error("Set both VERIFIER_B_PRIVATE_KEY and VERIFIER_C_PRIVATE_KEY, or omit both for demo verifier wallets");
  }

  if (hasBothVerifierKeys) {
    const verifierB = new ethers.Wallet(verifierBEnv).address;
    const verifierC = new ethers.Wallet(verifierCEnv).address;
    const unique = new Set([executorAddress, verifierB, verifierC].map((a) => a.toLowerCase()));
    if (unique.size !== 3) {
      throw new Error("PRIVATE_KEY, VERIFIER_B_PRIVATE_KEY, and VERIFIER_C_PRIVATE_KEY must resolve to three distinct addresses");
    }
    console.log("Atlantic wallet mode: independent verifier keys");
    await assertMinBalance(rpcUrl, "executor", executorAddress, ATLANTIC_MIN_EXECUTOR_WEI);
    await assertMinBalance(rpcUrl, "verifier B", verifierB, ATLANTIC_MIN_VERIFIER_WEI);
    await assertMinBalance(rpcUrl, "verifier C", verifierC, ATLANTIC_MIN_VERIFIER_WEI);
    return {
      keyB: verifierBEnv,
      keyC: verifierCEnv,
      verifierAddresses: { verifierB, verifierC },
      verifierKeyMode: "env",
    };
  }

  const keyB = walletFromMnemonic(1);
  const keyC = walletFromMnemonic(2);
  const verifierB = walletAddress(keyB);
  const verifierC = walletAddress(keyC);
  console.log("Atlantic wallet mode: demo verifier wallets (set VERIFIER_B_PRIVATE_KEY and VERIFIER_C_PRIVATE_KEY for independent agents)");
  await assertMinBalance(rpcUrl, "executor", executorAddress, ATLANTIC_MIN_EXECUTOR_WEI);
  fundAddress(executorKey, verifierB, rpcUrl);
  fundAddress(executorKey, verifierC, rpcUrl);
  await assertMinBalance(rpcUrl, "verifier B", verifierB, ATLANTIC_MIN_VERIFIER_WEI);
  await assertMinBalance(rpcUrl, "verifier C", verifierC, ATLANTIC_MIN_VERIFIER_WEI);
  return {
    keyB,
    keyC,
    verifierAddresses: { verifierB, verifierC },
    verifierKeyMode: "demo-funded",
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { dag, source } = resolveDag(opts);

  console.log(`=== Workflow: ${dag.dagId} ===`);
  console.log(`Source: ${source}`);

  const compileResult = compileDagFromObject(dag);
  console.log(`DAG hash: ${compileResult.dagHash}`);
  console.log(`Layers: ${compileResult.layers}, SALI friendly: ${compileResult.sali_friendly}`);
  if (compileResult.saliPlan[0]) {
    console.log(
      `Layer 0: ${compileResult.saliPlan[0].executionMode} (${compileResult.saliPlan[0].width} tasks)`
    );
  }

  let rpcUrl;
  let privateKey;
  let keyB;
  let keyC;
  let deployer;
  let registry;
  let verifierAddresses;
  let verifierKeyMode;

  if (opts.network === "atlantic") {
    loadEnv();
    rpcUrl = process.env.RPC_URL || "https://atlantic.dplabs-internal.com";
    privateKey = readPrivateKey("PRIVATE_KEY");
    if (!privateKey) throw new Error("PRIVATE_KEY required for Atlantic");
    deployer = new ethers.Wallet(privateKey).address;
    ({ keyB, keyC, verifierAddresses, verifierKeyMode } = await resolveAtlanticWallets(
      rpcUrl,
      privateKey
    ));
    const deployments = JSON.parse(
      fs.readFileSync(path.join(ROOT, "deployments", "atlantic.json"), "utf8")
    );
    registry = deployments.DAGRegistry.address;
  } else {
    if (opts.skipAnvil) {
      rpcUrl = "http://127.0.0.1:8545";
      privateKey = walletFromMnemonic(0);
      keyB = walletFromMnemonic(1);
      keyC = walletFromMnemonic(2);
      deployer = walletAddress(privateKey);
      verifierAddresses = { verifierB: walletAddress(keyB), verifierC: walletAddress(keyC) };
      verifierKeyMode = "local-mnemonic";
      registry =
        process.env.LOCAL_REGISTRY || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    } else {
      rpcUrl = startAnvil(8545);
      privateKey = walletFromMnemonic(0);
      keyB = walletFromMnemonic(1);
      keyC = walletFromMnemonic(2);
      deployer = walletAddress(privateKey);
      verifierAddresses = { verifierB: walletAddress(keyB), verifierC: walletAddress(keyC) };
      verifierKeyMode = "local-mnemonic";
      registry = deployRegistry(rpcUrl, privateKey);
    }
  }

  const composeInputs = parseComposeFromOpts(opts).inputs;
  const execResult = await executeWorkflow(compileResult, {
    rpcUrl,
    deployer,
    inputs: composeInputs,
  });

  console.log(`Layer 0 hash: ${execResult.layerHashes[0]}`);
  console.log(`SALI parallel: ${execResult.saliMetrics.layer0Parallel}`);

  const artifact = {
    network: opts.network,
    rpcUrl,
    dagId: dag.dagId,
    source,
    dagHash: compileResult.dagHash,
    layerHashes: execResult.layerHashes,
    layer0Hash: execResult.layerHashes[0],
    resultHash: execResult.resultHash,
    saliMetrics: execResult.saliMetrics,
    layerTimings: execResult.layerTimings,
    executeOnly: opts.executeOnly,
    deployer,
    verifierAddresses,
    verifierKeyMode,
  };

  if (!opts.executeOnly) {
    const { executionId, registerTx } = registerExecution(
      registry,
      compileResult.dagHash,
      compileResult.layers,
      privateKey,
      rpcUrl
    );
    const finalizeTx = completeLifecycle(
      registry,
      executionId,
      execResult.layerHashes,
      execResult.resultHash,
      privateKey,
      keyB,
      keyC,
      rpcUrl
    );
    const getExec = castCall(
      registry,
      "getExecution(bytes32)((bytes32,bytes32,address,uint256,uint256,uint16,uint16,bool,bool))",
      [executionId],
      rpcUrl
    );
    Object.assign(artifact, { executionId, registerTx, finalizeTx, getExecution: getExec, registry });
    console.log(`executionId: ${executionId}`);
    console.log(getExec);
  }

  const outName = `demo-workflow-${dag.dagId}-${opts.network}.json`;
  const outPath = path.join(ROOT, outName);
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`Artifact: ${outPath}`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
