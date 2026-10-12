# ==============================================================================
# BESMAINFOENERGY — SCRIPT D'INSTALLATION & TEST LOCAL SOUS WINDOWS (POWERSHELL)
# Environnement cible : Windows 10 / 11 + VS Code
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "   BESMAINFOENERGY — PRÉPARATION & LANCEMENT LOCAL SOUS WINDOWS (VS CODE)       " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# 1. Vérification de Node.js et Python
Write-Host "`n[1/5] Vérification de Node.js et Python sur votre PC Windows..." -ForegroundColor Yellow
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "Erreur : Node.js n'est pas installé. Téléchargez-le sur https://nodejs.org (version LTS)." -ForegroundColor Red
    exit 1
}
$nodeVer = node -v
Write-Host "  -> Node.js détecté : $nodeVer" -ForegroundColor Green

$pythonCmd = $null
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command "python3" -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
}

if ($pythonCmd) {
    $pyVer = & $pythonCmd --version
    Write-Host "  -> Python détecté : $pyVer" -ForegroundColor Green
} else {
    Write-Host "  -> Avertissement : Python n'est pas détecté dans le PATH Windows (optionnel pour le test Web rapide)." -ForegroundColor Yellow
}

# 2. Création des dossiers locaux (keys, models, backups)
Write-Host "`n[2/5] Création des répertoires de sécurité (keys, models, backups)..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path ".\keys" | Out-Null
New-Item -ItemType Directory -Force -Path ".\models" | Out-Null
New-Item -ItemType Directory -Force -Path ".\backups\mongodb" | Out-Null
Write-Host "  -> Répertoires créés avec succès." -ForegroundColor Green

# 3. Initialisation du fichier .env s'il n'existe pas
Write-Host "`n[3/5] Configuration du fichier d'environnement (.env)..." -ForegroundColor Yellow
if (-not (Test-Path ".\.env")) {
    Copy-Item ".\.env.example" ".\.env"
    Write-Host "  -> Fichier .env créé à partir de .env.example." -ForegroundColor Green
} else {
    Write-Host "  -> Fichier .env existant conservé." -ForegroundColor Green
}

# 4. Installation des dépendances NPM
Write-Host "`n[4/5] Installation des dépendances Node.js (npm install)..." -ForegroundColor Yellow
npm install
Write-Host "  -> Dépendances installées avec succès." -ForegroundColor Green

# 5. Exécution des tests unitaires et lancement
Write-Host "`n[5/5] Vérification des tests unitaires et lancement du serveur..." -ForegroundColor Yellow
npm test -- --run

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "  PRÊT ! Démarrage de BesmaInfoEnergy sur http://localhost:3000" -ForegroundColor Green
Write-Host "  Ouvrez votre navigateur sur : http://localhost:3000" -ForegroundColor Green
Write-Host "  (Appuyez sur Ctrl+C dans le terminal VS Code pour arrêter le serveur)" -ForegroundColor Yellow
Write-Host "================================================================================`n" -ForegroundColor Cyan

npm run dev
