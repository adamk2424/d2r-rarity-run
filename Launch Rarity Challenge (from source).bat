@echo off
REM Double-click to run Rarity Challenge from the source checkout.
REM Requires Node.js + Yarn installed. For a no-dependencies version, use the
REM portable .exe from the GitHub Releases page instead.
cd /d "%~dp0"

where yarn >nul 2>nul
if errorlevel 1 (
  echo Yarn is not installed. Install Node.js, then run:  npm install -g yarn
  echo Or download the portable .exe from:
  echo   https://github.com/adamk2424/d2r-rarity-run/releases
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run: installing dependencies, please wait...
  call yarn install
)

echo Starting Rarity Challenge...
call yarn start
