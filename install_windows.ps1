# ==============================================================================
# BESMAINFOENERGY - SCRIPT D'INSTALLATION ET TEST LOCAL SOUS WINDOWS
# Environnement cible : Windows 10 / 11 + PowerShell 5.1 / PowerShell 7 + VS Code
# Client : SONELGAZ / Superviseur National SCADA
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
if ($PSScriptRoot) { Set-Location -Path $PSScriptRoot }

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "   BESMAINFOENERGY - PREPARATION ET LANCEMENT LOCAL SOUS WINDOWS (VS CODE)       " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# 1. Verification de Node.js et Python
Write-Host "`n[1/5] Verification de Node.js et Python sur votre machine..." -ForegroundColor Yellow
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "Erreur : Node.js n'est pas installe. Telechargez-le sur https://nodejs.org (version LTS recommandee)." -ForegroundColor Red
    exit 1
}
$nodeVer = node -v
Write-Host "  -> Node.js detecte : $nodeVer" -ForegroundColor Green

# Liberation preventive du port 3000 si un ancien processus Node est reste suspendu
try {
    $pidsToKill = @()
    if (Get-Command "Get-NetTCPConnection" -ErrorAction SilentlyContinue) {
        $existingConns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        if ($existingConns) {
            foreach ($conn in $existingConns) { $pidsToKill += $conn.OwningProcess }
        }
    }
    if ($pidsToKill.Count -eq 0 -and (Get-Command "netstat" -ErrorAction SilentlyContinue)) {
        $netstatLines = netstat -ano | Select-String ":3000 "
        foreach ($line in $netstatLines) {
            $parts = $line.ToString().Trim() -split '\s+'
            if ($parts.Count -ge 5 -and $parts[1] -match ':3000$') {
                $pidsToKill += [int]$parts[-1]
            }
        }
    }
    $pidsToKill = $pidsToKill | Select-Object -Unique
    foreach ($procId in $pidsToKill) {
        if ($procId -gt 0 -and $procId -ne $PID) {
            Write-Host "  -> Liberation du port 3000 (arret processus PID $procId)..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    if ($pidsToKill.Count -gt 0) {
        Start-Sleep -Milliseconds 600
        Write-Host "  -> Port 3000 libere avec succes." -ForegroundColor Green
    }
} catch { }

$pythonCmd = $null
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command "python3" -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
}

if ($pythonCmd) {
    $pyVer = & $pythonCmd --version
    Write-Host "  -> Python detecte : $pyVer" -ForegroundColor Green
} else {
    Write-Host "  -> Information : Python n'est pas detecte dans le PATH Windows (optionnel pour la supervision Web)." -ForegroundColor Yellow
}

# 2. Creation des repertoires securises (keys, models, backups)
Write-Host "`n[2/5] Creation des repertoires de securite (keys, models, backups)..." -ForegroundColor Yellow
if (-not (Test-Path ".\keys")) { New-Item -ItemType Directory -Force -Path ".\keys" | Out-Null }
if (-not (Test-Path ".\models")) { New-Item -ItemType Directory -Force -Path ".\models" | Out-Null }
if (-not (Test-Path ".\backups\mongodb")) { New-Item -ItemType Directory -Force -Path ".\backups\mongodb" | Out-Null }
Write-Host "  -> Repertoires verifies et crees avec succes." -ForegroundColor Green

# 3. Initialisation du fichier .env
Write-Host "`n[3/5] Configuration du fichier d'environnement (.env)..." -ForegroundColor Yellow
if (-not (Test-Path ".\.env")) {
    Copy-Item ".\.env.example" ".\.env"
    Write-Host "  -> Fichier .env cree a partir de .env.example." -ForegroundColor Green
} else {
    Write-Host "  -> Fichier .env existant conserve." -ForegroundColor Green
}

# 4. Installation des dependances NPM
Write-Host "`n[4/5] Installation et verification des dependances Node.js..." -ForegroundColor Yellow
if (-not (Test-Path ".\node_modules")) {
    Write-Host "  -> Premier lancement detecte : installation complete des dependances..." -ForegroundColor Yellow
    npm install --legacy-peer-deps --no-audit --no-fund
    Write-Host "  -> Verification des modules natifs Windows (@tailwindcss/oxide et lightningcss)..." -ForegroundColor Yellow
    npm install @tailwindcss/oxide-win32-x64-msvc lightningcss-win32-x64-msvc react-is --legacy-peer-deps --no-audit --no-fund --save-optional
    Write-Host "  -> Dependances et binaires natifs 100% operationnels." -ForegroundColor Green
} else {
    Write-Host "  -> Dependances deja installees (node_modules detecte)." -ForegroundColor Green
    if (-not (Test-Path ".\node_modules\react-is") -or -not (Test-Path ".\node_modules\lightningcss-win32-x64-msvc")) {
        Write-Host "  -> Finalisation des binaires Windows natifs et react-is..." -ForegroundColor Yellow
        npm install react-is @tailwindcss/oxide-win32-x64-msvc lightningcss-win32-x64-msvc --legacy-peer-deps --no-audit --no-fund --save-optional
    }
    Write-Host "  -> Modules prets pour demarrage instantane." -ForegroundColor Green
}

# Nettoyage preventif de l'ancien cache Vite (.vite) si existant
if (Test-Path ".\node_modules\.vite") {
    try {
        Remove-Item -Recurse -Force ".\node_modules\.vite" -ErrorAction SilentlyContinue
    } catch { }
}

# 5. Compilation du bundle de production pour garantir un affichage instantané sans blocage
Write-Host "`n[5/5] Preparation et lancement de l'agent BesmaInfoEnergy..." -ForegroundColor Yellow
$needsBuild = $Rebuild -or (-not (Test-Path ".\dist\index.html"))

if ($needsBuild) {
    Write-Host "  -> Compilation du bundle Web haute performance (dist)..." -ForegroundColor Yellow
    try {
        if (Test-Path ".\dist") { Remove-Item -Recurse -Force ".\dist" -ErrorAction SilentlyContinue }
    } catch { }
    npm run build
    Write-Host "  -> Bundle Web compile avec succes dans dist/." -ForegroundColor Green
} else {
    Write-Host "  -> Bundle pre-compile detecte (dist/) : demarrage instantane sans compilation." -ForegroundColor Green
}

# Ouverture automatique du navigateur dès que le serveur repond HTTP 200
Start-Job -ScriptBlock {
    $attempts = 0
    while ($attempts -lt 40) {
        Start-Sleep -Seconds 1
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp -and $resp.StatusCode -eq 200) {
                Start-Process "http://localhost:3000"
                break
            }
        } catch { }
        $attempts++
    }
} | Out-Null

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "  SERVEUR BESMAINFOENERGY EN COURS D'EXECUTION (MODE PRODUCTION RAPIDE) !" -ForegroundColor Green
Write-Host "  URL locale : http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Diagnostic : http://localhost:3000/api/v1/health" -ForegroundColor White
Write-Host "  (Pour arreter le serveur : faites Ctrl + C dans cette fenetre)" -ForegroundColor Yellow
Write-Host "================================================================================`n" -ForegroundColor Cyan

$env:NODE_ENV = "production"
npm start
