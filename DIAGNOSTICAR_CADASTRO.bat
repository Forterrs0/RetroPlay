@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Diagnostico de cadastro - Retro Play
where node >nul 2>nul
if errorlevel 1 (
 echo ERRO: Node.js nao esta instalado ou nao esta no PATH.
) else (
 node scripts/diagnosticar-cadastro.mjs
)
echo.
pause
