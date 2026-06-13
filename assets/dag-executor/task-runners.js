"use strict";

const { ethers, keccak256, AbiCoder, zeroPadValue, toBeHex, getBytes, toUtf8Bytes } = require("ethers");
const { fetchPrice } = require("./fetch-pyth-hermes");
const {
  fetchHttpJson,
  fetchUrlBytes,
  hashTextContent,
  hashDocument,
  buildAgentReport,
  buildVerifierOutput,
  hashSignatureEvidence,
  hashHttpJsonOutput,
} = require("./evidence-adapters");

const coder = AbiCoder.defaultAbiCoder();

function isMockContract(addr) {
  return !addr || String(addr).startsWith("0xMock");
}

function inferRunner(taskDef) {
  if (taskDef.runner) return taskDef.runner;
  switch (taskDef.type) {
    case "oracle_offchain":
      return "pyth_price";
    case "read":
      if (taskDef.output_key === "balance" || (taskDef.fn || "").includes("balance")) return "native_balance";
      if ((taskDef.fn || "").includes("Verified") || (taskDef.fn || "").includes("Clear")) return "kyc_flag";
      if (!isMockContract(taskDef.contract)) return "eth_call";
      return "kyc_flag";
    case "offchain_read":
      if (taskDef.runner === "jurisdiction_check") return "jurisdiction_check";
      return "http_json";
    case "evidence":
      if (taskDef.runner === "signature_evidence") return "signature_evidence";
      if (taskDef.signature) return "signature_evidence";
      if (taskDef.source_url) return "url_fetch_hash";
      if (taskDef.text) return "text_evidence";
      if (taskDef.file) return "document_hash";
      return "text_evidence";
    case "agent_work":
      if (taskDef.runner === "verifier_output") return "verifier_output";
      if (taskDef.runner === "fact_check") return "fact_check";
      return "agent_signoff";
    case "compute":
      if (taskDef.runner === "multi_agent_consensus") return "multi_agent_consensus";
      return taskDef.policy || taskDef.runner || "aggregate";
    case "contract_call":
      return "simulated";
    default:
      throw new Error(`Cannot infer runner for type ${taskDef.type}`);
  }
}

async function runPythPrice(taskDef, ctx) {
  const feedArg = taskDef.feed_alias || taskDef.feed_id || "ETH/USD";
  const price = await fetchPrice(feedArg);
  return { output: price, meta: { mode: "pyth_price", feed: feedArg } };
}

async function runNativeBalance(taskDef, ctx) {
  const provider = new ethers.JsonRpcProvider(ctx.rpcUrl);
  const address = taskDef.address || ctx.deployer;
  const balance = await provider.getBalance(address);
  const callResult = zeroPadValue(toBeHex(balance), 32);
  return {
    output: { contract: address, callResult },
    meta: { mode: "native_balance", balance: balance.toString() },
  };
}

async function runKycFlag(taskDef, ctx) {
  const recipient = taskDef.address || ctx.recipient || ctx.deployer;
  const verified = ctx.inputs?.[taskDef.input_key || "kyc"] ?? ctx.kycVerified !== false;
  const callResult = zeroPadValue(toBeHex(verified ? 1n : 0n), 32);
  return {
    output: { contract: recipient, callResult },
    meta: { mode: "kyc_flag", verified },
  };
}

async function runEthCall(taskDef, ctx) {
  const provider = new ethers.JsonRpcProvider(ctx.rpcUrl);
  const contract = taskDef.contract;
  if (isMockContract(contract)) return runKycFlag(taskDef, ctx);
  const iface = new ethers.Interface([`function ${taskDef.fn}`]);
  const fn = taskDef.fn.split("(")[0];
  const args = (taskDef.args || []).map((a) => {
    if (a === "$deployer") return ctx.deployer;
    if (a === "$recipient") return ctx.recipient || ctx.deployer;
    return a;
  });
  const data = await provider.call({ to: contract, data: iface.encodeFunctionData(fn, args) });
  const decoded = iface.decodeFunctionResult(fn, data);
  const callResult = zeroPadValue(toBeHex(decoded[0]), 32);
  return {
    output: { contract, callResult },
    meta: { mode: "eth_call", raw: decoded[0]?.toString?.() ?? String(decoded[0]) },
  };
}

async function runHttpJson(taskDef, ctx) {
  const url = taskDef.url || ctx.inputs?.[taskDef.input_key] || ctx.inputs?.[taskDef.output_key];
  if (!url) {
    const simulated = { status: "simulated", key: taskDef.input_key || taskDef.output_key, value: true };
    const canonical = JSON.stringify(simulated);
    const { forHash } = hashHttpJsonOutput(taskDef.taskId || "offchain", url || "simulated", canonical);
    return { output: forHash, meta: { mode: "http_json_simulated", simulated } };
  }
  const { url: u, canonical } = await fetchHttpJson(url);
  const { forHash } = hashHttpJsonOutput(taskDef.taskId || "offchain", u, canonical);
  return { output: forHash, meta: { mode: "http_json", url: u } };
}

