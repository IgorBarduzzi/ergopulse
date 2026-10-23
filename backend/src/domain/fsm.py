from typing import Optional
from .models import (
    BiometricMetrics,
    FatigueStatus,
    PostureStatus,
    AlertLevel,
    UserCalibration,
)


class BiometricStateMachine:
    """
    Finite State Machine with Temporal Hysteresis.
    Prevents false positives from natural eye blinks and momentary posture shifts.
    """

    def __init__(
        self,
        ear_threshold: float = 0.21,
        mar_threshold: float = 0.60,
        neck_angle_min: float = 72.0,
        shoulder_tilt_max: float = 6.5,
        drowsy_time_sec: float = 1.2,
        microsleep_time_sec: float = 2.5,
        yawn_time_sec: float = 2.0,
        posture_grace_time_sec: float = 5.0,
    ):
        self.ear_threshold = ear_threshold
        self.mar_threshold = mar_threshold
        self.neck_angle_min = neck_angle_min
        self.shoulder_tilt_max = shoulder_tilt_max

        # Temporal thresholds
        self.drowsy_time_sec = drowsy_time_sec
        self.microsleep_time_sec = microsleep_time_sec
        self.yawn_time_sec = yawn_time_sec
        self.posture_grace_time_sec = posture_grace_time_sec

        # State tracking timestamps
        self._eyes_closed_start: Optional[float] = None
        self._mouth_open_start: Optional[float] = None
        self._bad_posture_start: Optional[float] = None
        self._asymmetric_start: Optional[float] = None

        self.calibration = UserCalibration()

    def update_calibration(self, baseline_ear: float, baseline_neck_angle: float):
        """Calibrates thresholds to user's natural morphology."""
        self.calibration.baseline_ear = baseline_ear
        self.calibration.baseline_neck_angle = baseline_neck_angle
        self.calibration.is_calibrated = True

        # Adaptive threshold: 75% of resting eye openness
        self.ear_threshold = baseline_ear * self.calibration.ear_threshold_ratio
        # Adaptive posture: tolerance of 12 degrees below baseline
        self.neck_angle_min = max(55.0, baseline_neck_angle - 12.0)

    def evaluate(
        self,
        timestamp: float,
        ear_left: float,
        ear_right: float,
        mar: float,
        neck_angle: float,
        shoulder_tilt: float,
    ) -> BiometricMetrics:
        """
        Evaluates a frame sample through the temporal state machine.
        """
        ear_avg = (ear_left + ear_right) / 2.0

        # --- 1. Evaluate Fatigue State ---
        fatigue_status = FatigueStatus.ALERT
        alert_level = AlertLevel.NORMAL
        message = "Postura e alerta adequados"

        # Eyes closure tracking
        if ear_avg < self.ear_threshold:
            if self._eyes_closed_start is None:
                self._eyes_closed_start = timestamp
            
            elapsed_eyes = timestamp - self._eyes_closed_start

            if elapsed_eyes >= self.microsleep_time_sec:
                fatigue_status = FatigueStatus.MICROSLEEP
                alert_level = AlertLevel.CRITICAL
                message = "ALERTA CRÍTICO: Micro-sono detectado! Abra os olhos!"
            elif elapsed_eyes >= self.drowsy_time_sec:
                fatigue_status = FatigueStatus.DROWSY_SUSPECT
                alert_level = AlertLevel.WARNING
                message = "Atenção: Sinais de sonolência identificados."
        else:
            self._eyes_closed_start = None

        # Yawn tracking
        if mar > self.mar_threshold:
            if self._mouth_open_start is None:
                self._mouth_open_start = timestamp
            elapsed_mar = timestamp - self._mouth_open_start
            if elapsed_mar >= self.yawn_time_sec:
                fatigue_status = FatigueStatus.YAWNING
                if alert_level == AlertLevel.NORMAL:
                    alert_level = AlertLevel.WARNING
                    message = "Fadiga detectada: Bocejo prolongado."
        else:
            self._mouth_open_start = None

        # --- 2. Evaluate Posture State ---
        posture_status = PostureStatus.GOOD

        # Forward head / slouching
        if neck_angle < self.neck_angle_min:
            if self._bad_posture_start is None:
                self._bad_posture_start = timestamp
            elapsed_posture = timestamp - self._bad_posture_start
            if elapsed_posture >= self.posture_grace_time_sec:
                posture_status = PostureStatus.FORWARD_HEAD
                if alert_level == AlertLevel.NORMAL:
                    alert_level = AlertLevel.WARNING
                    message = "Postura: Cabeça projetada para a frente. Realinhe a coluna."
        else:
            self._bad_posture_start = None

        # Shoulder asymmetry
        if shoulder_tilt > self.shoulder_tilt_max:
            if self._asymmetric_start is None:
                self._asymmetric_start = timestamp
            elapsed_asym = timestamp - self._asymmetric_start
            if elapsed_asym >= self.posture_grace_time_sec:
                posture_status = PostureStatus.ASYMMETRIC
                if alert_level == AlertLevel.NORMAL:
                    alert_level = AlertLevel.WARNING
                    message = "Postura: Ombros desnivelados. Ajuste o apoio dos braços."
        else:
            self._asymmetric_start = None

        return BiometricMetrics(
            timestamp=timestamp,
            ear_left=ear_left,
            ear_right=ear_right,
            ear_avg=ear_avg,
            mar=mar,
            neck_inclination_deg=neck_angle,
            shoulder_tilt_deg=shoulder_tilt,
            fatigue_status=fatigue_status,
            posture_status=posture_status,
            alert_level=alert_level,
            message=message,
        )
