from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json

from ..infrastructure.database import init_db
from ..services.monitor import MonitoringService
from .websocket import ws_manager
from .routes import router as api_router

monitoring_service = MonitoringService(camera_index=0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database & start monitoring service
    await init_db()
    
    # Broadcast telemetry to WebSockets
    monitoring_service.register_listener(ws_manager.broadcast_json)
    await monitoring_service.start()
    
    yield
    
    # Shutdown
    await monitoring_service.stop()


def create_app() -> FastAPI:
    app = FastAPI(
        title="ErgoPulse API",
        description="Edge Biometrics & Posture Intelligence Daemon",
        version="1.2.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    @app.post("/api/calibrate")
    async def trigger_calibration():
        monitoring_service.trigger_calibration()
        return {"status": "ok", "message": "Calibração iniciada. Mantenha postura neutra por 2 segundos."}

    @app.post("/api/session/start")
    async def start_session():
        await monitoring_service.start()
        return {"status": "started"}

    @app.post("/api/session/stop")
    async def stop_session():
        await monitoring_service.stop()
        return {"status": "stopped"}

    @app.post("/api/tool/switch")
    async def switch_tool(payload: dict):
        tool = payload.get("tool", "ergonomics")
        param = payload.get("param")
        monitoring_service.set_active_tool(tool, param)
        return {"status": "ok", "active_tool": tool, "param": param}

    @app.websocket("/ws/stream")
    async def websocket_stream(websocket: WebSocket):
        await ws_manager.connect(websocket)
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    payload = json.loads(data)
                    action = payload.get("action")
                    if action == "switch_tool":
                        monitoring_service.set_active_tool(payload.get("tool"), payload.get("param"))
                    elif action == "calibrate":
                        monitoring_service.trigger_calibration()
                    elif action == "stop":
                        await monitoring_service.stop()
                    elif action == "start":
                        await monitoring_service.start()
                except Exception:
                    pass
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket)

    return app


app = create_app()