async function runUrlFetch(taskDef, ctx) {
  const url = taskDef.source_url || ctx.inputs?.[taskDef.input_key];
  if (!url) {
    const contentHash = keccak256(toUtf8Bytes(`simulated:${taskDef.output_key || "source"}`));
    return { output: { contentHash }, meta: { mode: "url_simulated" } };
  }
  const { contentHash } = await fetchUrlBytes(url);
  return { output: { contentHash }, meta: { mode: "url_fetch_hash", url } };
}

async function runTextEvidence(taskDef, ctx) {
  const text =
    taskDef.text ||
    ctx.inputs?.[taskDef.input_key] ||
    ctx.agentTexts?.[taskDef.agent_role] ||
    `evidence:${taskDef.output_key || "text"}`;
  const { forHash } = hashTextContent(taskDef.taskId || "evidence", text);
  return { output: forHash, meta: { mode: "text_evidence", length: text.length } };
}

async function runDocumentHash(taskDef, ctx) {
  const file = taskDef.file || ctx.inputs?.[taskDef.input_key];
  if (!file) return runTextEvidence(taskDef, ctx);
  const doc = hashDocument(taskDef.taskId || "doc", file);
  return { output: doc.forHash, meta: { mode: "document_hash", file } };
}

async function runSignatureEvidence(taskDef, ctx) {
  const message =
    taskDef.message ||
    ctx.inputs?.[taskDef.input_key] ||
    ctx.agentTexts?.[taskDef.agent_role] ||
    `attestation:${taskDef.output_key || "message"}`;
  const signature =
    taskDef.signature ||
    ctx.inputs?.[`${taskDef.input_key || taskDef.output_key}_signature`] ||
    ctx.inputs?.signature ||
    "0x" + "00".repeat(65);
  const evidence = hashSignatureEvidence(message, signature);
  return {
    output: evidence.forHash,
    meta: { mode: "signature_evidence", valid: evidence.valid, recovered: evidence.recovered },
  };
}

async function runVerifierOutput(taskDef, ctx) {
  const verifierId = taskDef.verifier_id || taskDef.agent_id || taskDef.agent_role || "verifier";
  const subjectRef = ctx.inputs?.execution_id || ctx.inputs?.subject_ref || taskDef.subject_ref;
  const layerIndex = taskDef.layer_index ?? 0;
  const attestation =
    taskDef.attestation_hash ||
    ctx.inputs?.[taskDef.input_key] ||
    keccak256(toUtf8Bytes(ctx.agentTexts?.[taskDef.agent_role] || "verified"));
  const signature = taskDef.signature || ctx.inputs?.verifier_signature;
  const report = buildVerifierOutput(verifierId, subjectRef, layerIndex, attestation, signature);
  return { output: report.forHash, meta: { mode: "verifier_output", verifierId } };
}

async function runFactCheck(taskDef, ctx) {
  const deps = depOutputs(taskDef, ctx);
  const summaryHash =
    deps[0]?.output?.contentHash || keccak256(toUtf8Bytes("no-summary"));
  const role = taskDef.agent_role || "fact_checker";
  const text = ctx.agentTexts?.[role] || ctx.inputs?.[taskDef.input_key] || "facts-verified";
  const outputHash = keccak256(
    coder.encode(["bytes32", "bytes32"], [summaryHash, keccak256(toUtf8Bytes(text))])
  );
  const signature = taskDef.signature || ctx.inputs?.fact_check_signature;
  const report = buildAgentReport(role, role, outputHash, undefined, signature);
  return { output: report.forHash, meta: { mode: "fact_check", verified: true } };
}

async function runJurisdictionCheck(taskDef, ctx) {
  const raw =
    ctx.inputs?.[taskDef.input_key] ||
    ctx.inputs?.jurisdiction ||
    taskDef.default_jurisdiction ||
    "US";
  const jurisdiction = String(raw).toUpperCase();
  const allowedList = (taskDef.allowed || ["US", "EU", "UK", "SG", "JP", "AU"]).map((c) =>
    String(c).toUpperCase()
  );
  const allowed = allowedList.includes(jurisdiction);
  const canonical = JSON.stringify({ jurisdiction, allowed, policy: "jurisdiction_check" });
  const { forHash } = hashHttpJsonOutput(taskDef.taskId || "jurisdiction", "jurisdiction://policy", canonical);
  return { output: forHash, meta: { mode: "jurisdiction_check", jurisdiction, allowed } };
}

async function runMultiAgentConsensus(taskId, taskDef, ctx) {
  const deps = depOutputs(taskDef, ctx);
  const expected = (taskDef.depends_on || []).length;
  const consensus =
    deps.length === expected &&
    deps.every((d) => d.output?.contentHash || d.output?.outputHash || d.output?.payloadHash);
  return { output: {}, meta: { mode: "multi_agent_consensus", consensus, agentCount: deps.length } };
}

