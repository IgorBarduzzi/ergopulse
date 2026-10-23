import time
from typing import Optional, Tuple, List, Dict, Any
import numpy as np
import cv2
import mediapipe as mp

from ..domain.models import Point2D, BiometricMetrics
from ..domain.metrics import (
    calculate_ear,
    calculate_mar,
    calculate_neck_inclination,
    calculate_shoulder_tilt,
)
from ..domain.fsm import BiometricStateMachine
from ..domain.fitness import (
    calculate_joint_angle,
    ExerciseRepCounter,
    ExerciseType,
    FitnessMetrics,
)
from ..domain.gestures import classify_hand_gesture, GestureMetrics, HandGesture
from ..domain.focus import (
    estimate_head_pose_angles,
    FocusStateMachine,
    FocusMetrics,
)
from ..domain.creative import (
    ThereminHand,
    ThereminMetrics,
    HoloWindowMetrics,
    AsciiMetrics,
    CanvasMetrics,
    SegmentationMetrics,
    AvatarMetrics,
)


class VisionEngine:
    """
    Motor central de processamento visual para extração de métricas faciais, posturais e gestuais.
    """

    # FaceMesh Indices
    LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
    RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
    MOUTH_INDICES = [61, 291, 81, 13, 178, 14]

    # Pose Indices
    NOSE_IDX = 0
    LEFT_EAR_IDX = 7
    RIGHT_EAR_IDX = 8
    LEFT_SHOULDER_IDX = 11
    RIGHT_SHOULDER_IDX = 12
    LEFT_ELBOW_IDX = 13
    RIGHT_ELBOW_IDX = 14
    LEFT_WRIST_IDX = 15
    RIGHT_WRIST_IDX = 16
    LEFT_HIP_IDX = 23
    RIGHT_HIP_IDX = 24
    LEFT_KNEE_IDX = 25
    RIGHT_KNEE_IDX = 26
    LEFT_ANKLE_IDX = 27
    RIGHT_ANKLE_IDX = 28

    def __init__(self):
        # Tools state
        self.active_tool: str = "ergonomics"
        self.fsm = BiometricStateMachine()
        self.rep_counter = ExerciseRepCounter(ExerciseType.SQUAT)
        self.focus_fsm = FocusStateMachine()

        # MediaPipe Solutions
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=0,  # Fastest for Edge CPU
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.5,
        )

        self.mp_draw = mp.solutions.drawing_utils

        # Selfie Segmentation for Virtual Studio / Bokeh
        self.mp_selfie = mp.solutions.selfie_segmentation
        self.selfie_segmentation = self.mp_selfie.SelfieSegmentation(model_selection=1)
        self.segmentation_mode = "bokeh_heavy"

    def set_tool(self, tool_name: str, sub_param: Optional[str] = None):
        """Swaps active tool and optional sub-parameter without re-initializing models."""
        valid_tools = [
            "ergonomics",
            "fitness",
            "gestures",
            "focus",
            "theremin",
            "holowindow",
            "ascii",
            "canvas",
            "segmentation",
            "avatar",
        ]
        if tool_name in valid_tools:
            self.active_tool = tool_name

        if tool_name == "fitness" and sub_param:
            try:
                ex = ExerciseType(sub_param.upper())
                self.rep_counter.set_exercise(ex)
            except ValueError:
                pass
        elif tool_name == "segmentation" and sub_param:
            self.segmentation_mode = sub_param.lower()

    def process_frame(
        self, frame_bgr: np.ndarray, timestamp: float, dt: float = 0.033
    ) -> Tuple[str, Any, np.ndarray]:
        """
        Executes the pipeline for the active tool.
        Returns (tool_id, metrics_object, annotated_frame).
        """
        h, w, _ = frame_bgr.shape
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        frame_rgb.flags.writeable = False

        annotated_frame = frame_bgr.copy()

        if self.active_tool == "ergonomics":
            return "ergonomics", self._process_ergonomics(frame_rgb, annotated_frame, timestamp, w, h), annotated_frame
        elif self.active_tool == "fitness":
            return "fitness", self._process_fitness(frame_rgb, annotated_frame, w, h), annotated_frame
        elif self.active_tool == "gestures":
            return "gestures", self._process_gestures(frame_rgb, annotated_frame, w, h), annotated_frame
        elif self.active_tool == "focus":
            return "focus", self._process_focus(frame_rgb, annotated_frame, timestamp, dt, w, h), annotated_frame
        elif self.active_tool == "theremin":
            return "theremin", self._process_theremin(frame_rgb, annotated_frame, w, h), annotated_frame
        elif self.active_tool == "holowindow":
            return "holowindow", self._process_holowindow(frame_rgb, annotated_frame, w, h), annotated_frame
        elif self.active_tool == "ascii":
            return "ascii", self._process_ascii(frame_bgr, annotated_frame), annotated_frame
        elif self.active_tool == "canvas":
            return "canvas", self._process_canvas(frame_rgb, annotated_frame, w, h), annotated_frame
        elif self.active_tool == "segmentation":
            metrics, out_frame = self._process_segmentation(frame_bgr, frame_rgb, w, h)
            return "segmentation", metrics, out_frame
        elif self.active_tool == "avatar":
            return "avatar", self._process_avatar(frame_rgb, annotated_frame, w, h), annotated_frame

        return "unknown", None, annotated_frame

    def _process_ergonomics(self, frame_rgb, annotated_frame, timestamp, w, h) -> Optional[BiometricMetrics]:
        face_res = self.face_mesh.process(frame_rgb)
        pose_res = self.pose.process(frame_rgb)

        if not face_res.multi_face_landmarks:
            return None

        lm = face_res.multi_face_landmarks[0].landmark
        def to_pt(idx: int) -> Point2D:
            return Point2D(x=lm[idx].x * w, y=lm[idx].y * h)

        left_eye = [to_pt(i) for i in self.LEFT_EYE_INDICES]
        right_eye = [to_pt(i) for i in self.RIGHT_EYE_INDICES]
        ear_left = calculate_ear(left_eye)
        ear_right = calculate_ear(right_eye)
        mouth_pts = [to_pt(i) for i in self.MOUTH_INDICES]
        mar = calculate_mar(mouth_pts)

        neck_angle, shoulder_tilt = 90.0, 0.0
        if pose_res.pose_landmarks:
            plm = pose_res.pose_landmarks.landmark
            l_ear = Point2D(plm[self.LEFT_EAR_IDX].x * w, plm[self.LEFT_EAR_IDX].y * h)
            r_ear = Point2D(plm[self.RIGHT_EAR_IDX].x * w, plm[self.RIGHT_EAR_IDX].y * h)
            l_sh = Point2D(plm[self.LEFT_SHOULDER_IDX].x * w, plm[self.LEFT_SHOULDER_IDX].y * h)
            r_sh = Point2D(plm[self.RIGHT_SHOULDER_IDX].x * w, plm[self.RIGHT_SHOULDER_IDX].y * h)

            mid_ear = Point2D((l_ear.x + r_ear.x) / 2.0, (l_ear.y + r_ear.y) / 2.0)
            mid_sh = Point2D((l_sh.x + r_sh.x) / 2.0, (l_sh.y + r_sh.y) / 2.0)
            neck_angle = calculate_neck_inclination(mid_ear, mid_sh)
            shoulder_tilt = calculate_shoulder_tilt(l_sh, r_sh)

            cv2.line(annotated_frame, (int(mid_ear.x), int(mid_ear.y)), (int(mid_sh.x), int(mid_sh.y)), (255, 200, 0), 2)
            cv2.line(annotated_frame, (int(l_sh.x), int(l_sh.y)), (int(r_sh.x), int(r_sh.y)), (0, 255, 128), 2)

        for pt in left_eye + right_eye:
            cv2.circle(annotated_frame, (int(pt.x), int(pt.y)), 2, (0, 255, 0), -1)

        return self.fsm.evaluate(timestamp, ear_left, ear_right, mar, neck_angle, shoulder_tilt)

    def _process_fitness(self, frame_rgb, annotated_frame, w, h) -> Optional[FitnessMetrics]:
        pose_res = self.pose.process(frame_rgb)
        if not pose_res.pose_landmarks:
            return None

        lm = pose_res.pose_landmarks.landmark
        def pt(idx: int) -> Point2D:
            return Point2D(x=lm[idx].x * w, y=lm[idx].y * h)

        joint_angle = 180.0
        pA, pB, pC = None, None, None

        if self.rep_counter.exercise == ExerciseType.SQUAT:
            pA = pt(self.LEFT_HIP_IDX)
            pB = pt(self.LEFT_KNEE_IDX)
            pC = pt(self.LEFT_ANKLE_IDX)
        elif self.rep_counter.exercise in (ExerciseType.PUSHUP, ExerciseType.BICEP_CURL):
            pA = pt(self.LEFT_SHOULDER_IDX)
            pB = pt(self.LEFT_ELBOW_IDX)
            pC = pt(self.LEFT_WRIST_IDX)

        if pA and pB and pC:
            joint_angle = calculate_joint_angle(pA, pB, pC)

            color = (0, 255, 128) if joint_angle <= self.rep_counter.THRESHOLDS[self.rep_counter.exercise][1] else (0, 200, 255)
            cv2.line(annotated_frame, (int(pA.x), int(pA.y)), (int(pB.x), int(pB.y)), color, 4)
            cv2.line(annotated_frame, (int(pB.x), int(pB.y)), (int(pC.x), int(pC.y)), color, 4)
            cv2.circle(annotated_frame, (int(pB.x), int(pB.y)), 8, (255, 255, 255), -1)
            cv2.circle(annotated_frame, (int(pB.x), int(pB.y)), 6, color, -1)

            cv2.putText(
                annotated_frame,
                f"{int(joint_angle)} deg",
                (int(pB.x) + 15, int(pB.y)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2,
            )

        return self.rep_counter.update(joint_angle)

    def _process_gestures(self, frame_rgb, annotated_frame, w, h) -> Optional[GestureMetrics]:
        hand_res = self.hands.process(frame_rgb)
        if not hand_res.multi_hand_landmarks:
            return None

        hlm = hand_res.multi_hand_landmarks[0]
        self.mp_draw.draw_landmarks(
            annotated_frame,
            hlm,
            self.mp_hands.HAND_CONNECTIONS,
            self.mp_draw.DrawingSpec(color=(0, 255, 200), thickness=2, circle_radius=3),
            self.mp_draw.DrawingSpec(color=(255, 100, 0), thickness=2),
        )

        pts_2d = [Point2D(x=p.x * w, y=p.y * h) for p in hlm.landmark]
        return classify_hand_gesture(pts_2d)

    def _process_focus(self, frame_rgb, annotated_frame, timestamp, dt, w, h) -> Optional[FocusMetrics]:
        face_res = self.face_mesh.process(frame_rgb)
        if not face_res.multi_face_landmarks:
            return None

        lm = face_res.multi_face_landmarks[0].landmark
        def pt(idx: int) -> Point2D:
            return Point2D(x=lm[idx].x * w, y=lm[idx].y * h)

        nose = pt(1)
        chin = pt(152)
        l_eye = pt(33)
        r_eye = pt(263)

        yaw, pitch = estimate_head_pose_angles(nose, chin, l_eye, r_eye)

        center_x, center_y = int((l_eye.x + r_eye.x) / 2), int((l_eye.y + r_eye.y) / 2)
        end_x = int(center_x + yaw * 3.0)
        end_y = int(center_y + pitch * 2.5)

        line_color = (0, 255, 128) if abs(yaw) <= 22 and pitch >= -18 else (0, 0, 255)
        cv2.arrowedLine(annotated_frame, (center_x, center_y), (end_x, end_y), line_color, 3, tipLength=0.3)
        cv2.circle(annotated_frame, (center_x, center_y), 5, (255, 255, 255), -1)

        return self.focus_fsm.update(timestamp, dt, yaw, pitch)

    def _process_theremin(self, frame_rgb, annotated_frame, w, h) -> Optional[ThereminMetrics]:
        hand_res = self.hands.process(frame_rgb)
        if not hand_res.multi_hand_landmarks:
            return ThereminMetrics(
                left_hand=None,
                right_hand=None,
                active_frequency_hz=440.0,
                filter_cutoff_hz=2000.0,
                is_playing=False,
                message="Posicione as mãos em frente à tela para tocar o sintetizador",
            )

        hands_list: List[ThereminHand] = []
        for idx, hlm in enumerate(hand_res.multi_hand_landmarks):
            pts = [Point2D(x=p.x * w, y=p.y * h) for p in hlm.landmark]
            wrist = pts[0]
            thumb_tip = pts[4]
            index_tip = pts[8]
            pinch_dist = thumb_tip.distance_to(index_tip)
            is_pinch = pinch_dist < 40.0

            palm_size = max(1.0, wrist.distance_to(pts[9]))

            index_up = (
                pts[8].distance_to(wrist) > pts[6].distance_to(wrist) * 1.12
                and pts[8].distance_to(wrist) > pts[5].distance_to(wrist) * 1.22
            )
            middle_up = (
                pts[12].distance_to(wrist) > pts[10].distance_to(wrist) * 1.12
                and pts[12].distance_to(wrist) > pts[9].distance_to(wrist) * 1.22
            )
            ring_up = (
                pts[16].distance_to(wrist) > pts[14].distance_to(wrist) * 1.12
                and pts[16].distance_to(wrist) > pts[13].distance_to(wrist) * 1.22
            )
            pinky_up = (
                pts[20].distance_to(wrist) > pts[18].distance_to(wrist) * 1.12
                and pts[20].distance_to(wrist) > pts[17].distance_to(wrist) * 1.22
            )
            thumb_up = (
                pts[4].distance_to(pts[17]) > pts[3].distance_to(pts[17]) * 1.07
                and pts[4].distance_to(pts[9]) > palm_size * 0.52
            )

            non_thumb_cnt = int(index_up) + int(middle_up) + int(ring_up) + int(pinky_up)
            fingers_cnt = non_thumb_cnt + int(thumb_up)

            # Classify Gesture Synth chord degree (1..7)
            if index_up and pinky_up and not middle_up and not ring_up:
                gesture_degree = 7 if thumb_up else 6
            elif thumb_up and pinky_up and not index_up and not middle_up and not ring_up:
                gesture_degree = 7
            elif non_thumb_cnt == 4:
                gesture_degree = 5 if thumb_up else 4
            elif non_thumb_cnt == 3:
                gesture_degree = 3
            elif non_thumb_cnt == 2:
                gesture_degree = 2
            elif non_thumb_cnt == 1:
                gesture_degree = 1
            else:
                gesture_degree = 0

            # Mirrored horizontal wrist-to-knuckle tilt (-1.0 left/Minor to +1.0 right/Major)
            wrist_tilt = max(-1.0, min(1.0, (wrist.x - pts[9].x) / palm_size))

            ratio = pinch_dist / palm_size
            pinch_amount = max(0.0, min(1.0, (0.80 - ratio) / (0.80 - 0.30)))

            raw_lms = [[round(p.x, 4), round(p.y, 4)] for p in hlm.landmark]
            palm_x = round(float(pts[9].x / w), 3)
            palm_y = round(float(pts[9].y / h), 3)

            hands_list.append(ThereminHand(
                label="Left" if (1.0 - palm_x) <= 0.58 else "Right",
                x=palm_x,
                y=palm_y,
                pinch=is_pinch or (pinch_amount > 0.45),
                pinch_dist=round(float(pinch_dist), 1),
                fingers_up=fingers_cnt,
                pinch_amount=round(float(pinch_amount), 3),
                landmarks=raw_lms,
                gesture_degree=gesture_degree,
                non_thumb_fingers=non_thumb_cnt,
                thumb_up=bool(thumb_up),
                wrist_tilt=round(float(wrist_tilt), 3),
            ))

        if len(hands_list) >= 2:
            # Sort by mirrored screen X (1.0 - h.x): leftmost on screen is Left Hand, rightmost is Right Hand
            sorted_hands = sorted(hands_list, key=lambda item: 1.0 - item.x)
            left_h = sorted_hands[0]
            left_h.label = "Left"
            right_h = sorted_hands[1]
            right_h.label = "Right"
        elif len(hands_list) == 1:
            only_h = hands_list[0]
            if (1.0 - only_h.x) <= 0.62:
                only_h.label = "Left"
                left_h = only_h
                right_h = None
            else:
                only_h.label = "Right"
                left_h = None
                right_h = only_h
        else:
            left_h = None
            right_h = None

        freq = 440.0
        if left_h:
            normalized_y = 1.0 - left_h.y
            freq = 130.0 + (normalized_y ** 1.5) * 750.0

        cutoff = 2000.0
        if right_h:
            normalized_ry = 1.0 - right_h.y
            cutoff = 200.0 + normalized_ry * 7000.0

        return ThereminMetrics(
            left_hand=left_h,
            right_hand=right_h,
            active_frequency_hz=round(freq, 1),
            filter_cutoff_hz=round(cutoff, 1),
            is_playing=len(hands_list) > 0,
            message=f"Frequência: {int(freq)} Hz • Cutoff: {int(cutoff)} Hz",
        )

    def _process_holowindow(self, frame_rgb, annotated_frame, w, h) -> Optional[HoloWindowMetrics]:
        face_res = self.face_mesh.process(frame_rgb)
        if not face_res.multi_face_landmarks:
            return HoloWindowMetrics(
                head_x=0.0, head_y=0.0, head_z=1.0, yaw=0.0, pitch=0.0, tracked=False,
                peek_revealed=False, head_distance_cm=60.0,
                message="Olhe para a tela para calibrar a Janela Holográfica"
            )

        lm = face_res.multi_face_landmarks[0].landmark
        def pt(idx: int) -> Point2D:
            return Point2D(x=lm[idx].x * w, y=lm[idx].y * h)

        nose = pt(1)
        chin = pt(152)
        l_eye = pt(33)
        r_eye = pt(263)

        norm_x = (nose.x - (w / 2.0)) / (w / 2.0)
        norm_y = (nose.y - (h / 2.0)) / (h / 2.0)
        eye_dist = l_eye.distance_to(r_eye)
        norm_z = eye_dist / 100.0

        yaw, pitch = estimate_head_pose_angles(nose, chin, l_eye, r_eye)

        # Peek is unlocked if user leans left or right enough to see behind the front pillar
        peek_revealed = abs(norm_x) > 0.18 or abs(yaw) > 14.0
        dist_cm = max(25.0, min(120.0, 60.0 / (norm_z if norm_z > 0.1 else 1.0)))

        # Holographic Target HUD for the PiP widget
        cv2.rectangle(annotated_frame, (int(w * 0.1), int(h * 0.1)), (int(w * 0.9), int(h * 0.9)), (255, 200, 0), 1)
        cv2.circle(annotated_frame, (int(nose.x), int(nose.y)), 6, (0, 255, 255), -1)
        cv2.line(annotated_frame, (int(w / 2), int(h / 2)), (int(nose.x), int(nose.y)), (0, 255, 255), 2)

        color = (0, 255, 128) if peek_revealed else (0, 180, 255)
        status_txt = "PEEK VISIBLE: CODE UNLOCKED" if peek_revealed else "CENTERED: PILLAR OCCLUDED"
        cv2.putText(annotated_frame, status_txt, (25, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)

        return HoloWindowMetrics(
            head_x=round(float(norm_x), 3),
            head_y=round(float(norm_y), 3),
            head_z=round(float(norm_z), 2),
            yaw=round(yaw, 1),
            pitch=round(pitch, 1),
            tracked=True,
            peek_revealed=bool(peek_revealed),
            head_distance_cm=round(float(dist_cm), 1),
            message=f"HoloTrack: X={norm_x:.2f} • Yaw={yaw:.1f}° • {'ESPIANDO ATRÁS' if peek_revealed else 'CENTRALIZADO'}",
        )

    def _process_canvas(self, frame_rgb, annotated_frame, w, h) -> CanvasMetrics:
        hand_res = self.hands.process(frame_rgb)
        if not hand_res.multi_hand_landmarks:
            return CanvasMetrics(
                index_x=0.5, index_y=0.5, is_drawing=False, brush_size=12.0,
                hand_detected=False, clear_gesture=False,
                message="Aponte o dedo indicador para pintar no ar"
            )

        hlm = hand_res.multi_hand_landmarks[0]
        pts = [Point2D(x=p.x * w, y=p.y * h) for p in hlm.landmark]
        wrist = pts[0]
        thumb_tip = pts[4]
        index_tip = pts[8]
        pinch_dist = thumb_tip.distance_to(index_tip)
        palm_size = wrist.distance_to(pts[9])

        # Pinch detection for drawing stroke
        is_pinch = pinch_dist < 45.0

        # Check fingers extension
        index_up = pts[8].distance_to(wrist) > pts[6].distance_to(wrist) * 1.15
        middle_up = pts[12].distance_to(wrist) > pts[10].distance_to(wrist) * 1.15
        ring_up = pts[16].distance_to(wrist) > pts[14].distance_to(wrist) * 1.15
        pinky_up = pts[20].distance_to(wrist) > pts[18].distance_to(wrist) * 1.15
        thumb_up = thumb_tip.distance_to(wrist) > pts[3].distance_to(wrist) * 1.15

        all_extended = sum([thumb_up, index_up, middle_up, ring_up, pinky_up]) >= 5
        is_drawing = is_pinch or (index_up and not ring_up and not pinky_up)

        # Dynamic brush size based on proximity or pinch distance
        brush_size = max(4.0, min(36.0, (pinch_dist / (palm_size or 100)) * 26.0))

        # Laser ring visual on index tip
        laser_color = (0, 255, 255) if is_drawing else (255, 100, 200)
        cv2.circle(annotated_frame, (int(index_tip.x), int(index_tip.y)), int(brush_size / 2) + 6, laser_color, 2)
        cv2.circle(annotated_frame, (int(index_tip.x), int(index_tip.y)), 4, (255, 255, 255), -1)

        self.mp_draw.draw_landmarks(
            annotated_frame,
            hlm,
            self.mp_hands.HAND_CONNECTIONS,
            self.mp_draw.DrawingSpec(color=(0, 255, 200), thickness=1, circle_radius=2),
            self.mp_draw.DrawingSpec(color=(255, 100, 0), thickness=1),
        )

        return CanvasMetrics(
            index_x=round(float(index_tip.x / w), 3),
            index_y=round(float(index_tip.y / h), 3),
            is_drawing=bool(is_drawing),
            brush_size=round(float(brush_size), 1),
            hand_detected=True,
            clear_gesture=bool(all_extended),
            message="Pintando com Laser Neon" if is_drawing else "Mova o indicador para mirar (pinça para pintar)",
        )

    def _process_segmentation(self, frame_bgr, frame_rgb, w, h):
        seg_res = self.selfie_segmentation.process(frame_rgb)
        mask = seg_res.segmentation_mask  # Float 0.0 to 1.0
        condition = mask > 0.45

        coverage_pct = round(float(np.mean(condition)) * 100.0, 1)
        mode = getattr(self, "segmentation_mode", "bokeh_heavy")

        condition_3d = np.repeat(condition[:, :, np.newaxis], 3, axis=2)

        if mode == "bokeh_light":
            blurred = cv2.GaussianBlur(frame_bgr, (27, 27), 0)
            output = np.where(condition_3d, frame_bgr, blurred)
        elif mode == "bokeh_heavy":
            blurred = cv2.GaussianBlur(frame_bgr, (65, 65), 0)
            output = np.where(condition_3d, frame_bgr, blurred)
        elif mode == "greenscreen":
            green_bg = np.zeros_like(frame_bgr)
            green_bg[:] = (0, 255, 0)
            output = np.where(condition_3d, frame_bgr, green_bg)
        elif mode == "cyberpunk":
            gradient = np.zeros_like(frame_bgr)
            for y in range(h):
                factor = y / max(h, 1)
                gradient[y, :] = (int(80 * factor), int(20 * (1 - factor)), int(180 * (1 - factor) + 40))
            for x in range(0, w, 40):
                cv2.line(gradient, (x, 0), (x, h), (140, 40, 120), 1)
            for y in range(0, h, 40):
                cv2.line(gradient, (0, y), (w, y), (140, 40, 120), 1)
            output = np.where(condition_3d, frame_bgr, gradient)
        elif mode == "matrix":
            matrix_bg = np.zeros_like(frame_bgr)
            matrix_bg[:, :, 1] = 60
            for y in range(0, h, 6):
                matrix_bg[y, :, 1] = 130
            output = np.where(condition_3d, frame_bgr, matrix_bg)
        else: # office or default
            blurred = cv2.GaussianBlur(frame_bgr, (45, 45), 0)
            output = np.where(condition_3d, frame_bgr, blurred)

        metrics = SegmentationMetrics(
            mode=mode,
            person_coverage_pct=coverage_pct,
            message=f"Fundo: {mode.upper()} • Segmentação {coverage_pct}%",
        )
        return metrics, output

    def _process_avatar(self, frame_rgb, annotated_frame, w, h) -> AvatarMetrics:
        face_res = self.face_mesh.process(frame_rgb)
        if not face_res.multi_face_landmarks:
            return AvatarMetrics(
                left_eye_open=1.0, right_eye_open=1.0, mouth_open=0.0, smile=0.0,
                eyebrow_raise=0.0, head_yaw=0.0, head_pitch=0.0, head_roll=0.0,
                face_detected=False, message="Olhe para a câmera para conectar o Avatar 3D"
            )

        lm = face_res.multi_face_landmarks[0].landmark
        def pt(idx: int) -> Point2D:
            return Point2D(x=lm[idx].x * w, y=lm[idx].y * h)

        # Eye Aspect Ratios
        l_eye = [pt(i) for i in self.LEFT_EYE_INDICES]
        r_eye = [pt(i) for i in self.RIGHT_EYE_INDICES]
        l_ear = calculate_ear(l_eye)
        r_ear = calculate_ear(r_eye)

        l_open = max(0.0, min(1.0, (l_ear - 0.16) / (0.30 - 0.16)))
        r_open = max(0.0, min(1.0, (r_ear - 0.16) / (0.30 - 0.16)))

        mouth_pts = [pt(i) for i in self.MOUTH_INDICES]
        mar = calculate_mar(mouth_pts)
        mouth_open = max(0.0, min(1.0, (mar - 0.12) / (0.75 - 0.12)))

        l_corner = pt(61)
        r_corner = pt(291)
        lip_width = l_corner.distance_to(r_corner)
        inter_eye = pt(33).distance_to(pt(263))
        smile_ratio = max(0.0, min(1.0, ((lip_width / (inter_eye or 1.0)) - 0.85) / 0.45))

        l_brow = pt(70)
        l_eye_top = pt(159)
        brow_dist = l_brow.distance_to(l_eye_top)
        brow_raise = max(0.0, min(1.0, ((brow_dist / (inter_eye or 1.0)) - 0.35) / 0.25))

        nose = pt(1)
        chin = pt(152)
        yaw, pitch = estimate_head_pose_angles(nose, chin, pt(33), pt(263))
        roll = np.degrees(np.arctan2(pt(263).y - pt(33).y, pt(263).x - pt(33).x))

        # Wireframe avatar preview on camera
        cv2.circle(annotated_frame, (int(nose.x), int(nose.y)), 4, (0, 255, 255), -1)
        cv2.line(annotated_frame, (int(l_corner.x), int(l_corner.y)), (int(r_corner.x), int(r_corner.y)), (255, 100, 255), 2)

        return AvatarMetrics(
            left_eye_open=round(float(l_open), 2),
            right_eye_open=round(float(r_open), 2),
            mouth_open=round(float(mouth_open), 2),
            smile=round(float(smile_ratio), 2),
            eyebrow_raise=round(float(brow_raise), 2),
            head_yaw=round(float(yaw), 1),
            head_pitch=round(float(pitch), 1),
            head_roll=round(float(roll), 1),
            face_detected=True,
            message=f"Avatar Sync • Olhos: {int((l_open+r_open)*50)}% • Boca: {int(mouth_open*100)}% • Sorriso: {int(smile_ratio*100)}%",
        )

    def _process_ascii(self, frame_bgr, annotated_frame) -> AsciiMetrics:
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))
        contrast = float(np.std(gray))
        return AsciiMetrics(
            brightness=round(brightness, 1),
            contrast=round(contrast, 1),
            message=f"Luminância média: {brightness:.1f} • Matriz Ativa",
        )

    def close(self):
        self.face_mesh.close()
        self.pose.close()
        self.hands.close()
        self.selfie_segmentation.close()
