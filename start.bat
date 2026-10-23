@echo off
echo ========================================================
echo   Iniciando ErgoPulse Studio - Suite de Visao Computacional
echo ========================================================
echo.

start "ErgoPulse Backend (FastAPI)" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && python main.py"
start "ErgoPulse Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ErgoPulse Studio inicializado:
echo   - Backend:  http://127.0.0.1:8000
echo   - Frontend: http://localhost:5173
echo.
pause
