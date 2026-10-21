@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Menorca3D Forge
where node >nul 2>nul || (echo Falta Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo. & pause & exit /b 1)
set "V07=..\menorca3d_v2\v0.7"

rem 1) three.js para Forge (aqui) y para el exportador de menorca3d_v2 (en v0.7)
if not exist "node_modules\three\build\three.module.js" if not exist "%V07%\node_modules\three\build\three.module.js" (
  echo Instalando three.js ^(solo la primera vez^)...
  call npm install
)
rem 2) Si three solo esta aqui, se enlaza en v0.7 (enlace "junction": no copia nada ni pide administrador)
if exist "node_modules\three\build\three.module.js" if not exist "%V07%\node_modules\three\build\three.module.js" (
  if not exist "%V07%\node_modules" mkdir "%V07%\node_modules"
  mklink /J "%V07%\node_modules\three" "%~dp0node_modules\three" >nul && echo three.js enlazado en menorca3d_v2\v0.7\node_modules\three
)
if not exist "%V07%\node_modules\three\build\three.module.js" (
  echo No se pudo preparar three.js para el exportador. Ejecuta  npm install  dentro de menorca3d_v2\v0.7
  pause
)

start "" cmd /c "timeout /t 2 >nul & start http://localhost:5180"
node servidor.cjs %*
pause
