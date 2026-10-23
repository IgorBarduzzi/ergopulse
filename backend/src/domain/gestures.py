from dataclasses import dataclass
from enum import Enum
from typing import Sequence, List
import math
from .models import Point2D


class HandGesture(str, Enum):
    OPEN_PALM = "OPEN_PALM"
    FIST = "FIST"
    PEACE = "PEACE"
    THUMBS_UP = "THUMBS_UP"
    THUMBS_DOWN = "THUMBS_DOWN"
    PINCH = "PINCH"
    POINTING = "POINTING"
    ROCK_ON = "ROCK_ON"
    UNKNOWN = "UNKNOWN"


@dataclass
class GestureMetrics:
    gesture: HandGesture
    fingers_up_count: int
    is_pinching: bool
    pinch_distance: float
    confidence: float
    message: str


def is_finger_extended(tip: Point2D, pip: Point2D, wrist: Point2D) -> bool:
    """
    Checks if a finger is extended by comparing distance to wrist.
    If tip is farther from wrist than pip is from wrist, the finger is extended.
    """
    return tip.distance_to(wrist) > pip.distance_to(wrist) * 1.15


def classify_hand_gesture(landmarks_2d: Sequence[Point2D]) -> GestureMetrics:
    """
    Classifies gesture from 21 MediaPipe hand landmarks.
    
    Landmark Indices:
    0: Wrist
    4: Thumb Tip, 2: Thumb MCP
    8: Index Tip, 6: Index PIP
    12: Middle Tip, 10: Middle PIP
    16: Ring Tip, 14: Ring PIP
    20: Pinky Tip, 18: Pinky PIP
    """
    if len(landmarks_2d) < 21:
        return GestureMetrics(
            gesture=HandGesture.UNKNOWN,
            fingers_up_count=0,
            is_pinching=False,
            pinch_distance=1.0,
            confidence=0.0,
            message="Mão não detectada",
        )

    wrist = landmarks_2d[0]
    thumb_tip = landmarks_2d[4]
    thumb_ip = landmarks_2d[3]
    index_tip = landmarks_2d[8]
    index_pip = landmarks_2d[6]
    middle_tip = landmarks_2d[12]
    middle_pip = landmarks_2d[10]
    ring_tip = landmarks_2d[16]
    ring_pip = landmarks_2d[14]
    pinky_tip = landmarks_2d[20]
    pinky_pip = landmarks_2d[18]

    # Check finger extensions
    index_up = is_finger_extended(index_tip, index_pip, wrist)
    middle_up = is_finger_extended(middle_tip, middle_pip, wrist)
    ring_up = is_finger_extended(ring_tip, ring_pip, wrist)
    pinky_up = is_finger_extended(pinky_tip, pinky_pip, wrist)
    # Thumb is extended when tip is farther from wrist than IP joint
    thumb_up = thumb_tip.distance_to(wrist) > thumb_ip.distance_to(wrist) * 1.18

    fingers = [thumb_up, index_up, middle_up, ring_up, pinky_up]
    fingers_count = sum(fingers)

    # Check pinch (distance between thumb tip and index tip)
    pinch_dist = thumb_tip.distance_to(index_tip)
    is_pinch = pinch_dist < 35.0 and fingers_count >= 1 and not (middle_up and ring_up and pinky_up)

    # Gesture determination
    gesture = HandGesture.UNKNOWN
    message = f"{fingers_count} dedos levantados"

    if fingers_count == 0:
        gesture = HandGesture.FIST
        message = "Gesto: Punho Fechado (Segurar)"
    elif is_pinch:
        gesture = HandGesture.PINCH
        message = "Gesto: Pinça / Clique Virtual"
    elif fingers_count == 5:
        gesture = HandGesture.OPEN_PALM
        message = "Gesto: Palma Aberta (Parar/Pausar)"
    elif index_up and middle_up and not ring_up and not pinky_up:
        gesture = HandGesture.PEACE
        message = "Gesto: Paz e Amor ✌️"
    elif index_up and not middle_up and not ring_up and not pinky_up:
        gesture = HandGesture.POINTING
        message = "Gesto: Apontando / Cursor"
    elif index_up and pinky_up and not middle_up and not ring_up:
        gesture = HandGesture.ROCK_ON
        message = "Gesto: Rock on 🤘"
    elif thumb_up and not index_up and not middle_up and not ring_up and not pinky_up:
        # Check if thumb points upward vs downward
        if thumb_tip.y < wrist.y:
            gesture = HandGesture.THUMBS_UP
            message = "Gesto: Positivo / Joinha 👍"
        else:
            gesture = HandGesture.THUMBS_DOWN
            message = "Gesto: Negativo 👎"

    return GestureMetrics(
        gesture=gesture,
        fingers_up_count=fingers_count,
        is_pinching=is_pinch,
        pinch_distance=round(pinch_dist, 2),
        confidence=0.92,
        message=message,
    )
