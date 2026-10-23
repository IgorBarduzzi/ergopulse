import threading
import time
from typing import Optional, Tuple
import cv2
import numpy as np


class ThreadedCamera:
    """
    High-performance threaded camera stream.
    Decouples frame acquisition from inference to prevent frame buffer lag
    and ensure deterministic low latency.
    """

    def __init__(self, src: int = 0, width: int = 640, height: int = 480):
        self.src = src
        self.width = width
        self.height = height

        self.cap: Optional[cv2.VideoCapture] = None
        self._frame: Optional[np.ndarray] = None
        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self.fps: float = 0.0

    def start(self) -> "ThreadedCamera":
        if self._running:
            return self

        # Try DirectShow on Windows for instant camera initialization
        for source_idx in [self.src, 1 if self.src == 0 else 0]:
            cap = cv2.VideoCapture(source_idx, cv2.CAP_DSHOW)
            if cap.isOpened():
                self.cap = cap
                self.src = source_idx
                break
            cap.release()
            
            # Fallback to default backend
            cap = cv2.VideoCapture(source_idx)
            if cap.isOpened():
                self.cap = cap
                self.src = source_idx
                break
            cap.release()

        if self.cap is None or not self.cap.isOpened():
            raise RuntimeError(f"Unable to open any video source (tried 0, 1)")

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)

        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        return self

    def _capture_loop(self):
        prev_time = time.perf_counter()
        while self._running and self.cap and self.cap.isOpened():
            success, frame = self.cap.read()
            if not success:
                time.sleep(0.01)
                continue

            with self._lock:
                self._frame = frame

            now = time.perf_counter()
            delta = now - prev_time
            if delta > 0:
                self.fps = 0.9 * self.fps + 0.1 * (1.0 / delta)
            prev_time = now

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """Returns the most recent frame safely without blocking."""
        with self._lock:
            if self._frame is None:
                return False, None
            return True, self._frame.copy()

    def stop(self):
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()
            self.cap = None

    def __enter__(self):
        return self.start()

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
