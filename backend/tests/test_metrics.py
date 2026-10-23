import pytest
from src.domain.models import Point2D
from src.domain.metrics import (
    calculate_ear,
    calculate_mar,
    calculate_neck_inclination,
    calculate_shoulder_tilt,
)


def test_calculate_ear_open_eye():
    """
    Test EAR on simulated coordinates representing an open eye.
    Width = 10 units, Heights = 3 units each.
    EAR = (3 + 3) / (2 * 10) = 6 / 20 = 0.30
    """
    p1 = Point2D(0.0, 5.0)   # outer corner
    p2 = Point2D(3.0, 2.0)   # upper eyelid outer
    p3 = Point2D(7.0, 2.0)   # upper eyelid inner
    p4 = Point2D(10.0, 5.0)  # inner corner
    p5 = Point2D(7.0, 5.0)   # lower eyelid inner
    p6 = Point2D(3.0, 5.0)   # lower eyelid outer

    ear = calculate_ear([p1, p2, p3, p4, p5, p6])
    assert pytest.approx(ear, rel=1e-2) == 0.30


def test_calculate_ear_closed_eye():
    """
    Test EAR on simulated coordinates representing a closed eye.
    Vertical eyelid distance approaches zero.
    """
    p1 = Point2D(0.0, 5.0)
    p2 = Point2D(3.0, 5.1)
    p3 = Point2D(7.0, 5.1)
    p4 = Point2D(10.0, 5.0)
    p5 = Point2D(7.0, 5.0)
    p6 = Point2D(3.0, 5.0)

    ear = calculate_ear([p1, p2, p3, p4, p5, p6])
    assert ear < 0.05


def test_calculate_ear_invalid_length():
    with pytest.raises(ValueError, match="expects 6 points"):
        calculate_ear([Point2D(0, 0), Point2D(1, 1)])


def test_calculate_ear_zero_division_guard():
    # Coincident corner points
    points = [Point2D(0.0, 0.0)] * 6
    ear = calculate_ear(points)
    assert ear == 0.0


def test_calculate_mar_closed_vs_open():
    # Closed mouth: vertical distance is 1 unit at x=3 and x=7
    mouth_closed = [
        Point2D(0.0, 5.0),   # left
        Point2D(10.0, 5.0),  # right
        Point2D(3.0, 4.5),   # top1
        Point2D(7.0, 4.5),   # top2
        Point2D(3.0, 5.5),   # bot1 (aligned with top1)
        Point2D(7.0, 5.5),   # bot2 (aligned with top2)
    ]
    mar_closed = calculate_mar(mouth_closed)
    assert mar_closed < 0.15

    # Yawning mouth: large vertical opening (8 units)
    mouth_yawn = [
        Point2D(0.0, 5.0),
        Point2D(10.0, 5.0),
        Point2D(3.0, 1.0),
        Point2D(7.0, 1.0),
        Point2D(3.0, 9.0),
        Point2D(7.0, 9.0),
    ]
    mar_yawn = calculate_mar(mouth_yawn)
    assert mar_yawn > 0.65


def test_calculate_neck_inclination():
    # Perfectly aligned: ear directly above shoulder (dx=0, dy>0 in image coords)
    shoulder = Point2D(100.0, 200.0)
    ear_upright = Point2D(100.0, 100.0)
    angle_upright = calculate_neck_inclination(ear_upright, shoulder)
    assert pytest.approx(angle_upright, rel=1e-2) == 90.0

    # Forward head: ear positioned forward (dx=60, dy=100)
    ear_forward = Point2D(160.0, 100.0)
    angle_forward = calculate_neck_inclination(ear_forward, shoulder)
    assert angle_forward < 65.0


def test_calculate_shoulder_tilt():
    # Perfectly level shoulders
    s_left = Point2D(50.0, 200.0)
    s_right = Point2D(150.0, 200.0)
    tilt_level = calculate_shoulder_tilt(s_left, s_right)
    assert pytest.approx(tilt_level, abs=1e-3) == 0.0

    # Tilted shoulder (e.g. 10 pixels drop over 100 pixels width)
    s_right_tilted = Point2D(150.0, 215.0)
    tilt_tilted = calculate_shoulder_tilt(s_left, s_right_tilted)
    assert tilt_tilted > 8.0
