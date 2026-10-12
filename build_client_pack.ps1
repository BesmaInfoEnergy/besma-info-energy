# ==============================================================================
# BESMAINFOENERGY — GÉNÉRATEUR DU PACK CLIENT SOUVERAIN (.ZIP) SOUS WINDOWS
# Client cible : SONELGAZ / Opérateur Énergétique National
# ==============================================================================

$ErrorActionPreference = "Stop"
$DateStr = Get-Date -Format "yyyyMMdd"
$ZipFileName = "BesmaInfoEnergy_Pack_Client_SONELGAZ_$DateStr.zip"
$StagingDir = ".\dist_pack_client"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "   BESMAINFOENERGY — CRÉATION DU PACK OFFICIEL DE LIVRAISON CLIENT (.ZIP)       " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# Nettoyage d'un éventuel ancien dossier de staging ou zip
if (Test-Path $StagingDir) { Remove-Item -Recurse -Force $StagingDir }
if (Test-Path $ZipFileName) { Remove-Item -Force $ZipFileName }

New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null

Write-Host "`n[1/3] Copie des fichiers sources, scripts et configurations (hors node_modules et secrets)..." -ForegroundColor Yellow

$ItemsToCopy = @(
    "src",
    "backend",
    "infrastructure",
    "scripts",
    "public",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "index.html",
    "metadata.json",
    ".env.example",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.prod.yml",
    "install_production.sh",
    "install_windows.ps1",
    "start_windows.bat",
    "LIVRAISON_CLIENT_SONELGAZ.md",
    "README.md"
)

foreach ($item in $ItemsToCopy) {
    if (Test-Path $item) {
        Copy-Item -Path $item -Destination "$StagingDir\$item" -Recurse -Force
        Write-Host "  -> Inclus : $item" -ForegroundColor Green
    }
}

Write-Host "`n[2/3] Création de l'archive compressée $ZipFileName..." -ForegroundColor Yellow
Compress-Archive -Path "$StagingDir\*" -DestinationPath $ZipFileName -Force

Write-Host "`n[3/3] Calcul de l'empreinte d'intégrité SHA-256 du Pack Client..." -ForegroundColor Yellow
$HashObj = Get-FileHash -Path $ZipFileName -Algorithm SHA256
$HashValue = $HashObj.Hash
"$HashValue  $ZipFileName" | Out-File -FilePath "$ZipFileName.sha256" -Encoding utf8

# Nettoyage du dossier temporaire
Remove-Item -Recurse -Force $StagingDir

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "  PACK CLIENT GÉNÉRÉ AVEC SUCCÈS !" -ForegroundColor Green
Write-Host "  Fichier Archive : $ZipFileName" -ForegroundColor White
Write-Host "  Fichier SHA-256 : $ZipFileName.sha256" -ForegroundColor White
Write-Host "  Empreinte SHA256: $HashValue" -ForegroundColor Yellow
Write-Host "================================================================================`n" -ForegroundColor Cyan
