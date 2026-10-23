@echo off
echo ========================================================
echo   Starting OmniVision Studio - Edge Vision AI Suite
echo ========================================================
echo.

start "OmniVision Backend (FastAPI)" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && python main.py"
start "OmniVision Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo OmniVision Studio is launching:
echo   - Backend:  http://127.0.0.1:8000
echo   - Frontend: http://localhost:5173
echo.
pause
