"use strict";

const { execSync, spawn } = require("child_process");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");

function foundryBin(name) {
  const home = process.env.USERPROFILE || os.homedir();
  const win = path.join(home, ".foundry", "bin", `${name}.exe`);
  try {
    execSync(`"${win}" --version`, { stdio: "ignore" });
    return win;
  } catch {
    return name;
  }
}

function cast() {
  return foundryBin("cast");
}

function forge() {
  return foundryBin("forge");
}

function anvil() {
  return foundryBin("anvil");
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", cwd: ROOT, ...opts }).trim();
}

function castSend(registry, sig, args, privateKey, rpcUrl) {
  const castPath = cast();
  const argStr = args.join(" ");
  const out = run(
    `"${castPath}" send ${registry} "${sig}" ${argStr} --private-key ${privateKey} --rpc-url ${rpcUrl} --json`
  );
  return JSON.parse(out);
}

function castCall(registry, sig, args, rpcUrl) {
  const castPath = cast();
  const argStr = args.join(" ");
  return run(`"${castPath}" call ${registry} "${sig}" ${argStr} --rpc-url ${rpcUrl}`);
}

function walletAddress(privateKey) {
  return run(`"${cast()}" wallet address --private-key ${privateKey}`);
}

function walletFromMnemonic(index) {
  const mnemonic = "test test test test test test test test test test test junk";
  return run(`"${cast()}" wallet private-key --mnemonic "${mnemonic}" --mnemonic-index ${index}`);
}

function deployRegistry(rpcUrl, privateKey) {
  run(
    `"${forge()}" script script/DeployDAGRegistry.s.sol:DeployDAGRegistry --rpc-url ${rpcUrl} --private-key ${privateKey} --broadcast`
  );
  return "0x5FbDB2315678afecb367f032d93F642f64180aa3";
}

function startAnvil(port = 8545) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /IM anvil.exe`, { stdio: "ignore" });
    }
  } catch {
    /* not running */
  }
  const bin = anvil();
  const child = spawn(bin, ["--port", String(port)], {
    detached: true,
    stdio: "ignore",
    cwd: ROOT,
  });
  child.unref();
  const start = Date.now();
  while (Date.now() - start < 8000) {
    try {
      execSync(`"${cast()}" chain-id --rpc-url http://127.0.0.1:${port}`, {
        encoding: "utf8",
        stdio: "pipe",
      });
      return `http://127.0.0.1:${port}`;
    } catch {
      /* wait */
    }
    execSync(process.platform === "win32" ? "ping -n 1 127.0.0.1 > nul" : "sleep 0.5", {
      stdio: "ignore",
    });
  }
  throw new Error("Anvil failed to start");
}

function registerExecution(registry, dagHash, layers, privateKey, rpcUrl) {
  const tx = castSend(
    registry,
    "registerExecution(bytes32,uint16)(bytes32)",
    [dagHash, String(layers)],
    privateKey,
    rpcUrl
  );
  const receipt = JSON.parse(run(`"${cast()}" receipt ${tx.transactionHash} --rpc-url ${rpcUrl} --json`));
  return { executionId: receipt.logs[0].topics[1], registerTx: tx.transactionHash };
}

function completeLifecycle(registry, executionId, layerHashes, resultHash, privateKey, keyB, keyC, rpcUrl) {
  for (let i = 0; i < layerHashes.length; i++) {
    castSend(
      registry,
      "completeLayer(bytes32,uint16,bytes32)",
      [executionId, String(i), layerHashes[i]],
      privateKey,
      rpcUrl
    );
  }
  castSend(registry, "approveExecution(bytes32)", [executionId], keyB, rpcUrl);
  castSend(registry, "approveExecution(bytes32)", [executionId], keyC, rpcUrl);
  const fin = castSend(
    registry,
    "finalizeExecution(bytes32,bytes32)",
    [executionId, resultHash],
    privateKey,
    rpcUrl
  );
  return fin.transactionHash;
}

function fundAddress(fromKey, toAddr, rpcUrl, ether = "0.002") {
  run(
    `"${cast()}" send ${toAddr} --value ${ether}ether --private-key ${fromKey} --rpc-url ${rpcUrl}`
  );
}

module.exports = {
  ROOT,
  cast,
  forge,
  run,
  castSend,
  castCall,
  walletAddress,
  walletFromMnemonic,
  deployRegistry,
  startAnvil,
  registerExecution,
  completeLifecycle,
  fundAddress,
};
