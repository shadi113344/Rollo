@echo off
REM Close Cursor/terminals using this folder, then run this script.
cd /d "c:\Storage"
if exist "Rollo" (
  echo Folder c:\Storage\Rollo already exists.
  pause
  exit /b 1
)
if not exist "video-page" (
  echo Folder c:\Storage\video-page not found — maybe already renamed?
  pause
  exit /b 1
)
rename "video-page" "Rollo"
echo Renamed to c:\Storage\Rollo
echo Reopen that folder in Cursor.
pause
