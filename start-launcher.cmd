@echo off
setlocal
set NODE_DIR=C:\Users\iSSGamer\Desktop\node-v24.16.0-win-x64
set NPM_EXE=%NODE_DIR%\npm.cmd
if not exist "%NPM_EXE%" (
  set NPM_EXE=npm.cmd
)
cd /d "%~dp0"
set PATH=%NODE_DIR%;%PATH%
call "%NPM_EXE%" --workspace @gta-rp/launcher run dev
