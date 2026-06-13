const { ethers } = require("ethers");

const RPC_URL = "{{RPC_URL}}";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT = "{{CONTRACT}}";
const ABI = [{{ABI_FRAGMENT}}];

async function main() {
  if (!PRIVATE_KEY) throw new Error("Set PRIVATE_KEY env var");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT, ABI, wallet);
  const tx = await contract.{{METHOD}}({{ARGS}});
  const receipt = await tx.wait();
  console.log("tx:", receipt.hash);
}

main().catch(console.error);
