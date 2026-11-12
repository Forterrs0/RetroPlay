@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Retro Play - Cadastro Corrigido V3
cls
echo.
echo ================================================
echo RETRO PLAY V3 - INICIALIZACAO
 echo ================================================
where node >nul 2>nul
if errorlevel 1 goto NO_NODE
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]==22&&v[1]>=13)?0:1)"
if errorlevel 1 goto OLD_NODE
node scripts/verificar-porta.mjs
if errorlevel 1 goto PORT_ERROR
echo Iniciando servidor e banco de dados...
start "Retro Play - Servidor [MANTENHA ABERTO]" /D "%~dp0" cmd /k node server/server.mjs
node scripts/aguardar-servidor.mjs
if errorlevel 1 goto START_ERROR
start "" "http://127.0.0.1:4173"
echo.
echo Site aberto! Voce ja pode clicar em Cadastrar.
echo Mantenha a janela Retro Play - Servidor aberta.
echo.
pause
exit /b 0
:PORT_ERROR
echo.
echo ATENCAO: Porta 4173 ocupada por outra versao ou outro programa.
echo Feche a janela do servidor Retro Play antigo e tente novamente.
echo Se nao souber qual e a janela, reinicie o computador.
pause
exit /b 1
:START_ERROR
echo.
echo Servidor nao respondeu corretamente ou existe versao antiga.
echo Veja a janela de servidor para identificar o erro.
echo Execute DIAGNOSTICAR_CADASTRO.bat para mais informacoes.
pause
exit /b 1
:NO_NODE
echo Instale o Node.js 22.13 ou superior: https://nodejs.org/
pause
exit /b 1
:OLD_NODE
echo Node.js desatualizado. Necessario 22.13 ou superior.
node -v
pause
exit /b 1
