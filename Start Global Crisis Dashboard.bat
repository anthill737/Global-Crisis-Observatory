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
echo The dashboard will open automatically in your default browser when the local server is ready.
echo If the browser does not open, manually open this exact local URL:
echo   %LOCAL_APP_URL%
echo If Vite prints a different local URL below, open that exact URL instead.
echo.
echo Keep this window open while using the Global Crisis Dashboard.
echo Press Ctrl+C to stop the local server.
echo.
call %LAUNCH_COMMAND%
set "LAUNCH_EXIT=%ERRORLEVEL%"
echo.
if not "%LAUNCH_EXIT%"=="0" (
    echo The local server stopped or failed with exit code %LAUNCH_EXIT%.
    echo Review the startup messages above, then manually open this exact local URL if the server is running:
    echo   %LOCAL_APP_URL%
) else (
    echo The local server stopped.
)
echo.
pause
popd >nul 2>nul
exit /b %LAUNCH_EXIT%
