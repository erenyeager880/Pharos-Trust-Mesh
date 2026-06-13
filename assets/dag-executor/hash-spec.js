"use strict";

const { keccak256, AbiCoder, getBytes, zeroPadValue, toBeHex, toUtf8Bytes } = require("ethers");

const coder = AbiCoder.defaultAbiCoder();

function hashPythTaskOutput(taskId, feedId, price, conf, expo, publishTime) {
  const feedBytes32 = feedId.startsWith("0x") ? feedId : `0x${feedId}`;
  return keccak256(
    coder.encode(
      ["string", "bytes32", "int64", "uint64", "int32", "uint64"],
      [taskId, feedBytes32, BigInt(price), BigInt(conf), expo, BigInt(publishTime)]
    )
  );
}

function hashReadTaskOutput(taskId, contract, callResult) {
  const addr = contract.startsWith("0x") ? contract : `0x${contract}`;
  const bytes =
    typeof callResult === "string" && callResult.startsWith("0x")
      ? getBytes(callResult)
      : getBytes(zeroPadValue(toBeHex(BigInt(callResult)), 32));
  return keccak256(coder.encode(["string", "address", "bytes"], [taskId, addr, bytes]));
}

function hashOffchainReadOutput(taskId, url, payloadHash) {
  const ph = payloadHash.startsWith("0x") ? payloadHash : `0x${payloadHash}`;
  return keccak256(coder.encode(["string", "string", "bytes32"], [taskId, url || "", ph]));
}

function hashEvidenceOutput(taskId, contentHash) {
  const ch = contentHash.startsWith("0x") ? contentHash : `0x${contentHash}`;
  return keccak256(coder.encode(["string", "bytes32"], [taskId, ch]));
}

function hashAgentWorkOutput(taskId, agentId, role, outputHash, timestamp) {
  const oh = outputHash.startsWith("0x") ? outputHash : `0x${outputHash}`;
  return keccak256(
    coder.encode(
      ["string", "string", "string", "bytes32", "uint64"],
      [taskId, agentId, role, oh, BigInt(timestamp)]
    )
  );
}

function hashInputs(dependencyOutputs) {
  return keccak256(coder.encode(["bytes32[]"], [dependencyOutputs]));
}

function hashComputeTaskOutput(taskId, inputsHash) {
  const ih = inputsHash.startsWith("0x") ? inputsHash : `0x${inputsHash}`;
  return keccak256(coder.encode(["string", "bytes32"], [taskId, ih]));
}

function hashContractCallTaskOutput(taskId, txHash) {
  const th = txHash.startsWith("0x") ? txHash : `0x${txHash}`;
  return keccak256(coder.encode(["string", "bytes32"], [taskId, th]));
}

function hashLayer(layerIndex, taskHashes) {
  return keccak256(coder.encode(["uint16", "bytes32[]"], [layerIndex, taskHashes]));
}

function hashTaskOutput(taskId, taskDef, output) {
  switch (taskDef.type) {
    case "oracle_offchain":
      return hashPythTaskOutput(
        taskId,
        output.feedId,
        output.price,
        output.conf,
        output.expo,
        output.publish_time ?? output.publishTime
      );
    case "read":
      return hashReadTaskOutput(taskId, output.contract ?? taskDef.contract, output.callResult);
    case "offchain_read":
      return hashOffchainReadOutput(taskId, output.url, output.payloadHash);
    case "evidence":
      return hashEvidenceOutput(taskId, output.contentHash);
    case "agent_work":
      return hashAgentWorkOutput(
        taskId,
        output.agentId,
        output.role,
        output.outputHash,
        output.timestamp
      );
    case "compute":
      return hashComputeTaskOutput(taskId, output.inputsHash);
    case "contract_call":
      return hashContractCallTaskOutput(taskId, output.txHash);
    default:
      throw new Error(`Unknown task type for hashing: ${taskDef.type}`);
  }
}

const HASH_SPEC_FIELDS = {
  oracle_offchain: ["feedId", "price", "conf", "expo", "publishTime"],
  read: ["contract", "callResult"],
  offchain_read: ["url", "payloadHash"],
  evidence: ["contentHash"],
  agent_work: ["agentId", "role", "outputHash", "timestamp"],
  compute: ["inputsHash"],
  contract_call: ["txHash"],
};

module.exports = {
  hashPythTaskOutput,
  hashReadTaskOutput,
  hashOffchainReadOutput,
  hashEvidenceOutput,
  hashAgentWorkOutput,
  hashInputs,
  hashComputeTaskOutput,
  hashContractCallTaskOutput,
  hashLayer,
  hashTaskOutput,
  HASH_SPEC_FIELDS,
};
