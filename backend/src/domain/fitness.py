import math
from dataclasses import dataclass
from enum import Enum
from typing import Sequence, Optional, Tuple
from .models import Point2D


class ExerciseType(str, Enum):
    SQUAT = "SQUAT"
    PUSHUP = "PUSHUP"
    BICEP_CURL = "BICEP_CURL"


class RepState(str, Enum):
    UP = "UP"
    DOWN = "DOWN"
    TRANSITION = "TRANSITION"


@dataclass
class FitnessMetrics:
    exercise: ExerciseType
    reps_count: int
    joint_angle: float
    state: RepState
    form_quality: str
    target_angle: float
    rep_progress: float  # 0.0 to 1.0 (completion of current rep)
    feedback: str


def calculate_joint_angle(a: Point2D, b: Point2D, c: Point2D) -> float:
    """
    Calculates angle in degrees between three points where B is the joint vertex.
    Formula: arccos((BA . BC) / (|BA| * |BC|))
    Returns value in [0.0, 180.0].
    """
    ba_x = a.x - b.x
    ba_y = a.y - b.y
    bc_x = c.x - b.x
    bc_y = c.y - b.y

    dot_product = ba_x * bc_x + ba_y * bc_y
    mag_ba = math.hypot(ba_x, ba_y)
    mag_bc = math.hypot(bc_x, bc_y)

    if mag_ba <= 1e-6 or mag_bc <= 1e-6:
        return 180.0

    cosine = dot_product / (mag_ba * mag_bc)
    # Clamp cosine between -1.0 and 1.0 to guard against floating point inaccuracies
    cosine = max(-1.0, min(1.0, cosine))
    return float(math.degrees(math.acos(cosine)))


class ExerciseRepCounter:
    """
    State machine for counting repetitions and checking movement form with hysteresis.
    """

    # Exercise Angle Thresholds (up_angle, down_angle)
    THRESHOLDS = {
        ExerciseType.SQUAT: (160.0, 90.0),       # Knee angle: >160 standing, <90 deep squat
        ExerciseType.PUSHUP: (155.0, 85.0),      # Elbow angle: >155 plank, <85 chest to ground
        ExerciseType.BICEP_CURL: (155.0, 50.0),  # Elbow angle: >155 arm extended, <50 full curl
    }

    def __init__(self, exercise: ExerciseType = ExerciseType.SQUAT):
        self.exercise = exercise
        self.reps_count = 0
        self.state = RepState.UP
        self._down_reached = False
        self._rep_progress = 0.0

    def set_exercise(self, exercise: ExerciseType):
        self.exercise = exercise
        self.reps_count = 0
        self.state = RepState.UP
        self._down_reached = False

    def update(self, joint_angle: float) -> FitnessMetrics:
        up_threshold, down_threshold = self.THRESHOLDS[self.exercise]

        # Calculate progress between up and down threshold
        if up_threshold != down_threshold:
            progress = (up_threshold - joint_angle) / (up_threshold - down_threshold)
            self._rep_progress = max(0.0, min(1.0, progress))
        else:
            self._rep_progress = 0.0

        form_quality = "Excelente"
        feedback = "Mantenha o ritmo"

        # State transition logic
        if self.state == RepState.UP:
            if joint_angle <= down_threshold + 5.0:
                self.state = RepState.DOWN
                self._down_reached = True
                feedback = "Boa profundidade! Suba agora."
            elif joint_angle < up_threshold - 15.0:
                self.state = RepState.TRANSITION
                feedback = "Descendo... desça mais."
        elif self.state == RepState.TRANSITION:
            if joint_angle <= down_threshold:
                self.state = RepState.DOWN
                self._down_reached = True
                feedback = "Ponto ideal atingido! Suba."
            elif joint_angle >= up_threshold - 5.0:
                self.state = RepState.UP
                feedback = "Movimento incompleto."
                form_quality = "Parcial"
        elif self.state == RepState.DOWN:
            if joint_angle >= up_threshold - 10.0:
                if self._down_reached:
                    self.reps_count += 1
                    feedback = f"Repetição {self.reps_count} concluída!"
                self.state = RepState.UP
                self._down_reached = False

        return FitnessMetrics(
            exercise=self.exercise,
            reps_count=self.reps_count,
            joint_angle=round(joint_angle, 1),
            state=self.state,
            form_quality=form_quality,
            target_angle=down_threshold,
            rep_progress=round(self._rep_progress, 2),
            feedback=feedback,
        )
