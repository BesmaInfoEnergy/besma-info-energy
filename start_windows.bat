@echo off
REM ==============================================================================
REM BESMAINFOENERGY — LANCEUR RAPIDE WINDOWS (DOUBLE-CLIC OU TERMINAL VS CODE)
REM ==============================================================================
chcp 65001 >nul
echo ================================================================================
echo    BESMAINFOENERGY — LANCEMENT LOCAL SOUS WINDOWS (VS CODE)
echo ================================================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_windows.ps1"
pause
