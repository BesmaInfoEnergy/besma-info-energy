@echo off
REM ==============================================================================
REM BESMAINFOENERGY - LANCEUR RAPIDE WINDOWS (SONELGAZ)
REM ==============================================================================
title BesmaInfoEnergy - Plateforme de Supervision Energetique
cls
echo ================================================================================
echo    BESMAINFOENERGY - DEMARRAGE DE L'AGENT ENERGETIQUE SOUS WINDOWS
echo ================================================================================
echo.
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Node.js n'a pas ete detecte sur cette machine Windows.
    echo Veuillez installer Node.js depuis https://nodejs.org/ (version LTS).
    echo.
    pause
    exit /b 1
)

echo [INFO] Verification de l'environnement et lancement de BesmaInfoEnergy...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_windows.ps1" %*

echo.
echo [INFO] Session BesmaInfoEnergy terminee.
