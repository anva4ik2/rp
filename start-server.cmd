@echo off  
setlocal  
set NODE_DIR=C:\Users\iSSGamer\Desktop\node-v24.16.0-win-x64  
set NPM_EXE=%%NODE_DIR%%\npm.cmd  
if not exist \" "%%NPM_EXE%%\ (  
  set NPM_EXE=npm.cmd  
)  
cd /d \%%~dp0\  
set PATH=%%NODE_DIR%%;%C:\Program Files\Google\Chrome\Application;C:\Program Files (x86)\Common Files\Oracle\Java\java8path;C:\Program Files (x86)\Common Files\Oracle\Java\javapath;C:\windows\system32;C:\windows;C:\windows\System32\Wbem;C:\windows\System32\WindowsPowerShell\v1.0\;C:\Users\iSSGamer\AppData\Local\Microsoft\WindowsApps%  
call \%%NPM_EXE%%\ --workspace @gta-rp/server run dev 
