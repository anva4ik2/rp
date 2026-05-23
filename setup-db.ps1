# GTA RP Core — Database Setup Script
# Run this in PowerShell as Administrator

$pgPath = "C:\Program Files\PostgreSQL\18\bin"
$pgPort = 8080

Write-Host "Creating database and user on port $pgPort..."

# Запрашиваем пароль суперпользователя postgres
$env:PGPASSWORD = Read-Host "Введите пароль суперпользователя postgres" -AsSecureString | ForEach-Object { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($_)) }

# Создаем базу данных
& "$pgPath\psql.exe" -U postgres -p $pgPort -c "CREATE DATABASE gta_rp;" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "База gta_rp уже существует или ошибка, продолжаем..."
}

# Создаем пользователя
& "$pgPath\psql.exe" -U postgres -p $pgPort -c "CREATE USER gta_user WITH PASSWORD '1111';" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Пользователь gta_user уже существует или ошибка, продолжаем..."
}

# Даем права
& "$pgPath\psql.exe" -U postgres -p $pgPort -c "GRANT ALL PRIVILEGES ON DATABASE gta_rp TO gta_user;"
& "$pgPath\psql.exe" -U postgres -p $pgPort -c "ALTER DATABASE gta_rp OWNER TO gta_user;"

Write-Host "Готово! База настроена."
Write-Host "Строка подключения: postgresql://gta_user:1111@localhost:8080/gta_rp"
