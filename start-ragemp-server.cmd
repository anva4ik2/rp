@echo off
REM Build + sync RAGE MP resource to %RAGEMP_SERVER_FILES% (or ./server-files)
setlocal
call npm run build || goto :error
call npm run sync:ragemp || goto :error
echo.
echo Done. Now run ragemp-server.exe from %RAGEMP_SERVER_FILES%
goto :eof
:error
echo Build/sync failed.
exit /b 1
