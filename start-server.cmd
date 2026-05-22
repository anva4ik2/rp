@echo off
setlocal
set NPM_EXE=C:\Users\SERVER\tools\node-lts\npm.cmd
if not exist "%NPM_EXE%" (
  echo Portable npm not found: %NPM_EXE%
  exit /b 1
)
cd /d "%~dp0"
call "%NPM_EXE%" --workspace @gta-rp/server run dev
