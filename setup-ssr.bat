@echo off
REM Setup script for SSR configuration on Windows PowerShell

echo.
echo 🚀 Starting SSR Setup...
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js not found. Please install Node.js first.
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js %NODE_VERSION% found

REM Install dependencies
echo.
echo 📦 Installing dependencies...
call npm install

REM Generate data
echo.
echo 📊 Generating story data...
call npm run generate

REM Build SSR
echo.
echo 🏗️ Building SSR...
call npm run build:ssr

REM Prerender
echo.
echo 📄 Prerendering static pages...
call npm run prerender

echo.
echo ✅ SSR setup complete!
echo.
echo 📁 Output: docs\ folder
echo 🚀 To test locally: npm start
echo 🌐 Visit: http://localhost:4200
echo.
