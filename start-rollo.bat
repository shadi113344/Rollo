@echo off
cd /d "%~dp0"
set PORT=3847
echo.
echo Rollo uses port %PORT% — NOT 3000 (that is a different app on this PC).
echo Use the Tailscale URL below on your phone, including :%PORT%
echo.
node -e "require('./lib/network').printAccessInfo(%PORT%)"
echo.
node server.js
pause
