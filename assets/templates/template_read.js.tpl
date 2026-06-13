const { ethers } = require("ethers");

const RPC_URL = "{{RPC_URL}}";
const CONTRACT = "{{CONTRACT}}";
const ABI = [{{ABI_FRAGMENT}}];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT, ABI, provider);
  const result = await contract.{{METHOD}}({{ARGS}});
  console.log(result);
}

main().catch(console.error);
