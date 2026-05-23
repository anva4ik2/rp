@echo off
chcp 65001 >nul
echo ======================================
echo  GTA RP Core — Локальный запуск
echo ======================================
echo.

set NODE_PATH=C:\Users\iSSGamer\Desktop\node-v24.16.0-win-x64
set PATH=%NODE_PATH%;%PATH%

echo [1/3] Проверка Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ОШИБКА: Node.js не найден. Путь: %NODE_PATH%
    pause
    exit /b 1
)
echo OK: node %NODE_PATH%

echo.
echo [2/3] Проверка PostgreSQL...
set PGHOST=localhost
set PGPORT=8080
set PGUSER=gta_user
set PGPASSWORD=1111
set PGDATABASE=gta_rp

psql --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ==========================================
    echo  PostgreSQL НЕ НАЙДЕН!
    echo ==========================================
    echo.
    echo Вариант 1 — Docker Desktop ^(рекомендуется^):
    echo   1. Скачай: https://www.docker.com/products/docker-desktop
    echo   2. Установи и запусти
    echo   3. В PowerShell выполни:
    echo      docker run -d --name gta-rp-postgres -e POSTGRES_USER=gta_user -e POSTGRES_PASSWORD=1111 -e POSTGRES_DB=gta_rp -p 8080:5432 postgres:16-alpine
    echo.
    echo Вариант 2 — Установка PostgreSQL:
    echo   1. Скачай: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
    echo   2. При установке задай пароль: 1111
    echo   3. Создай базу: CREATE DATABASE gta_rp;
    echo   4. Создай пользователя: CREATE USER gta_user WITH PASSWORD '1111';
    echo   5. Дай права: GRANT ALL PRIVILEGES ON DATABASE gta_rp TO gta_user;
    echo.
    pause
    exit /b 1
)
echo OK: PostgreSQL найден

echo.
echo [3/3] Запуск сервера...
set DATABASE_URL=postgresql://gta_user:1111@localhost:8080/gta_rp
set JWT_SECRET=local-dev-secret-key-32-chars-long-123456
set ADMIN_TOKEN=local-admin-token-for-testing-only-12345
set BOOTSTRAP_FOUNDER_EMAIL=ianvar633@gmail.com
set STARTER_VEHICLE_MODEL=asea
set PORT=4000
set CORS_ORIGINS=*
set NODE_ENV=development

cd /d "%~dp0"
npm --workspace @gta-rp/shared run build
npm --workspace @gta-rp/server run build
npm --workspace @gta-rp/server run start
