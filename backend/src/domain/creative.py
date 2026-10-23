from dataclasses import dataclass
from typing import Optional, List


@dataclass
class ThereminHand:
    label: str  # "Left" or "Right"
    x: float    # 0.0 to 1.0 (horizontal position)
    y: float    # 0.0 to 1.0 (vertical position)
    pinch: bool
    pinch_dist: float
    fingers_up: int
    pinch_amount: float = 0.0
    landmarks: Optional[List[List[float]]] = None
    gesture_degree: int = 0       # 0=none, 1..5=fingers 1..5, 6=rock(A), 7=ily(B)
    non_thumb_fingers: int = 0    # 0..4 count of index/middle/ring/pinky
    thumb_up: bool = False
    wrist_tilt: float = 0.0       # Mirrored horizontal tilt (-1.0 left/minor to +1.0 right/major)


@dataclass
class ThereminMetrics:
    left_hand: Optional[ThereminHand]
    right_hand: Optional[ThereminHand]
    active_frequency_hz: float
    filter_cutoff_hz: float
    is_playing: bool
    message: str


@dataclass
class HoloWindowMetrics:
    head_x: float  # Normalized -1.0 (left) to 1.0 (right)
    head_y: float  # Normalized -1.0 (up) to 1.0 (down)
    head_z: float  # Normalized distance 0.5 (far) to 2.0 (close)
    yaw: float     # Head rotation angle
    pitch: float   # Head tilt angle
    tracked: bool
    peek_revealed: bool = False
    head_distance_cm: float = 60.0
    message: str = ""


@dataclass
class AsciiMetrics:
    brightness: float
    contrast: float
    message: str


@dataclass
class CanvasMetrics:
    index_x: float
    index_y: float
    is_drawing: bool
    brush_size: float
    hand_detected: bool
    clear_gesture: bool
    message: str


@dataclass
class SegmentationMetrics:
    mode: str
    person_coverage_pct: float
    message: str


@dataclass
class AvatarMetrics:
    left_eye_open: float      # 0.0 (closed) to 1.0 (wide)
    right_eye_open: float     # 0.0 (closed) to 1.0 (wide)
    mouth_open: float         # 0.0 (closed) to 1.0 (open)
    smile: float              # 0.0 to 1.0
    eyebrow_raise: float      # 0.0 to 1.0
    head_yaw: float           # -45 to +45
    head_pitch: float         # -30 to +30
    head_roll: float          # -30 to +30
    face_detected: bool
    message: str
