import asyncio
import base64
import time
from datetime import datetime
from typing import Optional, Callable, List, Dict, Any
import cv2

from ..domain.models import BiometricMetrics, AlertLevel
from ..domain.fitness import FitnessMetrics
from ..domain.gestures import GestureMetrics
from ..domain.focus import FocusMetrics
from ..domain.creative import (
    ThereminMetrics,
    HoloWindowMetrics,
    AsciiMetrics,
    CanvasMetrics,
    SegmentationMetrics,
    AvatarMetrics,
)
from ..infrastructure.camera import ThreadedCamera
from ..infrastructure.vision import VisionEngine
from ..infrastructure.database import async_session, SessionRecord, AlertLog


class MonitoringService:
    """
    Core orchestrator: connects Camera, Multi-Tool VisionEngine, Database, and WebSockets.
    """

    def __init__(self, camera_index: int = 0):
        self.camera_index = camera_index
        self.camera: Optional[ThreadedCamera] = None
        self.vision_engine: Optional[VisionEngine] = None

        self._is_running = False
        self._active_tool = "ergonomics"
        self._current_session_id: Optional[int] = None
        self._listeners: List[Callable[[Dict[str, Any]], Any]] = []

        # Session tracking metrics
        self._session_start_time = 0.0
        self._good_posture_seconds = 0.0
        self._alert_count = 0
        self._microsleep_count = 0

        # Calibration buffer
        self._calibrating = False
        self._calibration_samples_ear: List[float] = []
        self._calibration_samples_neck: List[float] = []

    def register_listener(self, callback: Callable[[Dict[str, Any]], Any]):
        """Registers a callback for WebSocket streaming."""
        self._listeners.append(callback)

    def unregister_listener(self, callback: Callable[[Dict[str, Any]], Any]):
        if callback in self._listeners:
            self._listeners.remove(callback)

    def set_active_tool(self, tool_name: str, sub_param: Optional[str] = None):
        """Switches the active vision pipeline instantly."""
        self._active_tool = tool_name
        if self.vision_engine:
            self.vision_engine.set_tool(tool_name, sub_param)

    async def start(self):
        """Starts monitoring session."""
        if self._is_running:
            return

        self.vision_engine = VisionEngine()
        self.vision_engine.set_tool(self._active_tool)

        try:
            self.camera = ThreadedCamera(src=self.camera_index)
            self.camera.start()
        except Exception as e:
            print(f"Warning: Camera init failed ({e}). Running in synthetic mode.")
            self.camera = None

        self._is_running = True
        self._session_start_time = time.time()
        self._good_posture_seconds = 0.0
        self._alert_count = 0
        self._microsleep_count = 0

        # Create session record in DB
        async with async_session() as db:
            session_rec = SessionRecord(started_at=datetime.utcnow())
            db.add(session_rec)
            await db.commit()
            await db.refresh(session_rec)
            self._current_session_id = session_rec.id

        asyncio.create_task(self._process_loop())

    async def stop(self):
        """Stops the monitoring session and persists summary."""
        if not self._is_running:
            return

        self._is_running = False
        duration = time.time() - self._session_start_time

        if self.camera:
            self.camera.stop()
            self.camera = None

        if self.vision_engine:
            self.vision_engine.close()
            self.vision_engine = None

        # Update DB session
        if self._current_session_id:
            async with async_session() as db:
                session_rec = await db.get(SessionRecord, self._current_session_id)
                if session_rec:
                    session_rec.ended_at = datetime.utcnow()
                    session_rec.duration_seconds = duration
                    session_rec.good_posture_seconds = self._good_posture_seconds
                    session_rec.alert_count = self._alert_count
                    session_rec.microsleep_count = self._microsleep_count
                    await db.commit()

    def trigger_calibration(self):
        """Triggers a 3-second calibration phase."""
        self._calibrating = True
        self._calibration_samples_ear.clear()
        self._calibration_samples_neck.clear()

    async def _process_loop(self):
        """Main processing loop: pulls frame, processes active tool, broadcasts."""
        prev_time = time.time()

        while self._is_running:
            now = time.time()
            dt = now - prev_time
            prev_time = now

            tool_id = self._active_tool
            raw_metrics = None
            frame_jpg_base64 = None

            if self.camera:
                has_frame, frame = self.camera.read()
                if has_frame and frame is not None:
                    tool_id, raw_metrics, annotated_frame = self.vision_engine.process_frame(
                        frame, timestamp=now, dt=dt
                    )

                    # Encode lightweight preview (JPEG q=60)
                    _, buffer = cv2.imencode(".jpg", annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                    frame_jpg_base64 = base64.b64encode(buffer).decode("utf-8")

            # Format tool-specific metrics dictionary
            formatted_metrics = self._format_metrics(tool_id, raw_metrics, dt)

            payload = {
                "timestamp": now,
                "fps": round(self.camera.fps, 1) if self.camera else 0.0,
                "tool": tool_id,
                "calibrating": self._calibrating,
                "metrics": formatted_metrics,
                "stats": {
                    "duration_seconds": round(now - self._session_start_time, 0),
                    "good_posture_seconds": round(self._good_posture_seconds, 0),
                    "alert_count": self._alert_count,
                    "microsleep_count": self._microsleep_count,
                },
                "frame": frame_jpg_base64,
            }

            # Broadcast to all WebSocket listeners
            for listener in list(self._listeners):
                try:
                    res = listener(payload)
                    if asyncio.iscoroutine(res):
                        await res
                except Exception:
                    pass

            await asyncio.sleep(0.033)

    def _format_metrics(self, tool_id: str, raw_metrics: Any, dt: float) -> Dict[str, Any]:
        if tool_id == "ergonomics":
            if isinstance(raw_metrics, BiometricMetrics):
                if raw_metrics.posture_status == "GOOD":
                    self._good_posture_seconds += dt
                if self._calibrating:
                    self._calibration_samples_ear.append(raw_metrics.ear_avg)
                    self._calibration_samples_neck.append(raw_metrics.neck_inclination_deg)
                    if len(self._calibration_samples_ear) >= 45:
                        avg_ear = sum(self._calibration_samples_ear) / len(self._calibration_samples_ear)
                        avg_neck = sum(self._calibration_samples_neck) / len(self._calibration_samples_neck)
                        self.vision_engine.fsm.update_calibration(avg_ear, avg_neck)
                        self._calibrating = False

                if raw_metrics.alert_level in (AlertLevel.WARNING, AlertLevel.CRITICAL):
                    self._alert_count += 1
                    if raw_metrics.fatigue_status == "MICROSLEEP":
                        self._microsleep_count += 1

                return {
                    "ear_left": round(raw_metrics.ear_left, 3),
                    "ear_right": round(raw_metrics.ear_right, 3),
                    "ear_avg": round(raw_metrics.ear_avg, 3),
                    "mar": round(raw_metrics.mar, 3),
                    "neck_angle": round(raw_metrics.neck_inclination_deg, 1),
                    "shoulder_tilt": round(raw_metrics.shoulder_tilt_deg, 1),
                    "fatigue_status": raw_metrics.fatigue_status.value,
                    "posture_status": raw_metrics.posture_status.value,
                    "alert_level": raw_metrics.alert_level.value,
                    "message": raw_metrics.message,
                }
            return {
                "ear_left": 0.0, "ear_right": 0.0, "ear_avg": 0.0, "mar": 0.0,
                "neck_angle": 90.0, "shoulder_tilt": 0.0,
                "fatigue_status": "NO_FACE", "posture_status": "NO_FACE",
                "alert_level": "NORMAL", "message": "Aguardando detecção facial...",
            }

        elif tool_id == "fitness":
            if isinstance(raw_metrics, FitnessMetrics):
                return {
                    "exercise": raw_metrics.exercise.value,
                    "reps_count": raw_metrics.reps_count,
                    "joint_angle": raw_metrics.joint_angle,
                    "state": raw_metrics.state.value,
                    "form_quality": raw_metrics.form_quality,
                    "target_angle": raw_metrics.target_angle,
                    "rep_progress": raw_metrics.rep_progress,
                    "feedback": raw_metrics.feedback,
                    "message": f"{raw_metrics.reps_count} reps • {raw_metrics.feedback}",
                }
            return {
                "exercise": "SQUAT", "reps_count": 0, "joint_angle": 180.0,
                "state": "UP", "form_quality": "N/A", "target_angle": 90.0,
                "rep_progress": 0.0, "feedback": "Posicione-se em frente à câmera",
                "message": "Aguardando detecção de corpo inteiro...",
            }

        elif tool_id == "gestures":
            if isinstance(raw_metrics, GestureMetrics):
                return {
                    "gesture": raw_metrics.gesture.value,
                    "fingers_up_count": raw_metrics.fingers_up_count,
                    "is_pinching": raw_metrics.is_pinching,
                    "pinch_distance": raw_metrics.pinch_distance,
                    "confidence": raw_metrics.confidence,
                    "message": raw_metrics.message,
                }
            return {
                "gesture": "UNKNOWN", "fingers_up_count": 0, "is_pinching": False,
                "pinch_distance": 0.0, "confidence": 0.0,
                "message": "Mostre a mão para a câmera",
            }

        elif tool_id == "focus":
            if isinstance(raw_metrics, FocusMetrics):
                return {
                    "gaze_yaw": round(raw_metrics.gaze_yaw_deg, 1),
                    "gaze_pitch": round(raw_metrics.gaze_pitch_deg, 1),
                    "status": raw_metrics.status.value,
                    "focus_score": round(raw_metrics.focus_score, 1),
                    "distraction_count": raw_metrics.distraction_count,
                    "message": raw_metrics.message,
                }
            return {
                "gaze_yaw": 0.0, "gaze_pitch": 0.0, "status": "FOCUSED",
                "focus_score": 100.0, "distraction_count": 0,
                "message": "Aguardando detecção de olhar...",
            }

        elif tool_id == "theremin":
            if isinstance(raw_metrics, ThereminMetrics):
                return {
                    "active_frequency_hz": raw_metrics.active_frequency_hz,
                    "filter_cutoff_hz": raw_metrics.filter_cutoff_hz,
                    "is_playing": raw_metrics.is_playing,
                    "left_hand": {
                        "label": raw_metrics.left_hand.label,
                        "x": raw_metrics.left_hand.x,
                        "y": raw_metrics.left_hand.y,
                        "pinch": raw_metrics.left_hand.pinch,
                        "pinch_dist": raw_metrics.left_hand.pinch_dist,
                        "fingers_up": raw_metrics.left_hand.fingers_up,
                        "pinch_amount": raw_metrics.left_hand.pinch_amount,
                        "landmarks": raw_metrics.left_hand.landmarks,
                        "gesture_degree": raw_metrics.left_hand.gesture_degree,
                        "non_thumb_fingers": raw_metrics.left_hand.non_thumb_fingers,
                        "thumb_up": raw_metrics.left_hand.thumb_up,
                        "wrist_tilt": raw_metrics.left_hand.wrist_tilt,
                    } if raw_metrics.left_hand else None,
                    "right_hand": {
                        "label": raw_metrics.right_hand.label,
                        "x": raw_metrics.right_hand.x,
                        "y": raw_metrics.right_hand.y,
                        "pinch": raw_metrics.right_hand.pinch,
                        "pinch_dist": raw_metrics.right_hand.pinch_dist,
                        "fingers_up": raw_metrics.right_hand.fingers_up,
                        "pinch_amount": raw_metrics.right_hand.pinch_amount,
                        "landmarks": raw_metrics.right_hand.landmarks,
                        "gesture_degree": raw_metrics.right_hand.gesture_degree,
                        "non_thumb_fingers": raw_metrics.right_hand.non_thumb_fingers,
                        "thumb_up": raw_metrics.right_hand.thumb_up,
                        "wrist_tilt": raw_metrics.right_hand.wrist_tilt,
                    } if raw_metrics.right_hand else None,
                    "message": raw_metrics.message,
                }
            return {
                "active_frequency_hz": 440.0, "filter_cutoff_hz": 2000.0,
                "is_playing": False, "left_hand": None, "right_hand": None,
                "message": "Posicione as mãos para tocar",
            }

        elif tool_id == "holowindow":
            if isinstance(raw_metrics, HoloWindowMetrics):
                return {
                    "head_x": raw_metrics.head_x,
                    "head_y": raw_metrics.head_y,
                    "head_z": raw_metrics.head_z,
                    "yaw": raw_metrics.yaw,
                    "pitch": raw_metrics.pitch,
                    "tracked": raw_metrics.tracked,
                    "peek_revealed": raw_metrics.peek_revealed,
                    "head_distance_cm": raw_metrics.head_distance_cm,
                    "message": raw_metrics.message,
                }
            return {
                "head_x": 0.0, "head_y": 0.0, "head_z": 1.0,
                "yaw": 0.0, "pitch": 0.0, "tracked": False,
                "peek_revealed": False, "head_distance_cm": 60.0,
                "message": "Aguardando rosto para calibrar 3D",
            }

        elif tool_id == "ascii":
            if isinstance(raw_metrics, AsciiMetrics):
                return {
                    "brightness": raw_metrics.brightness,
                    "contrast": raw_metrics.contrast,
                    "message": raw_metrics.message,
                }
            return {"brightness": 128.0, "contrast": 50.0, "message": "Renderizando Matriz ASCII"}

        elif tool_id == "canvas":
            if isinstance(raw_metrics, CanvasMetrics):
                return {
                    "index_x": raw_metrics.index_x,
                    "index_y": raw_metrics.index_y,
                    "is_drawing": raw_metrics.is_drawing,
                    "brush_size": raw_metrics.brush_size,
                    "hand_detected": raw_metrics.hand_detected,
                    "clear_gesture": raw_metrics.clear_gesture,
                    "message": raw_metrics.message,
                }
            return {
                "index_x": 0.5, "index_y": 0.5, "is_drawing": False,
                "brush_size": 10.0, "hand_detected": False, "clear_gesture": False,
                "message": "Mostre a mão para desenhar",
            }

        elif tool_id == "segmentation":
            if isinstance(raw_metrics, SegmentationMetrics):
                return {
                    "mode": raw_metrics.mode,
                    "person_coverage_pct": raw_metrics.person_coverage_pct,
                    "message": raw_metrics.message,
                }
            return {"mode": "bokeh_heavy", "person_coverage_pct": 0.0, "message": "Processando estúdio..."}

        elif tool_id == "avatar":
            if isinstance(raw_metrics, AvatarMetrics):
                return {
                    "left_eye_open": raw_metrics.left_eye_open,
                    "right_eye_open": raw_metrics.right_eye_open,
                    "mouth_open": raw_metrics.mouth_open,
                    "smile": raw_metrics.smile,
                    "eyebrow_raise": raw_metrics.eyebrow_raise,
                    "head_yaw": raw_metrics.head_yaw,
                    "head_pitch": raw_metrics.head_pitch,
                    "head_roll": raw_metrics.head_roll,
                    "face_detected": raw_metrics.face_detected,
                    "message": raw_metrics.message,
                }
            return {
                "left_eye_open": 1.0, "right_eye_open": 1.0, "mouth_open": 0.0,
                "smile": 0.0, "eyebrow_raise": 0.0, "head_yaw": 0.0,
                "head_pitch": 0.0, "head_roll": 0.0, "face_detected": False,
                "message": "Olhe para a câmera para animar o Avatar 3D",
            }

        return {"message": "Ferramenta pronta"}
