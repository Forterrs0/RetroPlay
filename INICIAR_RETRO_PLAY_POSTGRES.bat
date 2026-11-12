@echo off
cd /d "%~dp0"
set "RETRO_DB_ENGINE=postgres"
if not exist ".env" (echo Arquivo .env ausente. & pause & exit /b 1)
echo Iniciando Retro Play com PostgreSQL...
node --env-file=.env server/server.mjs
if errorlevel 1 pause
