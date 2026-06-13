# Pharos TrustMesh — GitHub CLI multi-account helper
# Requires: GitHub CLI (gh) — winget install GitHub.cli

param(
    [Parameter(Position = 0)]
    [ValidateSet('status', 'login', 'switch-eren', 'switch-shery', 'setup-git', 'push')]
    [string]$Action = 'status'
)

$Eren = 'erenyeager880'
$Shery = 'shery8595'
$RepoRoot = Split-Path $PSScriptRoot -Parent

function Ensure-Gh {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Error 'GitHub CLI not found. Install: winget install GitHub.cli'
        exit 1
    }
}

function Show-Status {
    Ensure-Gh
    Write-Host "`n=== GitHub CLI accounts ===" -ForegroundColor Cyan
    gh auth status
    Write-Host "`n=== Git remotes (this repo) ===" -ForegroundColor Cyan
    Push-Location $RepoRoot
    git remote -v 2>$null
    Pop-Location
}

function Login-Account {
    Ensure-Gh
    Write-Host @"

Add another GitHub account (browser login).
Repeat 'login' for each account you use (e.g. $Eren and $Shery).

"@ -ForegroundColor Yellow
    gh auth login --hostname github.com --git-protocol https --web
    gh auth setup-git
    gh auth status
}

function Switch-Account {
    param([string]$User)
    Ensure-Gh
    gh auth switch --hostname github.com --user $User
    gh auth status
    Write-Host "Active account: $User — git push/pull will use this account." -ForegroundColor Green
}

function Setup-Git {
    Ensure-Gh
    gh auth setup-git
    Write-Host 'Git is configured to use gh for github.com credentials.' -ForegroundColor Green
}

function Push-Repo {
    Ensure-Gh
    Push-Location $RepoRoot
    Write-Host "Pushing from: $RepoRoot" -ForegroundColor Cyan
    gh auth status
    git push -u origin main
    Pop-Location
}

switch ($Action) {
    'status'       { Show-Status }
    'login'        { Login-Account }
    'switch-eren'  { Switch-Account $Eren }
    'switch-shery' { Switch-Account $Shery }
    'setup-git'    { Setup-Git }
    'push'         { Push-Repo }
}
