from dataclasses import dataclass
from enum import Enum
from typing import Optional
import math
from .models import Point2D


class FocusStatus(str, Enum):
    FOCUSED = "FOCUSED"
    LOOKING_AWAY = "LOOKING_AWAY"
    PHONE_SUSPECT = "PHONE_SUSPECT"
    DISTRACTED = "DISTRACTED"


@dataclass
class FocusMetrics:
    status: FocusStatus
    focus_percentage: float
    gaze_yaw: float    # Left/Right head turn in degrees
    gaze_pitch: float  # Up/Down head turn in degrees
    distraction_count: int
    current_distraction_sec: float
    message: str


def estimate_head_pose_angles(
    nose: Point2D,
    chin: Point2D,
    left_eye: Point2D,
    right_eye: Point2D,
) -> tuple[float, float]:
    """
    Estimates horizontal (yaw) and vertical (pitch) deflection angles in degrees.
    """
    # Midpoint of eyes
    eye_mid_x = (left_eye.x + right_eye.x) / 2.0
    eye_mid_y = (left_eye.y + right_eye.y) / 2.0
    eye_dist = left_eye.distance_to(right_eye)

    if eye_dist <= 1e-6:
        return 0.0, 0.0

    # Yaw: horizontal offset of nose from eye midpoint normalized by eye distance
    dx_nose = nose.x - eye_mid_x
    yaw_ratio = dx_nose / (eye_dist * 0.5)
    yaw_deg = math.degrees(math.atan(yaw_ratio))

    # Pitch: vertical ratio of eye-nose distance to nose-chin distance
    d_eye_nose = nose.y - eye_mid_y
    d_nose_chin = chin.y - nose.y

    if d_nose_chin <= 1e-6:
        pitch_deg = 0.0
    else:
        # Balanced ratio is approx 0.8 to 1.1
        ratio = d_eye_nose / d_nose_chin
        pitch_deg = (ratio - 0.95) * 55.0

    return float(yaw_deg), float(pitch_deg)


class FocusStateMachine:
    """
    Tracks sustained focus vs distractions with temporal hysteresis.
    """

    def __init__(
        self,
        yaw_threshold: float = 22.0,
        pitch_down_threshold: float = -18.0,
        distraction_grace_sec: float = 3.0,
    ):
        self.yaw_threshold = yaw_threshold
        self.pitch_down_threshold = pitch_down_threshold
        self.distraction_grace_sec = distraction_grace_sec

        self._diverted_start: Optional[float] = None
        self._total_active_sec = 0.0
        self._total_focused_sec = 0.0
        self.distraction_count = 0

    def update(
        self, timestamp: float, dt: float, yaw: float, pitch: float
    ) -> FocusMetrics:
        self._total_active_sec += dt

        is_diverted = abs(yaw) > self.yaw_threshold or pitch < self.pitch_down_threshold
        current_distracted_sec = 0.0
        status = FocusStatus.FOCUSED
        message = "Foco total na tela"

        if is_diverted:
            if self._diverted_start is None:
                self._diverted_start = timestamp
            current_distracted_sec = timestamp - self._diverted_start

            if current_distracted_sec >= self.distraction_grace_sec:
                if pitch < self.pitch_down_threshold:
                    status = FocusStatus.PHONE_SUSPECT
                    message = "Atenção: Cabeça inclinada para baixo (Uso de celular?)"
                else:
                    status = FocusStatus.DISTRACTED
                    message = "Atenção: Olhar desviado da tela prolongadamente"

                if current_distracted_sec == timestamp - self._diverted_start:
                    # Increment count only once per distraction event
                    if current_distracted_sec - dt < self.distraction_grace_sec:
                        self.distraction_count += 1
            else:
                status = FocusStatus.LOOKING_AWAY
                message = "Desvio temporário do olhar"
        else:
            self._diverted_start = None
            self._total_focused_sec += dt

        focus_pct = 100.0
        if self._total_active_sec > 0:
            focus_pct = (self._total_focused_sec / self._total_active_sec) * 100.0

        return FocusMetrics(
            status=status,
            focus_percentage=round(min(100.0, max(0.0, focus_pct)), 1),
            gaze_yaw=round(yaw, 1),
            gaze_pitch=round(pitch, 1),
            distraction_count=self.distraction_count,
            current_distraction_sec=round(current_distracted_sec, 1),
            message=message,
        )
