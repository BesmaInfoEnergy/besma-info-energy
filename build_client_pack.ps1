# ==============================================================================
# BESMAINFOENERGY - GENERATEUR DU PACK CLIENT SOUVERAIN (.ZIP) SOUS WINDOWS
# Client cible : SONELGAZ / Operateur Energetique National
# ==============================================================================

$ErrorActionPreference = "Stop"
if ($PSScriptRoot) { Set-Location -Path $PSScriptRoot }
$DateStr = Get-Date -Format "yyyyMMdd"
$ZipFileName = "BesmaInfoEnergy_Pack_Client_SONELGAZ_$DateStr.zip"
$StagingDir = ".\dist_pack_client"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "   BESMAINFOENERGY - CREATION DU PACK OFFICIEL DE LIVRAISON CLIENT (.ZIP)       " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# Nettoyage d'un eventuel ancien dossier de staging ou zip
if (Test-Path $StagingDir) { Remove-Item -Recurse -Force $StagingDir }
if (Test-Path $ZipFileName) { Remove-Item -Force $ZipFileName }

New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null

# Compilation prealable du bundle dist si absent pour livraison cle-en-main
if (-not (Test-Path ".\dist\index.html")) {
    Write-Host "`n[0/3] Compilation du bundle dist/ haute performance pour la livraison client..." -ForegroundColor Yellow
    npm run build
}

Write-Host "`n[1/3] Copie des fichiers sources, scripts et configurations (hors node_modules et secrets)..." -ForegroundColor Yellow

$ItemsToCopy = @(
    "server.ts",
    "src",
    "dist",
    "backend",
    "infrastructure",
    "scripts",
    "public",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "requirements.txt",
    "index.html",
    "metadata.json",
    ".env.example",
    ".gitignore",
    "Dockerfile",
    "docker-compose.prod.yml",
    "install_production.sh",
    "install_windows.ps1",
    "start_windows.bat",
    "build_client_pack.ps1",
    "LIVRAISON_CLIENT_SONELGAZ.md",
    "README.md"
)

foreach ($item in $ItemsToCopy) {
    if (Test-Path $item) {
        $dest = Join-Path $StagingDir $item
        $parent = Split-Path -Path $dest -Parent
        if (-not (Test-Path $parent)) {
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }
        Copy-Item -Path $item -Destination $dest -Recurse -Force
        Write-Host "  -> Inclus : $item" -ForegroundColor Green
    } else {
        Write-Host "  -> [ATTENTION] Fichier/Dossier manquant : $item" -ForegroundColor Magenta
    }
}

# Purge automatique des fichiers temporaires et caches Python s'ils existent dans le staging
Get-ChildItem -Path $StagingDir -Recurse -Filter "__pycache__" -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Get-ChildItem -Path $StagingDir -Recurse -Filter "*.pyc" -File -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "`n[2/3] Creation de l'archive compressee $ZipFileName..." -ForegroundColor Yellow
Compress-Archive -Path "$StagingDir\*" -DestinationPath $ZipFileName -Force

Write-Host "`n[3/3] Calcul de l'empreinte d'integrite SHA-256 du Pack Client..." -ForegroundColor Yellow
$HashObj = Get-FileHash -Path $ZipFileName -Algorithm SHA256
$HashValue = $HashObj.Hash
"$HashValue  $ZipFileName" | Out-File -FilePath "$ZipFileName.sha256" -Encoding utf8

# Nettoyage du dossier temporaire
Remove-Item -Recurse -Force $StagingDir

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "  PACK CLIENT GENERE AVEC SUCCES !" -ForegroundColor Green
Write-Host "  Fichier Archive : $ZipFileName" -ForegroundColor White
Write-Host "  Fichier SHA-256 : $ZipFileName.sha256" -ForegroundColor White
Write-Host "  Empreinte SHA256: $HashValue" -ForegroundColor Yellow
Write-Host "================================================================================`n" -ForegroundColor Cyan
