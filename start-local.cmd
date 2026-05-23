@echo off
chcp 65001 >nul
echo ======================================
echo  GTA RP Core — Локальный запуск
echo ======================================
echo.

set NODE_PATH=C:\Users\iSSGamer\Desktop\node-v24.16.0-win-x64
set PATH=%NODE_PATH%;%PATH%

echo [1/2] Проверка Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ОШИБКА: Node.js не найден. Путь: %NODE_PATH%
    pause
    exit /b 1
)
echo OK: node %NODE_PATH%

echo.
echo [2/2] Запуск сервера...
set DATABASE_URL=postgresql://postgres:rfHurWmHIkKNNfEWtnUvpsKUKjZhKMsQ@kodama.proxy.rlwy.net:39546/railway
set JWT_SECRET=local-dev-secret-key-32-chars-long-123456
set ADMIN_TOKEN=local-admin-token-for-testing-only-12345
set BOOTSTRAP_FOUNDER_EMAIL=ianvar633@gmail.com
set STARTER_VEHICLE_MODEL=asea
set PORT=4000
set CORS_ORIGINS=*
set NODE_ENV=development
set PGSSLMODE=require

cd /d "%~dp0"
npm --workspace @gta-rp/shared run build
npm --workspace @gta-rp/server run build
npm --workspace @gta-rp/server run start
