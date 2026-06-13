"use strict";

const fs = require("fs");
const path = require("path");
const { keccak256, toUtf8Bytes, AbiCoder, getBytes, verifyMessage, hashMessage } = require("ethers");

const coder = AbiCoder.defaultAbiCoder();

function canonicalJson(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

async function fetchHttpJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  return { url, data, canonical: canonicalJson(data) };
}

async function fetchUrlBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  return { url, bytes: text, contentHash: keccak256(toUtf8Bytes(text)) };
}

function hashTextContent(taskId, text) {
  const contentHash = keccak256(toUtf8Bytes(text));
  return {
    source: "text",
    contentHash,
    payload: contentHash,
    forHash: { contentHash },
  };
}

function hashDocument(taskId, filePath) {
  const abs = path.resolve(filePath);
  const bytes = fs.readFileSync(abs);
  const contentHash = keccak256(bytes);
  return {
    source: abs,
    contentHash,
    payload: contentHash,
    forHash: { contentHash },
  };
}

function buildAgentReport(agentId, role, outputHash, timestamp, signature) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const sigHash = signature ? hashSignatureBytes(signature) : null;
  const finalOutputHash =
    sigHash && outputHash
      ? keccak256(coder.encode(["bytes32", "bytes32"], [outputHash, sigHash]))
      : outputHash;
  return {
    agentId,
    role,
    outputHash: finalOutputHash,
    timestamp: ts,
    signatureHash: sigHash,
    forHash: { agentId, role, outputHash: finalOutputHash, timestamp: ts },
  };
}

function hashSignatureBytes(signature) {
  const sig = String(signature).trim();
  const hex = sig.startsWith("0x") ? sig : `0x${sig}`;
  return keccak256(getBytes(hex));
}

function hashSignatureEvidence(message, signature) {
  const msg = String(message);
  const sig = String(signature).trim();
  const messageHash = msg.startsWith("0x") && msg.length === 66 ? msg : hashMessage(msg);
  const signatureHash = hashSignatureBytes(sig);
  const contentHash = keccak256(coder.encode(["bytes32", "bytes32"], [messageHash, signatureHash]));
  let recovered = null;
  let valid = false;
  try {
    if (sig.length >= 132) {
      recovered = verifyMessage(msg, sig);
      valid = !!recovered;
    }
  } catch {
    valid = false;
  }
  return {
    messageHash,
    signatureHash,
    contentHash,
    valid,
    recovered,
    forHash: { contentHash },
  };
}

function buildVerifierOutput(verifierId, subjectRef, layerIndex, attestationHash, signature) {
  const subject = subjectRef || "0x0000000000000000000000000000000000000000000000000000000000000000";
  const att = attestationHash?.startsWith("0x") ? attestationHash : keccak256(toUtf8Bytes(String(attestationHash || "")));
  const sigHash = signature ? hashSignatureBytes(signature) : keccak256(toUtf8Bytes(""));
  const outputHash = keccak256(
    coder.encode(
      ["bytes32", "uint16", "bytes32", "bytes32"],
      [subject, layerIndex, att, sigHash]
    )
  );
  return buildAgentReport(verifierId, "verifier", outputHash, undefined, signature);
}

function hashHttpJsonOutput(taskId, url, canonical) {
  const payloadHash = keccak256(toUtf8Bytes(canonical));
  return { url, payloadHash, forHash: { url, payloadHash } };
}

module.exports = {
  canonicalJson,
  fetchHttpJson,
  fetchUrlBytes,
  hashTextContent,
  hashDocument,
  buildAgentReport,
  buildVerifierOutput,
  hashSignatureBytes,
  hashSignatureEvidence,
  hashHttpJsonOutput,
  coder,
};
