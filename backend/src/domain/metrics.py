import math
from typing import Sequence
from .models import Point2D


def calculate_ear(eye_points: Sequence[Point2D]) -> float:
    """
    Calculates Eye Aspect Ratio (EAR) based on Soukupova & Cech (2016).
    
    Formula:
        EAR = (||p2 - p6|| + ||p3 - p5||) / (2.0 * ||p1 - p4||)
    
    Args:
        eye_points: Sequence of exactly 6 2D points ordered:
            p1: lateral corner (outer)
            p2: upper eyelid (outer-mid)
            p3: upper eyelid (inner-mid)
            p4: medial corner (inner)
            p5: lower eyelid (inner-mid)
            p6: lower eyelid (outer-mid)

    Returns:
        float: EAR value (typically 0.25 - 0.35 when open, < 0.20 when closed).
    """
    if len(eye_points) != 6:
        raise ValueError(f"calculate_ear expects 6 points, received {len(eye_points)}")

    p1, p2, p3, p4, p5, p6 = eye_points

    # Vertical eyelid distances
    v1 = p2.distance_to(p6)
    v2 = p3.distance_to(p5)

    # Horizontal eye width
    h = p1.distance_to(p4)

    if h <= 1e-6:
        return 0.0

    return (v1 + v2) / (2.0 * h)


def calculate_mar(mouth_points: Sequence[Point2D]) -> float:
    """
    Calculates Mouth Aspect Ratio (MAR) to detect yawning.
    
    Formula:
        MAR = (||p_top1 - p_bot1|| + ||p_top2 - p_bot2||) / (2.0 * ||p_left - p_right||)
        
    Args:
        mouth_points: Sequence of 6 or 8 mouth landmark points:
            [left_corner, right_corner, top_mid1, top_mid2, bot_mid1, bot_mid2]
    """
    if len(mouth_points) < 6:
        raise ValueError("calculate_mar expects at least 6 points")

    p_left = mouth_points[0]
    p_right = mouth_points[1]
    p_top1 = mouth_points[2]
    p_top2 = mouth_points[3]
    p_bot1 = mouth_points[4]
    p_bot2 = mouth_points[5]

    v1 = p_top1.distance_to(p_bot1)
    v2 = p_top2.distance_to(p_bot2)
    h = p_left.distance_to(p_right)

    if h <= 1e-6:
        return 0.0

    return (v1 + v2) / (2.0 * h)


def calculate_neck_inclination(ear: Point2D, shoulder: Point2D) -> float:
    """
    Calculates the Craniovertebral Angle (CVA) / Neck inclination in degrees.
    Measures head forward projection relative to vertical.
    
    Args:
        ear: 2D coordinates of the ear tragus.
        shoulder: 2D coordinates of the acromion / shoulder joint.
        
    Returns:
        float: Angle in degrees relative to vertical (90 deg = perfectly upright).
               Angles lower than ~75 deg often indicate forward head posture.
    """
    dx = ear.x - shoulder.x
    dy = shoulder.y - ear.y  # In image coordinates, y increases downward

    if math.isclose(dx, 0.0, abs_tol=1e-6) and math.isclose(dy, 0.0, abs_tol=1e-6):
        return 90.0

    angle_rad = math.atan2(dy, abs(dx))
    angle_deg = math.degrees(angle_rad)
    return float(angle_deg)


def calculate_shoulder_tilt(left_shoulder: Point2D, right_shoulder: Point2D) -> float:
    """
    Calculates the lateral tilt angle of the shoulders in degrees.
    
    Returns:
        float: Tilt angle in degrees relative to horizontal (0 deg = balanced).
               Values > 5-7 deg indicate asymmetric lateral spine load.
    """
    dx = abs(right_shoulder.x - left_shoulder.x)
    dy = abs(right_shoulder.y - left_shoulder.y)

    if dx <= 1e-6:
        return 90.0

    tilt_rad = math.atan2(dy, dx)
    return float(math.degrees(tilt_rad))