async function runAgentSignoff(taskDef, ctx) {
  const agentId = taskDef.agent_id || ctx.agents?.[taskDef.agent_role]?.id || taskDef.agent_role || "agent";
  const role = taskDef.agent_role || taskDef.role || "verifier";
  const text = ctx.agentTexts?.[role] || ctx.inputs?.[taskDef.input_key] || `${role}-output`;
  const outputHash = keccak256(toUtf8Bytes(text));
  const signature = taskDef.signature || ctx.inputs?.[`${role}_signature`];
  const report = buildAgentReport(agentId, role, outputHash, undefined, signature);
  return { output: report.forHash, meta: { mode: "agent_signoff", agentId, role } };
}

function depOutputs(taskDef, ctx) {
  return (taskDef.depends_on || []).map((dep) => {
    const entry = ctx.taskOutputs[dep];
    if (!entry) throw new Error(`Missing dependency ${dep} for compute`);
    return entry;
  });
}

async function runAggregate(taskId, taskDef, ctx) {
  return { output: {}, meta: { mode: "aggregate" } };
}

async function runConsensusCheck(taskId, taskDef, ctx) {
  const deps = depOutputs(taskDef, ctx);
  const keys = deps.map((d) => {
    const o = d.output;
    if (o.price !== undefined) return `${o.price}:${o.publish_time}`;
    if (o.contentHash) return o.contentHash;
    if (o.payloadHash) return o.payloadHash;
    return JSON.stringify(o);
  });
  const consensus = keys.every((k) => k === keys[0]);
  return { output: {}, meta: { mode: "consensus_check", consensus, keys } };
}

async function runRiskScore(taskId, taskDef, ctx) {
  const deps = depOutputs(taskDef, ctx);
  let score = 50;
  for (const d of deps) {
    if (d.meta?.verified === true) score += 15;
    if (d.meta?.verified === false) score -= 30;
    if (d.meta?.allowed === true) score += 10;
    if (d.meta?.allowed === false) score -= 40;
    if (d.meta?.balance) score += Number(BigInt(d.meta.balance) > 0n);
  }
  score = Math.max(0, Math.min(100, score));
  return { output: {}, meta: { mode: "risk_score", score, approved: score >= 60 } };
}

async function runComputeSignal(taskId, taskDef, ctx) {
  const deps = depOutputs(taskDef, ctx);
  const prices = deps.filter((d) => d.output?.price !== undefined).map((d) => Number(d.output.price));
  const signal = prices.length ? (prices[0] > 0 ? "long" : "flat") : "hold";
  return { output: {}, meta: { mode: "compute_signal", signal } };
}

async function runSimulatedCall(taskId, taskDef, ctx) {
  const txHash = keccak256(
    coder.encode(
      ["string", "address", "uint256"],
      [taskId, ctx.recipient || ctx.deployer, ctx.paymentAmountWei ? BigInt(ctx.paymentAmountWei) : 1n]
    )
  );
  return { output: { txHash }, meta: { mode: "simulated", txHash } };
}

async function runTask(taskId, taskDef, ctx) {
  const startedAt = Date.now();
  const runner = inferRunner({ ...taskDef, taskId });
  let result;

  switch (runner) {
    case "pyth_price":
      result = await runPythPrice(taskDef, ctx);
      break;
    case "native_balance":
      result = await runNativeBalance(taskDef, ctx);
      break;
    case "kyc_flag":
      result = await runKycFlag(taskDef, ctx);
      break;
    case "eth_call":
      result = await runEthCall(taskDef, ctx);
      break;
    case "http_json":
      result = await runHttpJson({ ...taskDef, taskId }, ctx);
      break;
    case "url_fetch_hash":
      result = await runUrlFetch(taskDef, ctx);
      break;
    case "text_evidence":
      result = await runTextEvidence({ ...taskDef, taskId }, ctx);
      break;
    case "document_hash":
      result = await runDocumentHash({ ...taskDef, taskId }, ctx);
      break;
    case "signature_evidence":
      result = await runSignatureEvidence({ ...taskDef, taskId }, ctx);
      break;
    case "verifier_output":
      result = await runVerifierOutput(taskDef, ctx);
      break;
    case "fact_check":
      result = await runFactCheck(taskDef, ctx);
      break;
    case "jurisdiction_check":
      result = await runJurisdictionCheck({ ...taskDef, taskId }, ctx);
      break;
    case "multi_agent_consensus":
      result = await runMultiAgentConsensus(taskId, taskDef, ctx);
      break;
    case "agent_signoff":
      result = await runAgentSignoff(taskDef, ctx);
      break;
    case "aggregate":
      result = await runAggregate(taskId, taskDef, ctx);
      break;
    case "consensus_check":
      result = await runConsensusCheck(taskId, taskDef, ctx);
      break;
    case "risk_score":
      result = await runRiskScore(taskId, taskDef, ctx);
      break;
    case "compute_signal":
      result = await runComputeSignal(taskId, taskDef, ctx);
      break;
    case "simulated":
      result = await runSimulatedCall(taskId, taskDef, ctx);
      break;
    default:
      throw new Error(`Unknown runner: ${runner}`);
  }

  return {
    output: result.output,
    meta: { ...result.meta, startedAt, finishedAt: Date.now(), runner },
  };
}

module.exports = { runTask, inferRunner };
