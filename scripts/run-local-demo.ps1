# Full DAG Registry lifecycle on local Anvil with SALI parallel Layer 0 + real evidence hashes

$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent

Set-Location $root

node scripts/run-sali-demo.js

