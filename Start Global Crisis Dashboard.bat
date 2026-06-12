@echo off
setlocal EnableExtensions

title Global Crisis Dashboard Launcher

set "LOCAL_APP_URL=http://127.0.0.1:5173/"
set "INSTALL_COMMAND=npm install"
set "LAUNCH_COMMAND=npm run dev -- --open"

pushd "%~dp0" >nul 2>nul
if errorlevel 1 (
    echo Could not open the project folder next to this launcher:
    echo   %~dp0
    echo Move this launcher back to the project root and try again.
    echo.
    pause
    exit /b 1
)

if not exist "package.json" (
    echo This launcher must be run from the Global Crisis Dashboard project root.
    echo Expected package.json to be next to this file.
    echo.
    echo From the project root, run the install command documented in RUN.md:
    echo   %INSTALL_COMMAND%
    echo.
    pause
    popd >nul 2>nul
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on PATH.
    echo Install Node.js 20 LTS or newer from https://nodejs.org/ and reopen this launcher.
    echo.
    echo Then run the install command documented in RUN.md from the project root:
    echo   %INSTALL_COMMAND%
    echo.
    pause
    popd >nul 2>nul
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo npm was not found on PATH.
    echo Install Node.js 20 LTS or newer with npm from https://nodejs.org/ and reopen this launcher.
    echo.
    echo Then run the install command documented in RUN.md from the project root:
    echo   %INSTALL_COMMAND%
    echo.
    pause
    popd >nul 2>nul
    exit /b 1
)

if not exist "node_modules\" (
    echo Installed dependencies are missing.
    echo Run the install command documented in RUN.md from the project root:
    echo   %INSTALL_COMMAND%
    echo.
    echo After install completes, double-click this launcher again.
    echo.
    pause
    popd >nul 2>nul
    exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
    echo Installed dependencies look incomplete because Vite is missing.
    echo Run the install command documented in RUN.md from the project root:
    echo   %INSTALL_COMMAND%
    echo.
    echo After install completes, double-click this launcher again.
    echo.
    pause
    popd >nul 2>nul
    exit /b 1
)

echo Starting the Global Crisis Dashboard from the project root:
echo   %CD%
echo.
echo Launch command:
echo   %LAUNCH_COMMAND%
echo.
echo Browser auto-open:
echo   Vite receives --open and asks Windows to open your default browser when the local server is ready.
echo.
echo Browser fallback:
echo   If no browser window opens, Windows asks which app to use, or Vite reports that browser opening failed,
echo   copy and paste this fallback URL into your browser:
echo   %LOCAL_APP_URL%
echo   If Vite prints a different local URL below because port 5173 is busy, open that exact URL instead.
echo   The Global Crisis Dashboard only works through the Vite local server; do not open index.html directly.
echo.
echo Keep this window open while using the Global Crisis Dashboard.
echo Press Ctrl+C to stop the local server.
echo.
call %LAUNCH_COMMAND%
set "LAUNCH_EXIT=%ERRORLEVEL%"
echo.
if not "%LAUNCH_EXIT%"=="0" (
    echo The local server stopped or failed with exit code %LAUNCH_EXIT%.
    echo If browser auto-open failed but the server reached a ready state, copy and paste this fallback URL into your browser:
    echo   %LOCAL_APP_URL%
    echo If Vite printed a different local URL above, open that exact URL instead.
) else (
    echo The local server stopped.
)
echo.
pause
popd >nul 2>nul
exit /b %LAUNCH_EXIT%
