# GTA RP Core — Database Setup Script
# Run this in PowerShell as Administrator

$pgPath = "C:\Program Files\PostgreSQL\18\bin"
$env:PGPASSWORD = Read-Host "Enter postgres superuser password" -AsSecureString | ForEach-Object { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($_)) }

Write-Host "Creating database and user..."

& "$pgPath\psql.exe" -U postgres -c "CREATE DATABASE gta_rp;" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Database gta_rp may already exist, continuing..."
}

& "$pgPath\psql.exe" -U postgres -c "CREATE USER gta_user WITH PASSWORD '1111';" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "User gta_user may already exist, continuing..."
}

& "$pgPath\psql.exe" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE gta_rp TO gta_user;"
& "$pgPath\psql.exe" -U postgres -c "ALTER DATABASE gta_rp OWNER TO gta_user;"

Write-Host "Done! Database configured."
Write-Host "Connection string: postgresql://gta_user:1111@localhost:8080/gta_rp"
