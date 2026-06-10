@echo off
setlocal
cd /d "%~dp0RolloTray"

echo Building Rollo tray launcher...
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true

if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

set "OUT=bin\Release\net8.0-windows\win-x64\publish\Rollo.exe"
set "DEST=..\..\Rollo.exe"

copy /Y "%OUT%" "%DEST%" >nul
echo.
echo Done: %DEST%
echo Requires .NET 8 Desktop Runtime if not already installed.
echo Download: https://dotnet.microsoft.com/download/dotnet/8.0
