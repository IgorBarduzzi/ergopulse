from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import math


class AlertLevel(str, Enum):
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class FatigueStatus(str, Enum):
    ALERT = "ALERT"
    DROWSY_SUSPECT = "DROWSY_SUSPECT"
    MICROSLEEP = "MICROSLEEP"
    YAWNING = "YAWNING"


class PostureStatus(str, Enum):
    GOOD = "GOOD"
    FORWARD_HEAD = "FORWARD_HEAD"
    SLOUCHED = "SLOUCHED"
    ASYMMETRIC = "ASYMMETRIC"


@dataclass(frozen=True)
class Point2D:
    x: float
    y: float

    def distance_to(self, other: "Point2D") -> float:
        """Euclidean distance between two 2D points."""
        return math.hypot(self.x - other.x, self.y - other.y)


@dataclass(frozen=True)
class Point3D:
    x: float
    y: float
    z: float

    def distance_to(self, other: "Point3D") -> float:
        """Euclidean distance between two 3D points."""
        return math.sqrt(
            (self.x - other.x) ** 2 + (self.y - other.y) ** 2 + (self.z - other.z) ** 2
        )


@dataclass
class BiometricMetrics:
    timestamp: float
    ear_left: float
    ear_right: float
    ear_avg: float
    mar: float
    neck_inclination_deg: float
    shoulder_tilt_deg: float
    fatigue_status: FatigueStatus = FatigueStatus.ALERT
    posture_status: PostureStatus = PostureStatus.GOOD
    alert_level: AlertLevel = AlertLevel.NORMAL
    message: str = "Status normal"


@dataclass
class UserCalibration:
    baseline_ear: float = 0.28
    baseline_neck_angle: float = 85.0
    baseline_shoulder_y: float = 0.50
    ear_threshold_ratio: float = 0.75  # Alert when EAR drops below 75% of baseline
    is_calibrated: bool = False
