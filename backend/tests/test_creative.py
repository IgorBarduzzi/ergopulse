from src.domain.creative import (
    ThereminHand,
    ThereminMetrics,
    HoloWindowMetrics,
    AsciiMetrics,
    CanvasMetrics,
    SegmentationMetrics,
    AvatarMetrics,
)


def test_theremin_metrics_structure():
    left = ThereminHand(label="Left", x=0.2, y=0.5, pinch=True, pinch_dist=0.03, fingers_up=1)
    right = ThereminHand(label="Right", x=0.8, y=0.4, pinch=False, pinch_dist=0.15, fingers_up=4)
    
    metrics = ThereminMetrics(
        left_hand=left,
        right_hand=right,
        active_frequency_hz=440.0,
        filter_cutoff_hz=1200.0,
        is_playing=True,
        message="Dual hands active",
    )

    assert metrics.is_playing is True
    assert metrics.active_frequency_hz == 440.0
    assert metrics.left_hand.pinch is True
    assert metrics.right_hand.fingers_up == 4


def test_holowindow_metrics_bounds():
    holo = HoloWindowMetrics(
        head_x=-0.45,
        head_y=0.12,
        head_z=1.1,
        yaw=-15.4,
        pitch=4.2,
        tracked=True,
        peek_revealed=True,
        head_distance_cm=55.0,
        message="User in holographic sweet spot",
    )
    
    assert holo.tracked is True
    assert -1.0 <= holo.head_x <= 1.0
    assert -1.0 <= holo.head_y <= 1.0
    assert holo.peek_revealed is True
    assert holo.head_distance_cm == 55.0


def test_ascii_metrics_luminance():
    ascii_data = AsciiMetrics(
        brightness=128.5,
        contrast=45.2,
        message="Luminance high",
    )
    
    assert ascii_data.brightness == 128.5
    assert ascii_data.contrast == 45.2


def test_canvas_metrics():
    canvas = CanvasMetrics(
        index_x=0.45,
        index_y=0.32,
        is_drawing=True,
        brush_size=16.0,
        hand_detected=True,
        clear_gesture=False,
        message="Painting",
    )
    assert canvas.is_drawing is True
    assert canvas.hand_detected is True
    assert canvas.brush_size == 16.0


def test_segmentation_metrics():
    seg = SegmentationMetrics(
        mode="bokeh_heavy",
        person_coverage_pct=34.5,
        message="Bokeh active",
    )
    assert seg.mode == "bokeh_heavy"
    assert seg.person_coverage_pct == 34.5


def test_avatar_metrics():
    avatar = AvatarMetrics(
        left_eye_open=0.85,
        right_eye_open=0.90,
        mouth_open=0.45,
        smile=0.72,
        eyebrow_raise=0.30,
        head_yaw=12.5,
        head_pitch=-5.2,
        head_roll=2.1,
        face_detected=True,
        message="Synced",
    )
    assert avatar.face_detected is True
    assert avatar.smile == 0.72
    assert avatar.mouth_open == 0.45
