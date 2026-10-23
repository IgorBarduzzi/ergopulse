import pytest
from src.domain.models import Point2D
from src.domain.fitness import (
    calculate_joint_angle,
    ExerciseRepCounter,
    ExerciseType,
    RepState,
)


def test_calculate_joint_angle_right_angle():
    a = Point2D(0.0, 10.0)
    b = Point2D(0.0, 0.0)  # vertex
    c = Point2D(10.0, 0.0)
    angle = calculate_joint_angle(a, b, c)
    assert pytest.approx(angle, rel=1e-2) == 90.0


def test_calculate_joint_angle_straight_line():
    a = Point2D(0.0, 10.0)
    b = Point2D(0.0, 0.0)
    c = Point2D(0.0, -10.0)
    angle = calculate_joint_angle(a, b, c)
    assert pytest.approx(angle, rel=1e-2) == 180.0


def test_rep_counter_full_squat():
    counter = ExerciseRepCounter(exercise=ExerciseType.SQUAT)
    assert counter.reps_count == 0
    assert counter.state == RepState.UP

    # 1. Standing upright (170 degrees)
    m1 = counter.update(170.0)
    assert m1.reps_count == 0
    assert m1.state == RepState.UP

    # 2. Descending into deep squat (80 degrees, below 90 threshold)
    m2 = counter.update(80.0)
    assert m2.reps_count == 0
    assert m2.state == RepState.DOWN

    # 3. Rising back to standing upright (165 degrees)
    m3 = counter.update(165.0)
    assert m3.reps_count == 1
    assert m3.state == RepState.UP


def test_rep_counter_partial_squat_does_not_count():
    counter = ExerciseRepCounter(exercise=ExerciseType.SQUAT)

    # Descends only to 125 degrees (threshold is 90)
    counter.update(125.0)
    # Returns upright
    m = counter.update(165.0)
    assert m.reps_count == 0
