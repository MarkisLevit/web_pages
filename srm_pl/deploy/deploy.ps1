# Runs deploy.sh through Git Bash, from PowerShell.
#
# Why this exists: in PowerShell, `bash` resolves to C:\Windows\System32\bash.exe
# — the WSL launcher — not Git Bash. If WSL is absent or broken you get
# "execvpe(/bin/bash) failed" and the script never runs. This finds the real
# Git Bash and calls it explicitly.
#
#   .\deploy\deploy.ps1 --dry-run
#   .\deploy\deploy.ps1

$ErrorActionPreference = "Stop"

$candidates = @(
    (Join-Path $env:ProgramFiles       "Git\bin\bash.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Git\bin\bash.exe"),
    (Join-Path $env:LOCALAPPDATA       "Programs\Git\bin\bash.exe")
)

$bash = $null
foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $bash = $c; break }
}

if (-not $bash) {
    Write-Host ""
    Write-Host "[!] Git Bash not found." -ForegroundColor Red
    Write-Host "    Install Git for Windows from https://git-scm.com/download/win"
    Write-Host "    (looked in Program Files, Program Files (x86) and LocalAppData)"
    exit 1
}

$root = Split-Path -Parent $PSScriptRoot

Write-Host "Using $bash" -ForegroundColor DarkGray
Push-Location $root
try {
    & $bash "deploy/deploy.sh" @args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
