import pytest
from src.domain.models import Point2D
from src.domain.gestures import classify_hand_gesture, HandGesture


def build_hand_skeleton(fingers_up: list[bool]) -> list[Point2D]:
    """
    Synthesizes 21 landmarks based on which fingers are extended.
    fingers_up order: [thumb, index, middle, ring, pinky]
    """
    wrist = Point2D(100.0, 200.0)
    pts = [wrist]

    # Thumb: 1..4
    t_up = fingers_up[0]
    pts.append(Point2D(110.0, 180.0))  # 1
    pts.append(Point2D(120.0, 160.0))  # 2
    pts.append(Point2D(130.0, 150.0))  # 3 (IP)
    pts.append(Point2D(150.0, 120.0) if t_up else Point2D(115.0, 175.0))  # 4 (tip)

    # Fingers: index, middle, ring, pinky
    x_bases = [90.0, 100.0, 110.0, 120.0]
    for i, is_up in enumerate(fingers_up[1:]):
        x = x_bases[i]
        pts.append(Point2D(x, 150.0))  # mcp
        pts.append(Point2D(x, 130.0))  # pip
        pts.append(Point2D(x, 110.0))  # dip
        pts.append(Point2D(x, 70.0) if is_up else Point2D(x, 145.0))  # tip

    return pts


def test_classify_open_palm():
    lms = build_hand_skeleton([True, True, True, True, True])
    metrics = classify_hand_gesture(lms)
    assert metrics.gesture == HandGesture.OPEN_PALM
    assert metrics.fingers_up_count == 5


def test_classify_fist():
    lms = build_hand_skeleton([False, False, False, False, False])
    metrics = classify_hand_gesture(lms)
    assert metrics.gesture == HandGesture.FIST
    assert metrics.fingers_up_count == 0


def test_classify_peace_sign():
    # Only index and middle extended
    lms = build_hand_skeleton([False, True, True, False, False])
    metrics = classify_hand_gesture(lms)
    assert metrics.gesture == HandGesture.PEACE
    assert metrics.fingers_up_count == 2
