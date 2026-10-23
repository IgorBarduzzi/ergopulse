import pytest
from src.domain.models import Point2D
from src.domain.focus import (
    estimate_head_pose_angles,
    FocusStateMachine,
    FocusStatus,
)


def test_estimate_head_pose_center():
    nose = Point2D(100.0, 100.0)
    chin = Point2D(100.0, 150.0)
    left_eye = Point2D(80.0, 80.0)
    right_eye = Point2D(120.0, 80.0)

    yaw, pitch = estimate_head_pose_angles(nose, chin, left_eye, right_eye)
    assert pytest.approx(yaw, abs=1e-2) == 0.0


def test_estimate_head_pose_turned_right():
    # Nose shifted towards right eye
    nose = Point2D(115.0, 100.0)
    chin = Point2D(115.0, 150.0)
    left_eye = Point2D(80.0, 80.0)
    right_eye = Point2D(120.0, 80.0)

    yaw, _ = estimate_head_pose_angles(nose, chin, left_eye, right_eye)
    assert yaw > 25.0


def test_focus_state_machine_hysteresis():
    fsm = FocusStateMachine(yaw_threshold=20.0, distraction_grace_sec=2.0)

    # t=0.0s, focused
    m1 = fsm.update(timestamp=0.0, dt=0.5, yaw=0.0, pitch=0.0)
    assert m1.status == FocusStatus.FOCUSED
    assert m1.distraction_count == 0

    # t=1.0s, looks away (within grace period)
    m2 = fsm.update(timestamp=1.0, dt=1.0, yaw=30.0, pitch=0.0)
    assert m2.status == FocusStatus.LOOKING_AWAY
    assert m2.distraction_count == 0

    # t=3.0s, looks away sustained (> 2.0s grace period)
    m3 = fsm.update(timestamp=3.0, dt=2.0, yaw=30.0, pitch=0.0)
    assert m3.status == FocusStatus.DISTRACTED
    assert m3.distraction_count == 1
