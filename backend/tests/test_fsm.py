import pytest
from src.domain.models import FatigueStatus, PostureStatus, AlertLevel
from src.domain.fsm import BiometricStateMachine


def test_fsm_natural_blink_does_not_alert():
    """
    Simulates a natural human blink (approx 200ms).
    Ensures state machine DOES NOT trigger warning or microsleep.
    """
    fsm = BiometricStateMachine(drowsy_time_sec=1.0, microsleep_time_sec=2.0)

    # Frame 0: Eyes open at t=0.0s
    res0 = fsm.evaluate(0.0, 0.30, 0.30, 0.1, 85.0, 1.0)
    assert res0.fatigue_status == FatigueStatus.ALERT

    # Frame 1: Eyes close during blink at t=0.1s
    res1 = fsm.evaluate(0.1, 0.12, 0.12, 0.1, 85.0, 1.0)
    assert res1.fatigue_status == FatigueStatus.ALERT
    assert res1.alert_level == AlertLevel.NORMAL

    # Frame 2: Eyes still closed at t=0.25s
    res2 = fsm.evaluate(0.25, 0.12, 0.12, 0.1, 85.0, 1.0)
    assert res2.fatigue_status == FatigueStatus.ALERT

    # Frame 3: Eyes open back at t=0.35s
    res3 = fsm.evaluate(0.35, 0.30, 0.30, 0.1, 85.0, 1.0)
    assert res3.fatigue_status == FatigueStatus.ALERT
    assert res3.alert_level == AlertLevel.NORMAL


def test_fsm_prolonged_closure_triggers_microsleep():
    """
    Simulates prolonged eyes closure resulting in Warning then Critical Micro-sleep.
    """
    fsm = BiometricStateMachine(drowsy_time_sec=1.0, microsleep_time_sec=2.0)

    # t=0.0s: Closure starts
    fsm.evaluate(0.0, 0.10, 0.10, 0.1, 85.0, 1.0)

    # t=1.2s: Drowsy suspect threshold exceeded
    res_drowsy = fsm.evaluate(1.2, 0.10, 0.10, 0.1, 85.0, 1.0)
    assert res_drowsy.fatigue_status == FatigueStatus.DROWSY_SUSPECT
    assert res_drowsy.alert_level == AlertLevel.WARNING

    # t=2.1s: Microsleep threshold exceeded
    res_micro = fsm.evaluate(2.1, 0.10, 0.10, 0.1, 85.0, 1.0)
    assert res_micro.fatigue_status == FatigueStatus.MICROSLEEP
    assert res_micro.alert_level == AlertLevel.CRITICAL


def test_fsm_posture_hysteresis():
    """
    Simulates temporary head tilt vs sustained forward head posture.
    """
    fsm = BiometricStateMachine(posture_grace_time_sec=3.0, neck_angle_min=75.0)

    # t=0.0s: User slouches
    res0 = fsm.evaluate(0.0, 0.30, 0.30, 0.1, 65.0, 1.0)
    assert res0.posture_status == PostureStatus.GOOD  # Within grace period

    # t=2.0s: Still slouching, but under 3s
    res1 = fsm.evaluate(2.0, 0.30, 0.30, 0.1, 65.0, 1.0)
    assert res1.posture_status == PostureStatus.GOOD

    # t=3.5s: Exceeded grace period -> trigger warning
    res2 = fsm.evaluate(3.5, 0.30, 0.30, 0.1, 65.0, 1.0)
    assert res2.posture_status == PostureStatus.FORWARD_HEAD
    assert res2.alert_level == AlertLevel.WARNING


def test_fsm_calibration_adaptation():
    """
    Tests adaptive threshold calculation based on user resting calibration.
    """
    fsm = BiometricStateMachine()
    # User with naturally smaller eyes (baseline 0.22) and neck angle 80
    fsm.update_calibration(baseline_ear=0.22, baseline_neck_angle=80.0)

    assert fsm.calibration.is_calibrated is True
    # 75% of 0.22 = 0.165
    assert pytest.approx(fsm.ear_threshold, rel=1e-2) == 0.165
    # 80 - 12 = 68.0
    assert pytest.approx(fsm.neck_angle_min, rel=1e-2) == 68.0
