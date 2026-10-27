"""mediapipe 흉내 모듈의 파이썬 쪽(PLAN §8.2 P2-08 손 / P2-09 얼굴·자세, 판 1.8.0 — mediapipe 1.x 파이썬 판의 Tasks API 모양).

학생 코드는 토니 5.0(파이썬 3.14) + mediapipe 1.1.1에서 쓰는 그대로 쓴다(같은 폴더의 mediapipe.py가 이 모듈을 `mediapipe`라는 이름으로 내보낸다):

    import time
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import vision

    options = vision.HandLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2)
    hands = vision.HandLandmarker.create_from_options(options)
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    result = hands.detect_for_video(image, int(time.time() * 1000))   # 대기 지점(화면이 추론)
    for hand in result.hand_landmarks:                                  # 손이 없으면 빈 리스트
        hand[8].x                                                       # 0~1 좌표, .y .z
        vision.drawing_utils.draw_landmarks(frame, hand, vision.HandLandmarksConnections.HAND_CONNECTIONS)
    result.handedness[0][0].category_name                               # 'Left' / 'Right'

얼굴 그물(FaceLandmarker — 늘 478점), 자세(PoseLandmarker — 33점, visibility·presence), 얼굴 상자(FaceDetector — 픽셀 상자)도 같은 모양이다.
옛 사용법 `mp.solutions`는 mediapipe 0.10.30부터 빠졌으므로 여기서도 진짜처럼 AttributeError가 난다(mediapipe.py의 __getattr__ — 오류 사전 풀이로 이어짐).

동작
- XxxLandmarker.create_from_options(options)는 화면에 'mediapipe.open'을 부탁해 엔진을 준비시킨다(대기 지점 — 카메라가 없으면 화면이 재생 입력으로 바꾼다).
  모델 파일(model_asset_path)은 브라우저에 없으므로 사이트가 같은 이름의 모델(public/models/)을 쓰고 처음 한 번 안내한다. 다른 작업의 모델 이름
  (손 인식에 face_landmarker.task 등)이나 모르는 이름(오타)을 적으면 진짜와 같은 FileNotFoundError가 난다([파일 넣기]로 올린 파일이면 사이트 모델로).
- detect(image)·detect_for_video(image, timestamp_ms)·detect_async(image, timestamp_ms)는 mp.Image의 RGB 배열을 RGBA로 바꿔 'mediapipe.detect'로 보내고
  답을 기다린다(대기 지점: [정지]·조절 값이 여기서 들어온다). 실행 모드가 맞지 않거나 시각이 늘지 않으면 진짜와 같은 ValueError가 난다.
  LIVE_STREAM의 result_callback은 detect_async 안에서 곧바로 부른다(브라우저에는 따로 도는 스레드가 없다).
- 결과는 진짜와 같은 dataclass: HandLandmarkerResult(handedness, hand_landmarks, hand_world_landmarks) 등 — 못 찾으면 빈 리스트.
  NormalizedLandmark(x, y, z, visibility, presence, name), Category(index, score, display_name, category_name), Detection(bounding_box, categories, keypoints).
- drawing_utils·drawing_styles는 mediapipe 1.1.1 파이썬 판(mediapipe/tasks/python/vision/drawing_{utils,styles}.py)을 그대로 옮겨 진짜 cv2로 그린다.
  연결표는 Connection(start, end) 목록이라 draw_landmarks가 connection.start·connection.end를 읽는다(진짜와 같음).
- 제한 모드(JSPI 없음): 기다릴 수 없어 아무것도 못 찾은 결과(빈 리스트)를 돌려주고 한 번 안내한다.

PC의 mediapipe 1.1.1과 다른 점(화면 쪽 hands-engine.ts 머리말과 같은 내용):
- 추론 엔진이 브라우저의 MediaPipe Tasks Vision 0.10.35다(PD-03 — 1.x JS는 사용 기록을 Google로 보내 쓰지 않는다). 모델 파일은 같은 종류라
  같은 사진에서 결과가 거의 같지만 조금 다를 수 있다(임계값은 조절 패널·@slider로).
- 손 좌우(handedness)의 index는 진짜 파이썬 판처럼 Right=0·Left=1이다(2026-10-26 실제 1.1.1로 확인).
- 재생 입력(합성 좌표)에서는 hand_world_landmarks·pose_world_landmarks를 0~1 좌표에서 계산한 근삿값(미터 단위 비슷한 크기)으로 채운다.
- output_face_blendshapes=True의 표정 점수 52개는 눈·입 점 사이 거리로 계산한 근삿값이다(눈 깜빡임·입 벌림만 0이 아님 — 안내 한 번).
  output_facial_transformation_matrixes=True는 단위 행렬, output_segmentation_masks=True는 None이다(안내 한 번).
- image_processing_options(돌리기·관심 영역)는 받기만 하고 쓰지 않는다(안내 한 번).
- 손·얼굴·자세·얼굴 상자 밖의 작업(GestureRecognizer 등)은 만들 때 한국어 설명이 붙은 NotImplementedError가 난다.

규칙(src/lab/README.md 4.4): apc_runtime의 request·notice·can_wait·register_reset_hook만 쓴다. install()·초기화 함수(_reset)는 동기 진입점에서
불리므로 양보하는 함수를 부르지 않는다(PROGRESS 미해결 25번). cv2는 그리기·RGBA 변환에서만 늦게 import한다. numpy는 맨 위에서 try로 받아 두고
(np가 None이면 쓰는 자리에서만 오류) _state["installed"]로 install()이 멱등인지 적는다(판 1.2.0 패키지 받기 검사가 이 두 이름을 본다).

출처 고지: HandLandmarksConnections·FaceLandmarksConnections·PoseLandmarksConnections 연결표(얼굴·자세는 생성 파일 apc_mp_tables.py),
HandLandmark 21점·PoseLandmark 33점 번호, 표정 점수 52개의 이름과 차례, DrawingSpec 기본값(색·두께·반지름), drawing_styles의 스타일 표,
draw_landmarks·draw_detection 그리기 규칙, 오류 문구는 google-ai-edge/mediapipe의 파이썬 코드(mediapipe 1.1.1, Copyright The MediaPipe Authors,
Apache License 2.0)에서 옮겼다. 라이선스 전문은 public/licenses/mediapipe-tasks-vision.txt, 출처 항목은 sources.yaml "MediaPipe Tasks Vision".
이 파일 자체는 사이트 소프트웨어(MIT, PD-26)이며 옮긴 부분은 위 표시로 구분한다(Apache-2.0 4조 변경 표시).
"""

import collections.abc
import dataclasses
import enum
import math
import ntpath
import operator
import os
import types
from typing import Any, Callable, List, Mapping, Optional

import apc_mp_tables
import apc_runtime

try:  # numpy는 실습실이 미리 받아 두지만, install()은 패키지를 받기 전에도 불릴 수 있다(동기 진입점).
    import numpy as np
except ImportError:  # pragma: no cover - 실습실에서는 opencv-python과 함께 늘 있다.
    np = None

__all__ = [
    "BaseOptions",
    "BoundingBox",
    "Category",
    "Detection",
    "DetectionResult",
    "FaceDetector",
    "FaceDetectorOptions",
    "FaceDetectorResult",
    "FaceLandmarker",
    "FaceLandmarkerOptions",
    "FaceLandmarkerResult",
    "FaceLandmarksConnections",
    "HandLandmark",
    "HandLandmarker",
    "HandLandmarkerOptions",
    "HandLandmarkerResult",
    "HandLandmarksConnections",
    "Image",
    "ImageFormat",
    "Landmark",
    "LEGACY_SOLUTIONS_MESSAGE",
    "NormalizedKeypoint",
    "NormalizedLandmark",
    "PoseLandmark",
    "PoseLandmarker",
    "PoseLandmarkerOptions",
    "PoseLandmarkerResult",
    "PoseLandmarksConnections",
    "RunningMode",
    "SUBMODULES",
    "VERSION",
    "drawing_styles",
    "drawing_utils",
    "install",
    "tasks",
    "vision",
]

# 학생이 mp.__version__으로 볼 값(흉내 내는 파이썬 판 + 사이트 표시)
VERSION = "1.1.1-apc"

REQUEST_OPEN = "mediapipe.open"
REQUEST_DETECT = "mediapipe.detect"
# 화면(index.ts)과 주고받는 작업 이름 — 판 1.8.0 전부터 쓰던 이름을 그대로 둔다(화면 쪽 엔진 표가 이 이름으로 갈린다).
SOLUTION_HANDS = "hands"
SOLUTION_FACE_MESH = "face_mesh"
SOLUTION_FACE_DETECTION = "face_detection"
SOLUTION_POSE = "pose"

LIMITED_MESSAGE = (
    "이 브라우저에는 JSPI(파이썬 기다리기 기능)가 없어서 인식 결과를 기다릴 수 없어요. "
    "detect()는 아무것도 찾지 못한 결과(빈 리스트)로 답해요. 컴퓨터의 Chrome이나 Edge 최신판에서 열어 주세요."
)
NO_NUMPY_MESSAGE = (
    "손·얼굴 인식에는 numpy가 필요한데 아직 받지 못했어요. 코드 위쪽에 import cv2를 두면 실습실이 OpenCV·numpy를 함께 받아요."
)
#: mediapipe.py의 __getattr__이 쓰는 문구(진짜 mediapipe 1.x와 같은 AttributeError — 오류 사전 'mediapipe-no-solutions'가 풀이한다)
LEGACY_SOLUTIONS_MESSAGE = "module 'mediapipe' has no attribute 'solutions'"
LEGACY_SOLUTIONS_NOTICE = (
    "mp.solutions(옛 사용법)는 mediapipe 0.10.30부터 없어졌어요. 이 사이트는 토니 5.0 + mediapipe 1.1.1 기준이라 "
    "손은 vision.HandLandmarker, 얼굴은 vision.FaceLandmarker, 자세는 vision.PoseLandmarker를 써요. 예제 목록의 같은 차시 예제를 열어 보세요."
)
IMAGE_PTR_MESSAGE = (
    "'{name}' object has no attribute '_image_ptr' "
    "(detect에는 mp.Image를 넣어요 — 예: image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))"
)
TIMESTAMP_MESSAGE = "Input timestamp must be monotonically increasing."
LIVE_NEEDS_CALLBACK = "The vision task is in live stream mode, a user-defined result callback must be provided."
CALLBACK_NOT_ALLOWED = "The vision task is in image or video mode, a user-defined result callback should not be provided."
NO_MODEL_MESSAGE = "ExternalFile must specify at least one of 'file_content', 'file_name', 'file_pointer_meta' or 'file_descriptor_meta'."


def _require_numpy():
    """numpy를 실제로 쓰는 자리에서만 확인한다(install()은 numpy 없이도 되게 — 동기 진입점 규칙)."""
    if np is None:
        raise RuntimeError(NO_NUMPY_MESSAGE)
    return np


# noticed는 실행마다 비우고(_reset), noticed_page는 한 쪽에서 한 번만(모델 파일 안내처럼 실행마다 되풀이하면 시끄러운 것).
_state = {"next_id": 1, "noticed": set(), "noticed_page": set(), "installed": False}


def _notice_once(key, text, level="warn"):
    if key in _state["noticed"]:
        return
    _state["noticed"].add(key)
    apc_runtime.notice(text, level)


def _notice_once_per_page(key, text, level="info"):
    if key in _state["noticed_page"]:
        return
    _state["noticed_page"].add(key)
    apc_runtime.notice(text, level)


# ── 결과 그릇(mediapipe/tasks/python/components/containers — 진짜와 같은 dataclass, repr도 같다) ──


@dataclasses.dataclass
class Category:
    """분류 하나: 손 좌우('Left'·'Right'), 표정 점수 이름 등. 진짜 파이썬 판처럼 index·score·display_name·category_name 넷이다."""

    index: Optional[int] = None
    score: Optional[float] = None
    display_name: Optional[str] = None
    category_name: Optional[str] = None


@dataclasses.dataclass
class Landmark:
    """월드 좌표(미터 단위, 손·몸 가운데 기준) 점 하나."""

    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None
    visibility: Optional[float] = None
    presence: Optional[float] = None
    name: Optional[str] = None


@dataclasses.dataclass
class NormalizedLandmark:
    """0~1로 나타낸 점 하나(x는 왼쪽 0 → 오른쪽 1, y는 위 0 → 아래 1, z는 깊이). 손·얼굴은 visibility·presence가 None이다."""

    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None
    visibility: Optional[float] = None
    presence: Optional[float] = None
    name: Optional[str] = None


@dataclasses.dataclass
class BoundingBox:
    """픽셀 상자(왼쪽 위 origin_x·origin_y와 너비·높이 — 모두 정수)."""

    origin_x: int
    origin_y: int
    width: int
    height: int


@dataclasses.dataclass
class NormalizedKeypoint:
    """얼굴 상자가 함께 주는 0~1 점(오른눈·왼눈·코끝·입·오른귀·왼귀 차례)."""

    x: Optional[float] = None
    y: Optional[float] = None
    label: Optional[str] = None
    score: Optional[float] = None


@dataclasses.dataclass
class Detection:
    """얼굴 상자 하나: bounding_box(픽셀), categories([Category] — score가 믿음 정도), keypoints(점 6개)."""

    bounding_box: BoundingBox
    categories: List[Category]
    keypoints: Optional[List[NormalizedKeypoint]] = None


@dataclasses.dataclass
class DetectionResult:
    """FaceDetector의 결과: detections(얼굴 상자 목록 — 없으면 빈 리스트)."""

    detections: List[Detection]


FaceDetectorResult = DetectionResult


@dataclasses.dataclass
class HandLandmarkerResult:
    """손 인식 결과. 세 목록의 i번째가 같은 손이다(손이 없으면 모두 빈 리스트)."""

    handedness: List[List[Category]]
    hand_landmarks: List[List[NormalizedLandmark]]
    hand_world_landmarks: List[List[Landmark]]


@dataclasses.dataclass
class FaceLandmarkerResult:
    """얼굴 그물 결과. face_landmarks[i]가 얼굴 하나의 점 478개다."""

    face_landmarks: List[List[NormalizedLandmark]]
    face_blendshapes: List[List[Category]]
    facial_transformation_matrixes: List[Any]


@dataclasses.dataclass
class PoseLandmarkerResult:
    """자세 결과. pose_landmarks[i]가 사람 하나의 점 33개다(visibility·presence 있음)."""

    pose_landmarks: List[List[NormalizedLandmark]]
    pose_world_landmarks: List[List[Landmark]]
    segmentation_masks: Optional[List[Any]] = None


# ── 점 번호(mediapipe 1.1.1 hand_landmarker.HandLandmark·pose_landmarker.PoseLandmark와 같음) ──


class HandLandmark(enum.IntEnum):
    """21개 손 관절 번호."""

    WRIST = 0
    THUMB_CMC = 1
    THUMB_MCP = 2
    THUMB_IP = 3
    THUMB_TIP = 4
    INDEX_FINGER_MCP = 5
    INDEX_FINGER_PIP = 6
    INDEX_FINGER_DIP = 7
    INDEX_FINGER_TIP = 8
    MIDDLE_FINGER_MCP = 9
    MIDDLE_FINGER_PIP = 10
    MIDDLE_FINGER_DIP = 11
    MIDDLE_FINGER_TIP = 12
    RING_FINGER_MCP = 13
    RING_FINGER_PIP = 14
    RING_FINGER_DIP = 15
    RING_FINGER_TIP = 16
    PINKY_MCP = 17
    PINKY_PIP = 18
    PINKY_DIP = 19
    PINKY_TIP = 20


class PoseLandmark(enum.IntEnum):
    """33개 몸 관절 번호. LEFT/RIGHT는 **그 사람 기준**이다."""

    NOSE = 0
    LEFT_EYE_INNER = 1
    LEFT_EYE = 2
    LEFT_EYE_OUTER = 3
    RIGHT_EYE_INNER = 4
    RIGHT_EYE = 5
    RIGHT_EYE_OUTER = 6
    LEFT_EAR = 7
    RIGHT_EAR = 8
    MOUTH_LEFT = 9
    MOUTH_RIGHT = 10
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_PINKY = 17
    RIGHT_PINKY = 18
    LEFT_INDEX = 19
    RIGHT_INDEX = 20
    LEFT_THUMB = 21
    RIGHT_THUMB = 22
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    LEFT_HEEL = 29
    RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32


# ── 연결표(Connection(start, end) 목록 — 진짜와 같은 차례, 그리기 결과가 같도록) ──


def _connections(cls, pairs):
    return [cls.Connection(start, end) for start, end in pairs]


class HandLandmarksConnections:
    """손 연결표(진짜 hand_landmarker.HandLandmarksConnections와 같은 이름·차례)."""

    @dataclasses.dataclass
    class Connection:
        start: int
        end: int

    HAND_PALM_CONNECTIONS: List["HandLandmarksConnections.Connection"] = []
    HAND_THUMB_CONNECTIONS: List["HandLandmarksConnections.Connection"] = []
    HAND_INDEX_FINGER_CONNECTIONS: List["HandLandmarksConnections.Connection"] = []
    HAND_MIDDLE_FINGER_CONNECTIONS: List["HandLandmarksConnections.Connection"] = []
    HAND_RING_FINGER_CONNECTIONS: List["HandLandmarksConnections.Connection"] = []
    HAND_PINKY_FINGER_CONNECTIONS: List["HandLandmarksConnections.Connection"] = []
    HAND_CONNECTIONS: List["HandLandmarksConnections.Connection"] = []


HandLandmarksConnections.Connection.__qualname__ = "HandLandmarksConnections.Connection"
HandLandmarksConnections.HAND_PALM_CONNECTIONS = _connections(HandLandmarksConnections, ((0, 1), (0, 5), (9, 13), (13, 17), (5, 9), (0, 17)))
HandLandmarksConnections.HAND_THUMB_CONNECTIONS = _connections(HandLandmarksConnections, ((1, 2), (2, 3), (3, 4)))
HandLandmarksConnections.HAND_INDEX_FINGER_CONNECTIONS = _connections(HandLandmarksConnections, ((5, 6), (6, 7), (7, 8)))
HandLandmarksConnections.HAND_MIDDLE_FINGER_CONNECTIONS = _connections(HandLandmarksConnections, ((9, 10), (10, 11), (11, 12)))
HandLandmarksConnections.HAND_RING_FINGER_CONNECTIONS = _connections(HandLandmarksConnections, ((13, 14), (14, 15), (15, 16)))
HandLandmarksConnections.HAND_PINKY_FINGER_CONNECTIONS = _connections(HandLandmarksConnections, ((17, 18), (18, 19), (19, 20)))
HandLandmarksConnections.HAND_CONNECTIONS = (
    HandLandmarksConnections.HAND_PALM_CONNECTIONS
    + HandLandmarksConnections.HAND_THUMB_CONNECTIONS
    + HandLandmarksConnections.HAND_INDEX_FINGER_CONNECTIONS
    + HandLandmarksConnections.HAND_MIDDLE_FINGER_CONNECTIONS
    + HandLandmarksConnections.HAND_RING_FINGER_CONNECTIONS
    + HandLandmarksConnections.HAND_PINKY_FINGER_CONNECTIONS
)


class FaceLandmarksConnections:
    """얼굴 그물 연결표(진짜 face_landmarker.FaceLandmarksConnections와 같은 이름·차례 — 생성 파일 apc_mp_tables.py)."""

    @dataclasses.dataclass
    class Connection:
        start: int
        end: int

    FACE_LANDMARKS_LIPS: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_LEFT_EYE: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_LEFT_EYEBROW: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_LEFT_IRIS: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_RIGHT_EYE: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_RIGHT_EYEBROW: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_RIGHT_IRIS: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_FACE_OVAL: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_NOSE: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_CONTOURS: List["FaceLandmarksConnections.Connection"] = []
    FACE_LANDMARKS_TESSELATION: List["FaceLandmarksConnections.Connection"] = []


FaceLandmarksConnections.Connection.__qualname__ = "FaceLandmarksConnections.Connection"
for _name in (
    "FACE_LANDMARKS_LIPS",
    "FACE_LANDMARKS_LEFT_EYE",
    "FACE_LANDMARKS_LEFT_EYEBROW",
    "FACE_LANDMARKS_LEFT_IRIS",
    "FACE_LANDMARKS_RIGHT_EYE",
    "FACE_LANDMARKS_RIGHT_EYEBROW",
    "FACE_LANDMARKS_RIGHT_IRIS",
    "FACE_LANDMARKS_FACE_OVAL",
    "FACE_LANDMARKS_NOSE",
    "FACE_LANDMARKS_CONTOURS",
    "FACE_LANDMARKS_TESSELATION",
):
    setattr(FaceLandmarksConnections, _name, _connections(FaceLandmarksConnections, getattr(apc_mp_tables, _name)))


class PoseLandmarksConnections:
    """자세 연결표(진짜 pose_landmarker.PoseLandmarksConnections와 같은 이름·차례)."""

    @dataclasses.dataclass
    class Connection:
        start: int
        end: int

    POSE_LANDMARKS: List["PoseLandmarksConnections.Connection"] = []


PoseLandmarksConnections.Connection.__qualname__ = "PoseLandmarksConnections.Connection"
PoseLandmarksConnections.POSE_LANDMARKS = _connections(PoseLandmarksConnections, apc_mp_tables.POSE_LANDMARKS)

# 표정 점수 52개의 이름(진짜 face_landmarker의 차례 — 2026-10-26 mediapipe 1.1.1 결과에서 옮김)
BLENDSHAPE_NAMES = (
    "_neutral", "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff", "cheekSquintLeft",
    "cheekSquintRight", "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight",
    "eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight",
    "jawForward", "jawLeft", "jawOpen", "jawRight", "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight",
    "mouthFunnel", "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight",
    "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft",
    "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight",
)


# ── 사진 그릇(mediapipe.Image·ImageFormat) ──


class ImageFormat(enum.IntEnum):
    """진짜 mediapipe.ImageFormat과 같은 번호. 이 실습실의 인식에는 SRGB(빨강·초록·파랑 순서, uint8)를 쓴다."""

    UNKNOWN = 0
    SRGB = 1
    SRGBA = 2
    GRAY8 = 3
    GRAY16 = 4
    SRGB48 = 7
    SRGBA64 = 8
    VEC32F1 = 9
    VEC32F2 = 12
    VEC32F4 = 13


_FORMAT_CHANNELS = {
    ImageFormat.SRGB: 3,
    ImageFormat.SRGBA: 4,
    ImageFormat.GRAY8: 1,
    ImageFormat.GRAY16: 1,
    ImageFormat.SRGB48: 3,
    ImageFormat.SRGBA64: 4,
    ImageFormat.VEC32F1: 1,
    ImageFormat.VEC32F2: 2,
    ImageFormat.VEC32F4: 4,
}
_UINT8_FORMATS = (ImageFormat.SRGB, ImageFormat.SRGBA, ImageFormat.GRAY8)
_FLOAT_FORMATS = (ImageFormat.VEC32F1, ImageFormat.VEC32F2, ImageFormat.VEC32F4)


class Image:
    """mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb) — 인식에 넘길 사진 한 장. 넣은 배열을 복사해 두고 numpy_view()로 읽기만 하게 보여 준다."""

    def __init__(self, image_format, data):
        numpy = _require_numpy()
        if not hasattr(data, "ndim"):
            raise AttributeError(f"'{type(data).__name__}' object has no attribute 'ndim'")
        try:
            image_format = ImageFormat(image_format)
        except ValueError:
            raise ValueError(f"Unsupported image format: {image_format}") from None
        array = numpy.asarray(data)
        if array.dtype.kind == "f" and image_format not in _FLOAT_FORMATS:
            raise ValueError(f"Unsupported image format: {image_format.name} (expected VEC32F1, VEC32F2, or VEC32F4 for float data)")
        if image_format in _UINT8_FORMATS and array.dtype != numpy.uint8:
            raise ValueError(f"Unsupported image format: {image_format.name} (expected uint8 data)")
        if array.ndim < 2 or array.shape[0] == 0 or array.shape[1] == 0:
            raise ValueError("Pixel data size is too small: 0 (사진의 높이·너비가 0이에요)")
        height, width = int(array.shape[0]), int(array.shape[1])
        channels = _FORMAT_CHANNELS.get(image_format, 1)
        expected = height * width * channels
        if int(array.size) < expected:
            raise ValueError(f"Pixel data size is too small: {int(array.size)} (expected {expected})")
        self._format = image_format
        self._data = numpy.array(array, copy=True)
        self._data.setflags(write=False)
        self._channels = channels

    @classmethod
    def create_from_file(cls, file_name):
        """그림 파일을 읽어 SRGB(투명도가 있으면 SRGBA) 사진으로. 없는 파일이면 진짜처럼 FileNotFoundError."""
        path = os.fspath(file_name)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Can't find file: {path}")
        cv2 = _cv2()
        array = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if array is None:
            raise ValueError(f"Image decoding failed: {path} (그림 파일을 열지 못했어요 — jpg·png인지 확인해요)")
        if array.ndim == 2:
            return cls(ImageFormat.GRAY8, array)
        if array.shape[2] == 4:
            return cls(ImageFormat.SRGBA, cv2.cvtColor(array, cv2.COLOR_BGRA2RGBA))
        return cls(ImageFormat.SRGB, cv2.cvtColor(array, cv2.COLOR_BGR2RGB))

    @property
    def width(self):
        return int(self._data.shape[1])

    @property
    def height(self):
        return int(self._data.shape[0])

    @property
    def channels(self):
        return self._channels

    @property
    def image_format(self):
        return self._format

    @property
    def step(self):
        return int(self._data.strides[0])

    def numpy_view(self):
        """사진 배열(읽기 전용). 고쳐 쓰려면 .copy()로 복사해요."""
        return self._data

    def is_empty(self):
        return self._data.size == 0

    def is_contiguous(self):
        return bool(self._data.flags["C_CONTIGUOUS"])

    def is_aligned(self, alignment=16):
        return True

    def uses_gpu(self):
        return False

    def _rgb(self):
        """인식에 쓸 RGB 배열(높이×너비×3, uint8). SRGB·SRGBA만 받는다(진짜도 색 사진 모델이라 흑백은 실패)."""
        if self._format in (ImageFormat.SRGB, ImageFormat.SRGBA) and self._data.ndim == 3:
            return self._data[:, :, :3]
        raise ValueError(
            "CalculatorGraph::Run() failed: TfLiteTensor and Tensor sizes do not match. "
            f"(인식에는 색 사진(mp.ImageFormat.SRGB)을 넣어요. 지금 형식: {self._format.name} — rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))"
        )

    def __repr__(self):
        return f"<mediapipe.tasks.python.vision.core.image.Image object at 0x{id(self):x}>"


# ── 설정(BaseOptions·RunningMode·작업별 Options — 진짜와 같은 dataclass) ──


class VisionTaskRunningMode(enum.Enum):
    """IMAGE(사진 한 장 — detect), VIDEO(영상 프레임 — detect_for_video), LIVE_STREAM(실시간 — detect_async + result_callback)."""

    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    LIVE_STREAM = "LIVE_STREAM"


RunningMode = VisionTaskRunningMode

_MODE_WORDS = {
    VisionTaskRunningMode.IMAGE: "image mode",
    VisionTaskRunningMode.VIDEO: "video mode",
    VisionTaskRunningMode.LIVE_STREAM: "live stream mode",
}


@dataclasses.dataclass
class BaseOptions:
    """모델 파일: model_asset_path(파일 경로) 또는 model_asset_buffer(파일 내용). delegate는 CPU·GPU(실습실에서는 쓰지 않음)."""

    class Delegate(enum.IntEnum):
        CPU = 0
        GPU = 1

    model_asset_path: Optional[str] = None
    model_asset_buffer: Optional[bytes] = None
    delegate: Optional["BaseOptions.Delegate"] = None


BaseOptions.Delegate.__qualname__ = "BaseOptions.Delegate"


@dataclasses.dataclass
class ImageProcessingOptions:
    """사진 돌리기·관심 영역(진짜에는 있지만 이 실습실은 받기만 하고 쓰지 않는다)."""

    region_of_interest: Any = None
    rotation_degrees: int = 0


@dataclasses.dataclass
class HandLandmarkerOptions:
    base_options: BaseOptions
    running_mode: VisionTaskRunningMode = VisionTaskRunningMode.IMAGE
    num_hands: int = 1
    min_hand_detection_confidence: float = 0.5
    min_hand_presence_confidence: float = 0.5
    min_tracking_confidence: float = 0.5
    result_callback: Optional[Callable[..., None]] = None


@dataclasses.dataclass
class FaceLandmarkerOptions:
    base_options: BaseOptions
    running_mode: VisionTaskRunningMode = VisionTaskRunningMode.IMAGE
    num_faces: int = 1
    min_face_detection_confidence: float = 0.5
    min_face_presence_confidence: float = 0.5
    min_tracking_confidence: float = 0.5
    output_face_blendshapes: bool = False
    output_facial_transformation_matrixes: bool = False
    result_callback: Optional[Callable[..., None]] = None


@dataclasses.dataclass
class PoseLandmarkerOptions:
    base_options: BaseOptions
    running_mode: VisionTaskRunningMode = VisionTaskRunningMode.IMAGE
    num_poses: int = 1
    min_pose_detection_confidence: float = 0.5
    min_pose_presence_confidence: float = 0.5
    min_tracking_confidence: float = 0.5
    output_segmentation_masks: bool = False
    result_callback: Optional[Callable[..., None]] = None


@dataclasses.dataclass
class FaceDetectorOptions:
    base_options: BaseOptions
    running_mode: VisionTaskRunningMode = VisionTaskRunningMode.IMAGE
    min_detection_confidence: float = 0.5
    min_suppression_threshold: float = 0.3
    result_callback: Optional[Callable[..., None]] = None


# ── 모델 파일 이름(사이트에 있는 모델과 짝짓기) ──

# 이름 → (작업, 자세 모델 굵기). 모델 묶음 안 파일 목록은 진짜 오류 문구를 같게 만들 때 쓴다(2026-10-26 mediapipe 1.1.1로 확인).
_MODEL_FILES = {
    "hand_landmarker.task": (SOLUTION_HANDS, None),
    "face_landmarker.task": (SOLUTION_FACE_MESH, None),
    "face_landmarker_v2_with_blendshapes.task": (SOLUTION_FACE_MESH, None),
    "pose_landmarker_lite.task": (SOLUTION_POSE, 0),
    "pose_landmarker_full.task": (SOLUTION_POSE, 1),
    "pose_landmarker_heavy.task": (SOLUTION_POSE, 2),
    "blaze_face_short_range.tflite": (SOLUTION_FACE_DETECTION, None),
    "face_detection_short_range.tflite": (SOLUTION_FACE_DETECTION, None),
}
_BUNDLE_FILES = {
    SOLUTION_HANDS: "hand_landmarks_detector.tflite, hand_detector.tflite",
    SOLUTION_FACE_MESH: "face_landmarks_detector.tflite, face_detector.tflite, geometry_pipeline_metadata_landmarks.binarypb, face_blendshapes.tflite",
    SOLUTION_POSE: "pose_detector.tflite, pose_landmarks_detector.tflite",
    SOLUTION_FACE_DETECTION: "",
}
_FIRST_INNER_FILE = {
    SOLUTION_HANDS: "hand_detector.tflite",
    SOLUTION_FACE_MESH: "face_detector.tflite",
    SOLUTION_POSE: "pose_detector.tflite",
}
_SITE_MODEL = {
    SOLUTION_HANDS: "hand_landmarker.task",
    SOLUTION_FACE_MESH: "face_landmarker.task",
    SOLUTION_POSE: "pose_landmarker_lite.task",
    SOLUTION_FACE_DETECTION: "blaze_face_short_range.tflite",
}
_TASK_LABELS = {
    SOLUTION_HANDS: "손 인식(HandLandmarker)",
    SOLUTION_FACE_MESH: "얼굴 그물(FaceLandmarker)",
    SOLUTION_POSE: "자세 인식(PoseLandmarker)",
    SOLUTION_FACE_DETECTION: "얼굴 상자(FaceDetector)",
}


def _resolve_model(solution, base_options):
    """BaseOptions → (자세 모델 굵기 또는 None). 브라우저에는 모델 파일이 없어 사이트 모델을 쓰되, 다른 작업의 모델 이름이면 진짜처럼 실패한다."""
    if not isinstance(base_options, BaseOptions):
        raise TypeError(
            f"base_options에는 mp.tasks.BaseOptions(...)를 넣어요. 받은 것: {type(base_options).__name__} "
            "— 예: base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task')"
        )
    path = base_options.model_asset_path
    if path is None and base_options.model_asset_buffer is None:
        raise ValueError(NO_MODEL_MESSAGE + " (BaseOptions(model_asset_path='모델 파일 이름')을 적어요)")
    if path is None:
        _notice_once_per_page(
            f"model-buffer-{solution}",
            f"model_asset_buffer로 넘긴 모델 대신 사이트에 있는 모델 파일({_SITE_MODEL[solution]})로 {_TASK_LABELS[solution]}을 해요.",
        )
        return None
    # 윈도우 경로(C:\Users\…\hand_landmarker.task)도 파일 이름을 찾게 ntpath로 — 역슬래시와 / 둘 다 나눈다(판 1.8.0 검토 반영)
    name = ntpath.basename(os.fspath(path)).lower()
    known = _MODEL_FILES.get(name)
    if known is not None and known[0] != solution:
        other = known[0]
        hint = f" ({_TASK_LABELS[solution]}에는 {_SITE_MODEL[solution]} 모델을 써요. 지금 적은 {name} 파일은 {_TASK_LABELS[other]}용이에요)"
        if solution == SOLUTION_FACE_DETECTION:
            # 얼굴 상자 모델은 .tflite 한 파일이라 묶음(.task)을 넣으면 진짜도 이 문구로 실패한다
            raise ValueError("The model is not a valid Flatbuffer buffer" + hint)
        raise FileNotFoundError(f"No file with name: {_FIRST_INNER_FILE[solution]}. All files in the model asset bundle are: {_BUNDLE_FILES[other]}." + hint)
    if known is None:
        if not os.path.exists(os.fspath(path)):
            # 진짜 PC에서도 없는 파일 이름이면 이 오류로 멈춘다(이름 틀림을 실습실에서도 그대로 배운다).
            raise FileNotFoundError(
                f"Unable to open file at {os.fspath(path)} "
                f"({_TASK_LABELS[solution]} 모델 파일 이름을 확인해요 — 보통 쓰는 이름: {_SITE_MODEL[solution]})"
            )
        _notice_once_per_page(
            f"model-unknown-{solution}-{name}",
            f"실습실은 올린 파일({name}) 대신 사이트에 있는 모델 파일({_SITE_MODEL[solution]})로 {_TASK_LABELS[solution]}을 해요.",
        )
        return None
    if not os.path.exists(os.fspath(path)):
        _notice_once_per_page(
            f"model-site-{name}",
            f"실습실은 사이트에 있는 모델 파일({name})을 써요. 진짜 PC(토니)에서는 이 모델 파일이 코드 파일과 같은 폴더에 있어야 해요"
            "(받는 곳: 선생님 자료실 '진짜 PC에서 돌리기').",
        )
    if known[1] == 2:
        _notice_once_per_page(
            "pose-heavy",
            "자세 모델 pose_landmarker_heavy.task 파일은 아주 무거워서(30MB) 이 사이트에 두지 않았어요. 대신 pose_landmarker_full.task 파일과 같은 모델로 돌려요.",
        )
    return known[1]


# ── 화면과 주고받기 ──


def _to_rgba_bytes(rgb):
    """RGB 배열(높이×너비×3) → 화면의 ImageData가 바로 읽는 RGBA 1차원 바이트."""
    numpy = _require_numpy()
    rgb = numpy.ascontiguousarray(rgb)
    try:
        import cv2  # 영상 처리 실습실이 미리 받아 둔 OpenCV(없으면 numpy로)

        rgba = cv2.cvtColor(rgb, cv2.COLOR_RGB2RGBA)
    except ImportError:
        alpha = numpy.full(rgb.shape[:2] + (1,), 255, dtype=numpy.uint8)
        rgba = numpy.concatenate([rgb, alpha], axis=2)
    return numpy.ascontiguousarray(rgba).reshape(-1)


def _float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalized(points, with_visibility=False):
    landmarks = []
    for point in points or []:
        x = _float(point[0])
        y = _float(point[1])
        z = _float(point[2]) if len(point) > 2 else 0.0
        if with_visibility:
            visibility = _float(point[3], 1.0) if len(point) > 3 else 1.0
            landmarks.append(NormalizedLandmark(x=x, y=y, z=z, visibility=visibility, presence=visibility))
        else:
            landmarks.append(NormalizedLandmark(x=x, y=y, z=z))
    return landmarks


def _world(points, with_visibility=False):
    landmarks = []
    for point in points or []:
        values = dict(x=_float(point[0]), y=_float(point[1]), z=_float(point[2]) if len(point) > 2 else 0.0)
        if with_visibility:
            visibility = _float(point[3], 1.0) if len(point) > 3 else 1.0
            values.update(visibility=visibility, presence=visibility)
        landmarks.append(Landmark(**values))
    return landmarks


def _approx_world(landmarks, scale, with_visibility=False):
    """재생 입력처럼 월드 좌표가 없을 때: 0~1 점들을 가운데 기준으로 옮기고 크기를 미터 비슷하게 줄인 근삿값."""
    if not landmarks:
        return []
    cx = sum(point.x for point in landmarks) / len(landmarks)
    cy = sum(point.y for point in landmarks) / len(landmarks)
    world = []
    for point in landmarks:
        values = dict(x=(point.x - cx) * scale, y=(point.y - cy) * scale, z=point.z * scale)
        if with_visibility:
            values.update(visibility=point.visibility, presence=point.presence)
        world.append(Landmark(**values))
    return world


def _handedness(category):
    """화면의 손 좌우({index, score, label}) → [Category]. 진짜 파이썬 판처럼 Right=0·Left=1, display_name도 이름과 같다."""
    if not isinstance(category, dict) or not category.get("label"):
        return []
    label = str(category.get("label"))
    index = 0 if label == "Right" else 1 if label == "Left" else int(_float(category.get("index"), -1))
    return [Category(index=index, score=_float(category.get("score")), display_name=label, category_name=label)]


def _hands_result(reply):
    """화면의 답 → HandLandmarkerResult. 손 개수는 화면이 코드 값(또는 조절 패널 값)으로 이미 맞춰 보낸다."""
    if not isinstance(reply, dict):
        return HandLandmarkerResult([], [], [])
    handedness, landmarks, world = [], [], []
    for item in reply.get("hands") or []:
        if not isinstance(item, dict):
            continue
        points = _normalized(item.get("landmarks"))
        if not points:
            continue
        landmarks.append(points)
        handedness.append(_handedness(item.get("handedness")))
        given = item.get("worldLandmarks")
        world.append(_world(given) if given else _approx_world(points, 0.2))
    return HandLandmarkerResult(handedness, landmarks, world)


def _distance(a, b):
    return math.hypot(a.x - b.x, a.y - b.y)


def _openness(points, top, bottom, left, right):
    width = _distance(points[left], points[right])
    return _distance(points[top], points[bottom]) / width if width > 1e-6 else 0.0


def _blendshapes(points):
    """얼굴 점 478개 → 표정 점수 52개의 근삿값(눈 깜빡임·입 벌림만 계산하고 나머지는 0)."""
    scores = dict.fromkeys(BLENDSHAPE_NAMES, 0.0)
    if len(points) >= 468:
        # 눈 높이 ÷ 눈 너비(뜬 눈 약 0.3, 감은 눈 약 0.05)를 0~1 깜빡임 점수로. 사람 기준 왼눈은 그림의 오른쪽(362·263 무리)이다.
        for name, (top, bottom, left, right) in (("eyeBlinkLeft", (386, 374, 362, 263)), ("eyeBlinkRight", (159, 145, 33, 133))):
            ratio = _openness(points, top, bottom, left, right)
            scores[name] = round(min(1.0, max(0.0, (0.28 - ratio) / 0.22)), 4)
        mouth = _openness(points, 13, 14, 61, 291)
        scores["jawOpen"] = round(min(1.0, max(0.0, (mouth - 0.05) / 0.6)), 4)
        scores["mouthClose"] = round(1.0 - scores["jawOpen"], 4)
        scores["_neutral"] = round(max(0.0, 1.0 - max(scores["eyeBlinkLeft"], scores["eyeBlinkRight"], scores["jawOpen"])), 4)
    return [Category(index=index, score=scores[name], display_name=None, category_name=name) for index, name in enumerate(BLENDSHAPE_NAMES)]


def _faces_result(reply, options):
    if not isinstance(reply, dict):
        return FaceLandmarkerResult([], [], [])
    faces = []
    for points in reply.get("faces") or []:
        landmarks = _normalized(points)
        if landmarks:
            faces.append(landmarks)
    blendshapes = []
    if options.output_face_blendshapes:
        _notice_once(
            "blendshapes",
            "표정 점수(face_blendshapes)는 이 실습실에서 눈·입 점 사이 거리로 계산한 근삿값이에요. eyeBlinkLeft·eyeBlinkRight·jawOpen·mouthClose만 바뀌어요.",
            "info",
        )
        blendshapes = [_blendshapes(face) for face in faces]
    matrixes = []
    if options.output_facial_transformation_matrixes:
        _notice_once("matrixes", "얼굴 변환 행렬(facial_transformation_matrixes)은 이 실습실에서 계산하지 않아요. 단위 행렬을 돌려줘요.", "info")
        numpy = _require_numpy()
        matrixes = [numpy.eye(4, dtype=numpy.float32) for _ in faces]
    return FaceLandmarkerResult(faces, blendshapes, matrixes)


def _pose_result(reply, options):
    if not isinstance(reply, dict):
        return PoseLandmarkerResult([], [], None)
    poses, worlds = [], []
    given_worlds = reply.get("poseWorlds") or []
    for index, points in enumerate(reply.get("poses") or []):
        landmarks = _normalized(points, with_visibility=True)
        if not landmarks:
            continue
        poses.append(landmarks)
        given = given_worlds[index] if index < len(given_worlds) else None
        worlds.append(_world(given, with_visibility=True) if given else _approx_world(landmarks, 0.8, with_visibility=True))
    masks = None
    if options.output_segmentation_masks:
        _notice_once("segmentation", "사람 모양 잘라내기(segmentation_masks)는 이 실습실에서 지원하지 않아요. 결과의 segmentation_masks는 None이에요.", "info")
    return PoseLandmarkerResult(poses, worlds, masks)


def _detections_result(reply, width, height):
    if not isinstance(reply, dict):
        return DetectionResult([])
    detections = []
    for item in reply.get("detections") or []:
        if not isinstance(item, dict):
            continue
        box = item.get("box") or {}
        bounding_box = BoundingBox(
            origin_x=int(round(_float(box.get("xmin")) * width)),
            origin_y=int(round(_float(box.get("ymin")) * height)),
            width=int(round(_float(box.get("width")) * width)),
            height=int(round(_float(box.get("height")) * height)),
        )
        keypoints = [NormalizedKeypoint(x=_float(point[0]), y=_float(point[1]), label=None, score=0.0) for point in item.get("keypoints") or []]
        detections.append(Detection(bounding_box=bounding_box, categories=[Category(index=0, score=_float(item.get("score")), display_name=None, category_name=None)], keypoints=keypoints))
    return DetectionResult(detections)


def _type_name(value):
    """파이썬 오류 문구의 타입 이름(numpy 배열은 진짜처럼 'numpy.ndarray')."""
    kind = type(value)
    module = getattr(kind, "__module__", "builtins")
    return kind.__qualname__ if module in ("builtins", "__main__") else f"{module}.{kind.__qualname__}"


def _check_running_mode(value):
    if not isinstance(value, VisionTaskRunningMode):
        raise AttributeError(
            f"'{type(value).__name__}' object has no attribute 'ctype' "
            "(running_mode에는 vision.RunningMode.VIDEO처럼 적어요)"
        )
    return value


def _ratio(value):
    return min(1.0, max(0.0, _float(value, 0.5)))


class _VisionTask:
    """네 작업이 함께 쓰는 뼈대: 만들 때 화면에 엔진을 부탁하고(mediapipe.open), detect마다 한 장을 보낸다(mediapipe.detect)."""

    _SOLUTION = ""
    _OPTIONS = None

    def __init__(self, *args, **kwargs):
        name = type(self).__name__
        raise TypeError(f"{name}(...)로 바로 만들지 않아요. vision.{name}.create_from_options(options)나 create_from_model_path('모델 파일 이름')로 만들어요.")

    @classmethod
    def create_from_model_path(cls, model_path):
        """모델 파일 하나로 IMAGE 모드(detect) 작업을 만든다."""
        return cls.create_from_options(cls._OPTIONS(base_options=BaseOptions(model_asset_path=model_path)))

    @classmethod
    def create_from_options(cls, options):
        if not isinstance(options, cls._OPTIONS):
            raise TypeError(f"create_from_options에는 vision.{cls._OPTIONS.__name__}(...)를 넣어요. 받은 것: {type(options).__name__}")
        mode = _check_running_mode(options.running_mode)
        if mode == VisionTaskRunningMode.LIVE_STREAM and options.result_callback is None:
            raise ValueError(LIVE_NEEDS_CALLBACK)
        if mode != VisionTaskRunningMode.LIVE_STREAM and options.result_callback is not None:
            raise ValueError(CALLBACK_NOT_ALLOWED)
        complexity = _resolve_model(cls._SOLUTION, options.base_options)
        task = object.__new__(cls)
        task._options = options
        task._mode = mode
        task._closed = False
        task._last_timestamp = None
        task._engine = "none"
        task._id = _state["next_id"]
        _state["next_id"] += 1
        task._open(cls._open_payload(options, complexity))
        return task

    @classmethod
    def _open_payload(cls, options, complexity):  # pragma: no cover - 하위 클래스가 채운다
        raise NotImplementedError

    def _open(self, js_options):
        if not apc_runtime.can_wait():
            self._engine = "limited"
            _notice_once("limited", LIMITED_MESSAGE)
            return
        js_options["runningMode"] = self._mode.value
        js_options["staticImageMode"] = self._mode == VisionTaskRunningMode.IMAGE
        reply = apc_runtime.request(REQUEST_OPEN, {"solution": self._SOLUTION, "id": self._id, "options": js_options})
        self._engine = str(reply.get("engine", "none")) if isinstance(reply, dict) else "none"

    @property
    def engine(self):
        """화면이 알려 준 엔진 상태: 'replay'(합성 좌표), 'ready'(Tasks), 'missing-model', 'failed', 'loading', 'limited', 'none'."""
        return self._engine

    def _empty(self):  # pragma: no cover - 하위 클래스가 채운다
        raise NotImplementedError

    def _result(self, reply, width, height):  # pragma: no cover - 하위 클래스가 채운다
        raise NotImplementedError

    def _check_mode(self, wanted):
        if self._mode != wanted:
            raise ValueError(f"Task is not initialized with the {_MODE_WORDS[wanted]}. Current running mode:{_MODE_WORDS[self._mode]}")

    def _check_timestamp(self, timestamp_ms):
        # 진짜는 ctypes 정수 칸에 넣으므로 정수처럼 쓸 수 있는 값(int·numpy 정수)만 받고 float는 TypeError다.
        try:
            timestamp_ms = operator.index(timestamp_ms)
        except TypeError:
            raise TypeError(
                f"'{type(timestamp_ms).__name__}' object cannot be interpreted as an integer "
                "(timestamp_ms에는 정수를 넣어요 — 예: int(time.time() * 1000))"
            ) from None
        if self._last_timestamp is not None and timestamp_ms <= self._last_timestamp:
            raise ValueError(TIMESTAMP_MESSAGE + f" (지난번 {self._last_timestamp} → 이번 {timestamp_ms}: 시각이 늘어나야 해요)")
        self._last_timestamp = timestamp_ms

    @staticmethod
    def _check_image(image):
        # 진짜는 image._image_ptr를 먼저 읽으므로 mp.Image가 아니면 시각을 기록하기 전에 멈춘다(판 1.8.0 검토 반영)
        if not isinstance(image, Image):
            raise AttributeError(IMAGE_PTR_MESSAGE.format(name=_type_name(image)))

    def _run(self, image, image_processing_options):
        self._check_image(image)
        if image_processing_options is not None:
            _notice_once("image-processing-options", "image_processing_options(사진 돌리기·관심 영역)는 이 실습실에서 쓰지 않고 그대로 인식해요.", "info")
        rgb = image._rgb()
        if self._closed:
            return self._empty()
        if self._engine == "limited" or not apc_runtime.can_wait():
            _notice_once("limited", LIMITED_MESSAGE)
            return self._empty()
        height, width = int(rgb.shape[0]), int(rgb.shape[1])
        payload = {"solution": self._SOLUTION, "id": self._id, "width": width, "height": height, "data": _to_rgba_bytes(rgb)}
        return self._result(apc_runtime.request(REQUEST_DETECT, payload), width, height)

    def detect(self, image, image_processing_options=None):
        """사진 한 장(IMAGE 모드)."""
        self._check_mode(VisionTaskRunningMode.IMAGE)
        return self._run(image, image_processing_options)

    def detect_for_video(self, image, timestamp_ms, image_processing_options=None):
        """영상 프레임 한 장(VIDEO 모드). timestamp_ms(밀리초 정수)는 부를 때마다 늘어나야 한다."""
        self._check_mode(VisionTaskRunningMode.VIDEO)
        self._check_image(image)
        self._check_timestamp(timestamp_ms)
        return self._run(image, image_processing_options)

    def detect_async(self, image, timestamp_ms, image_processing_options=None):
        """실시간 한 장(LIVE_STREAM 모드). 결과는 result_callback(result, image, timestamp_ms)으로 — 실습실에서는 곧바로 부른다."""
        self._check_mode(VisionTaskRunningMode.LIVE_STREAM)
        self._check_image(image)
        self._check_timestamp(timestamp_ms)
        result = self._run(image, image_processing_options)
        self._options.result_callback(result, image, timestamp_ms)

    def close(self):
        """작업을 닫는다. 닫은 뒤의 detect는 진짜처럼 빈 결과를 돌려준다."""
        self._closed = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()
        return False


class HandLandmarker(_VisionTask):
    """손 21점 인식(진짜 vision.HandLandmarker 모양). num_hands 기본은 1이다(옛 Hands()는 2였다)."""

    _SOLUTION = SOLUTION_HANDS
    _OPTIONS = HandLandmarkerOptions

    @classmethod
    def _open_payload(cls, options, complexity):
        num_hands = int(options.num_hands)
        if num_hands < 1:
            raise RuntimeError(
                "ValidatedGraphConfig Initialization failed.\n"
                "ClipNormalizedRectVectorSizeCalculator: max_vec_size should be greater than or equal to 1. (num_hands는 1 이상이어야 해요)"
            )
        return {
            "maxNumHands": num_hands,
            "minDetectionConfidence": _ratio(options.min_hand_detection_confidence),
            "minPresenceConfidence": _ratio(options.min_hand_presence_confidence),
            "minTrackingConfidence": _ratio(options.min_tracking_confidence),
        }

    def _empty(self):
        return HandLandmarkerResult([], [], [])

    def _result(self, reply, width, height):
        return _hands_result(reply)


class FaceLandmarker(_VisionTask):
    """얼굴 그물 478점(진짜 vision.FaceLandmarker 모양 — 눈동자 10점 포함)."""

    _SOLUTION = SOLUTION_FACE_MESH
    _OPTIONS = FaceLandmarkerOptions

    @classmethod
    def _open_payload(cls, options, complexity):
        num_faces = int(options.num_faces)
        if num_faces < 1:
            raise RuntimeError("ValidatedGraphConfig Initialization failed. (num_faces는 1 이상이어야 해요)")
        return {
            "maxNumFaces": num_faces,
            "refineLandmarks": True,
            "minDetectionConfidence": _ratio(options.min_face_detection_confidence),
            "minPresenceConfidence": _ratio(options.min_face_presence_confidence),
            "minTrackingConfidence": _ratio(options.min_tracking_confidence),
        }

    def _empty(self):
        return FaceLandmarkerResult([], [], [])

    def _result(self, reply, width, height):
        return _faces_result(reply, self._options)


class PoseLandmarker(_VisionTask):
    """몸 33점(진짜 vision.PoseLandmarker 모양). 모델 파일 이름으로 가벼운(lite)·보통(full) 모델을 고른다."""

    _SOLUTION = SOLUTION_POSE
    _OPTIONS = PoseLandmarkerOptions

    @classmethod
    def _open_payload(cls, options, complexity):
        num_poses = int(options.num_poses)
        if num_poses < 1:
            raise RuntimeError("ValidatedGraphConfig Initialization failed. (num_poses는 1 이상이어야 해요)")
        return {
            "modelComplexity": 0 if complexity is None else int(complexity),
            "maxNumPoses": num_poses,
            "minDetectionConfidence": _ratio(options.min_pose_detection_confidence),
            "minPresenceConfidence": _ratio(options.min_pose_presence_confidence),
            "minTrackingConfidence": _ratio(options.min_tracking_confidence),
        }

    def _empty(self):
        return PoseLandmarkerResult([], [], None)

    def _result(self, reply, width, height):
        return _pose_result(reply, self._options)


class FaceDetector(_VisionTask):
    """얼굴 상자(진짜 vision.FaceDetector 모양 — 상자는 픽셀, 점 6개는 0~1)."""

    _SOLUTION = SOLUTION_FACE_DETECTION
    _OPTIONS = FaceDetectorOptions

    @classmethod
    def _open_payload(cls, options, complexity):
        return {
            "minDetectionConfidence": _ratio(options.min_detection_confidence),
            "minSuppressionThreshold": _ratio(options.min_suppression_threshold),
            "modelSelection": 0,
        }

    def _empty(self):
        return DetectionResult([])

    def _result(self, reply, width, height):
        return _detections_result(reply, width, height)


def _unsupported(name, korean):
    """이 실습실이 아직 흉내 내지 않는 작업: 이름은 있되 만들면 한국어로 알린다."""

    message = (
        f"이 실습실은 {name}({korean})를 아직 지원하지 않아요. "
        "손·얼굴 그물·자세·얼굴 상자(HandLandmarker·FaceLandmarker·PoseLandmarker·FaceDetector)만 돼요."
    )

    class _Options:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

    class _Task:
        @classmethod
        def create_from_options(cls, options):
            raise NotImplementedError(message)

        @classmethod
        def create_from_model_path(cls, model_path):
            raise NotImplementedError(message)

    _Options.__name__ = _Options.__qualname__ = f"{name}Options"
    _Task.__name__ = _Task.__qualname__ = name
    return _Task, _Options


GestureRecognizer, GestureRecognizerOptions = _unsupported("GestureRecognizer", "손동작 인식")
HolisticLandmarker, HolisticLandmarkerOptions = _unsupported("HolisticLandmarker", "온몸 한꺼번에 인식")
ImageClassifier, ImageClassifierOptions = _unsupported("ImageClassifier", "사진 분류")
ImageEmbedder, ImageEmbedderOptions = _unsupported("ImageEmbedder", "사진 특징 뽑기")
ImageSegmenter, ImageSegmenterOptions = _unsupported("ImageSegmenter", "사진 영역 나누기")
InteractiveSegmenter, InteractiveSegmenterOptions = _unsupported("InteractiveSegmenter", "눌러서 영역 나누기")
ObjectDetector, ObjectDetectorOptions = _unsupported("ObjectDetector", "물체 찾기")


# ── drawing_utils(mediapipe 1.1.1 vision/drawing_utils.py를 옮김, Apache-2.0 고지는 머리말) ──

_PRESENCE_THRESHOLD = 0.5
_VISIBILITY_THRESHOLD = 0.5
_BGR_CHANNELS = 3

WHITE_COLOR = (224, 224, 224)
BLACK_COLOR = (0, 0, 0)
RED_COLOR = (0, 0, 255)
GREEN_COLOR = (0, 128, 0)
BLUE_COLOR = (255, 0, 0)


@dataclasses.dataclass
class DrawingSpec:
    """점·선 스타일: color는 BGR, thickness는 픽셀(-1이면 채움), circle_radius는 픽셀."""

    color: tuple = WHITE_COLOR
    thickness: int = 2
    circle_radius: int = 2


def _normalized_to_pixel_coordinates(normalized_x, normalized_y, image_width, image_height):
    """0~1 좌표 → 픽셀. 범위 밖이면 None(진짜와 같음 — 그 점과 그 점에 닿은 선은 그리지 않는다)."""

    def is_valid_normalized_value(value):
        return (value > 0 or math.isclose(0, value)) and (value < 1 or math.isclose(1, value))

    if not (is_valid_normalized_value(normalized_x) and is_valid_normalized_value(normalized_y)):
        return None
    x_px = min(math.floor(normalized_x * image_width), image_width - 1)
    y_px = min(math.floor(normalized_y * image_height), image_height - 1)
    return x_px, y_px


def _cv2():
    try:
        import cv2
    except ImportError:
        raise ImportError("그리기에는 OpenCV(cv2)가 필요해요. 코드 위쪽에 import cv2를 두면 실습실이 OpenCV를 함께 받아요.") from None
    return cv2


def draw_detection(image, detection, keypoint_drawing_spec=DrawingSpec(color=RED_COLOR), bbox_drawing_spec=DrawingSpec()):
    """얼굴 상자의 점 6개를 찍고 상자를 그린다(BGR 3채널 numpy 프레임)."""
    if image.shape[2] != _BGR_CHANNELS:
        raise ValueError("Input image must contain three channel bgr data.")
    cv2 = _cv2()
    image_rows, image_cols, _ = image.shape
    if detection.keypoints:
        for keypoint in detection.keypoints:
            keypoint_px = _normalized_to_pixel_coordinates(keypoint.x, keypoint.y, image_cols, image_rows)
            cv2.circle(image, keypoint_px, keypoint_drawing_spec.circle_radius, keypoint_drawing_spec.color, keypoint_drawing_spec.thickness)
    rect_start_point = (detection.bounding_box.origin_x, detection.bounding_box.origin_y)
    rect_end_point = (
        detection.bounding_box.origin_x + detection.bounding_box.width,
        detection.bounding_box.origin_y + detection.bounding_box.height,
    )
    cv2.rectangle(image, rect_start_point, rect_end_point, bbox_drawing_spec.color, bbox_drawing_spec.thickness)


def draw_landmarks(
    image,
    landmark_list,
    connections=None,
    landmark_drawing_spec=DrawingSpec(color=RED_COLOR),
    connection_drawing_spec=DrawingSpec(),
    is_drawing_landmarks=True,
):
    """점 목록(손 하나·얼굴 하나·사람 하나)을 BGR 프레임에 그린다: 연결선을 먼저, 점(흰 테두리 원 + 채운 원)을 나중에.
    landmark_drawing_spec이 None이면 점을 그리지 않는다. visibility·presence가 있고 0.5 미만인 점은 건너뛴다(자세에만 해당)."""
    if not landmark_list:
        return
    if image.shape[2] != _BGR_CHANNELS:
        raise ValueError("Input image must contain three channel bgr data.")
    cv2 = _cv2()
    image_rows, image_cols, _ = image.shape
    idx_to_coordinates = {}
    for idx, landmark in enumerate(landmark_list):
        if (landmark.visibility is not None and landmark.visibility < _VISIBILITY_THRESHOLD) or (
            landmark.presence is not None and landmark.presence < _PRESENCE_THRESHOLD
        ):
            continue
        landmark_px = _normalized_to_pixel_coordinates(landmark.x, landmark.y, image_cols, image_rows)
        if landmark_px:
            idx_to_coordinates[idx] = landmark_px
    if connections:
        num_landmarks = len(landmark_list)
        for connection in connections:
            start_idx = connection.start
            end_idx = connection.end
            if not (0 <= start_idx < num_landmarks and 0 <= end_idx < num_landmarks):
                raise ValueError(f"Landmark index is out of range. Invalid connection from landmark #{start_idx} to landmark #{end_idx}.")
            if start_idx in idx_to_coordinates and end_idx in idx_to_coordinates:
                drawing_spec = (
                    connection_drawing_spec[(start_idx, end_idx)]
                    if isinstance(connection_drawing_spec, collections.abc.Mapping)
                    else connection_drawing_spec
                )
                cv2.line(image, idx_to_coordinates[start_idx], idx_to_coordinates[end_idx], drawing_spec.color, drawing_spec.thickness)
    if is_drawing_landmarks and landmark_drawing_spec:
        for idx, landmark_px in idx_to_coordinates.items():
            drawing_spec = landmark_drawing_spec[idx] if isinstance(landmark_drawing_spec, collections.abc.Mapping) else landmark_drawing_spec
            circle_border_radius = max(drawing_spec.circle_radius + 1, int(drawing_spec.circle_radius * 1.2))
            cv2.circle(image, landmark_px, circle_border_radius, WHITE_COLOR, drawing_spec.thickness)
            cv2.circle(image, landmark_px, drawing_spec.circle_radius, drawing_spec.color, drawing_spec.thickness)


def draw_axis(*args, **kwargs):
    raise NotImplementedError("draw_axis(3차원 축 그리기)는 이 실습실에서 지원하지 않아요. cv2.line으로 직접 그려 보세요.")


def plot_landmarks(*args, **kwargs):
    raise NotImplementedError("plot_landmarks(matplotlib 3D 그림)은 브라우저 실습실에서 지원하지 않아요. cv2.imshow로 프레임에 그려 보세요.")


# ── drawing_styles(mediapipe 1.1.1 vision/drawing_styles.py를 옮김, Apache-2.0 고지는 머리말) ──

_RADIUS = 5
_RED = (48, 48, 255)
_GREEN = (48, 255, 48)
_BLUE = (192, 101, 21)
_YELLOW = (0, 204, 255)
_GRAY = (128, 128, 128)
_PURPLE = (128, 64, 128)
_PEACH = (180, 229, 255)
_WHITE = (224, 224, 224)
_CYAN = (192, 255, 48)
_MAGENTA = (192, 48, 255)

_THICKNESS_WRIST_MCP = 3
_THICKNESS_FINGER = 2
_THICKNESS_DOT = -1

_HAND_LANDMARK_STYLE = {
    (HandLandmark.WRIST, HandLandmark.THUMB_CMC, HandLandmark.INDEX_FINGER_MCP, HandLandmark.MIDDLE_FINGER_MCP, HandLandmark.RING_FINGER_MCP, HandLandmark.PINKY_MCP): DrawingSpec(
        color=_RED, thickness=_THICKNESS_DOT, circle_radius=_RADIUS
    ),
    (HandLandmark.THUMB_MCP, HandLandmark.THUMB_IP, HandLandmark.THUMB_TIP): DrawingSpec(color=_PEACH, thickness=_THICKNESS_DOT, circle_radius=_RADIUS),
    (HandLandmark.INDEX_FINGER_PIP, HandLandmark.INDEX_FINGER_DIP, HandLandmark.INDEX_FINGER_TIP): DrawingSpec(
        color=_PURPLE, thickness=_THICKNESS_DOT, circle_radius=_RADIUS
    ),
    (HandLandmark.MIDDLE_FINGER_PIP, HandLandmark.MIDDLE_FINGER_DIP, HandLandmark.MIDDLE_FINGER_TIP): DrawingSpec(
        color=_YELLOW, thickness=_THICKNESS_DOT, circle_radius=_RADIUS
    ),
    (HandLandmark.RING_FINGER_PIP, HandLandmark.RING_FINGER_DIP, HandLandmark.RING_FINGER_TIP): DrawingSpec(
        color=_GREEN, thickness=_THICKNESS_DOT, circle_radius=_RADIUS
    ),
    (HandLandmark.PINKY_PIP, HandLandmark.PINKY_DIP, HandLandmark.PINKY_TIP): DrawingSpec(color=_BLUE, thickness=_THICKNESS_DOT, circle_radius=_RADIUS),
}

_HAND_CONNECTION_STYLE = [
    (HandLandmarksConnections.HAND_PALM_CONNECTIONS, DrawingSpec(color=_GRAY, thickness=_THICKNESS_WRIST_MCP)),
    (HandLandmarksConnections.HAND_THUMB_CONNECTIONS, DrawingSpec(color=_PEACH, thickness=_THICKNESS_FINGER)),
    (HandLandmarksConnections.HAND_INDEX_FINGER_CONNECTIONS, DrawingSpec(color=_PURPLE, thickness=_THICKNESS_FINGER)),
    (HandLandmarksConnections.HAND_MIDDLE_FINGER_CONNECTIONS, DrawingSpec(color=_YELLOW, thickness=_THICKNESS_FINGER)),
    (HandLandmarksConnections.HAND_RING_FINGER_CONNECTIONS, DrawingSpec(color=_GREEN, thickness=_THICKNESS_FINGER)),
    (HandLandmarksConnections.HAND_PINKY_FINGER_CONNECTIONS, DrawingSpec(color=_BLUE, thickness=_THICKNESS_FINGER)),
]

_THICKNESS_TESSELATION = 1
_THICKNESS_CONTOURS = 2
_FACE_LANDMARKER_CONTOURS_CONNECTION_STYLE = [
    (FaceLandmarksConnections.FACE_LANDMARKS_LIPS, DrawingSpec(color=_WHITE, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_LEFT_EYE, DrawingSpec(color=_GREEN, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_LEFT_EYEBROW, DrawingSpec(color=_GREEN, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_RIGHT_EYE, DrawingSpec(color=_RED, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_RIGHT_EYEBROW, DrawingSpec(color=_RED, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_FACE_OVAL, DrawingSpec(color=_WHITE, thickness=_THICKNESS_CONTOURS)),
]
_FACE_LANDMARKER_CONTOURS_CONNECTION_STYLE_1 = [
    (FaceLandmarksConnections.FACE_LANDMARKS_LIPS, DrawingSpec(color=_BLUE, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_LEFT_EYE, DrawingSpec(color=_CYAN, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_LEFT_EYEBROW, DrawingSpec(color=_GREEN, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_RIGHT_EYE, DrawingSpec(color=_MAGENTA, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_RIGHT_EYEBROW, DrawingSpec(color=_RED, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_FACE_OVAL, DrawingSpec(color=_WHITE, thickness=_THICKNESS_CONTOURS)),
    (FaceLandmarksConnections.FACE_LANDMARKS_NOSE, DrawingSpec(color=_YELLOW, thickness=_THICKNESS_CONTOURS)),
]

_THICKNESS_POSE_LANDMARKS = 2
_POSE_LANDMARKS_LEFT = frozenset(
    [
        PoseLandmark.LEFT_EYE_INNER,
        PoseLandmark.LEFT_EYE,
        PoseLandmark.LEFT_EYE_OUTER,
        PoseLandmark.LEFT_EAR,
        PoseLandmark.MOUTH_LEFT,
        PoseLandmark.LEFT_SHOULDER,
        PoseLandmark.LEFT_ELBOW,
        PoseLandmark.LEFT_WRIST,
        PoseLandmark.LEFT_PINKY,
        PoseLandmark.LEFT_INDEX,
        PoseLandmark.LEFT_THUMB,
        PoseLandmark.LEFT_HIP,
        PoseLandmark.LEFT_KNEE,
        PoseLandmark.LEFT_ANKLE,
        PoseLandmark.LEFT_HEEL,
        PoseLandmark.LEFT_FOOT_INDEX,
    ]
)
_POSE_LANDMARKS_RIGHT = frozenset(
    [
        PoseLandmark.RIGHT_EYE_INNER,
        PoseLandmark.RIGHT_EYE,
        PoseLandmark.RIGHT_EYE_OUTER,
        PoseLandmark.RIGHT_EAR,
        PoseLandmark.MOUTH_RIGHT,
        PoseLandmark.RIGHT_SHOULDER,
        PoseLandmark.RIGHT_ELBOW,
        PoseLandmark.RIGHT_WRIST,
        PoseLandmark.RIGHT_PINKY,
        PoseLandmark.RIGHT_INDEX,
        PoseLandmark.RIGHT_THUMB,
        PoseLandmark.RIGHT_HIP,
        PoseLandmark.RIGHT_KNEE,
        PoseLandmark.RIGHT_ANKLE,
        PoseLandmark.RIGHT_HEEL,
        PoseLandmark.RIGHT_FOOT_INDEX,
    ]
)


def get_default_hand_landmarks_style():
    """관절 번호 → DrawingSpec(손가락마다 다른 색, 채운 점)."""
    style = {}
    for keys, spec in _HAND_LANDMARK_STYLE.items():
        for key in keys:
            style[key] = spec
    return style


def get_default_hand_connections_style():
    """(시작, 끝) 번호 쌍 → DrawingSpec(손가락마다 다른 색 선)."""
    style = {}
    for connections, spec in _HAND_CONNECTION_STYLE:
        for connection in connections:
            style[(connection.start, connection.end)] = spec
    return style


def get_default_face_mesh_contours_style(i=0):
    """윤곽선(입술·눈·눈썹·얼굴 테두리) (시작, 끝) → DrawingSpec. i=1이면 코 윤곽까지 있는 두 번째 색 묶음."""
    table = _FACE_LANDMARKER_CONTOURS_CONNECTION_STYLE_1 if i == 1 else _FACE_LANDMARKER_CONTOURS_CONNECTION_STYLE
    style = {}
    for connections, spec in table:
        for connection in connections:
            style[(connection.start, connection.end)] = spec
    return style


def get_default_face_mesh_tesselation_style():
    """그물 전체를 그릴 때의 얇은 회색 선."""
    return DrawingSpec(color=_GRAY, thickness=_THICKNESS_TESSELATION)


def get_default_face_mesh_iris_connections_style():
    """눈동자 테두리 (시작, 끝) → DrawingSpec."""
    style = {}
    left_spec = DrawingSpec(color=_GREEN, thickness=_THICKNESS_CONTOURS)
    for connection in FaceLandmarksConnections.FACE_LANDMARKS_LEFT_IRIS:
        style[(connection.start, connection.end)] = left_spec
    right_spec = DrawingSpec(color=_RED, thickness=_THICKNESS_CONTOURS)
    for connection in FaceLandmarksConnections.FACE_LANDMARKS_RIGHT_IRIS:
        style[(connection.start, connection.end)] = right_spec
    return style


def get_default_pose_landmarks_style():
    """자세 관절 번호 → DrawingSpec(사람의 왼쪽·오른쪽을 다른 색으로)."""
    style = {}
    left_spec = DrawingSpec(color=(0, 138, 255), thickness=_THICKNESS_POSE_LANDMARKS)
    right_spec = DrawingSpec(color=(231, 217, 0), thickness=_THICKNESS_POSE_LANDMARKS)
    for landmark in _POSE_LANDMARKS_LEFT:
        style[landmark] = left_spec
    for landmark in _POSE_LANDMARKS_RIGHT:
        style[landmark] = right_spec
    style[PoseLandmark.NOSE] = DrawingSpec(color=_WHITE, thickness=_THICKNESS_POSE_LANDMARKS)
    return style


# ── 이름 공간(모듈 객체로 만들어 import 문·repr이 진짜처럼 보이게) ──


def _module(name, doc, **attributes):
    module = types.ModuleType(name, doc)
    for key, value in attributes.items():
        setattr(module, key, value)
    module.__all__ = sorted(key for key in attributes if not key.startswith("_"))
    return module


drawing_utils = _module(
    "mediapipe.tasks.python.vision.drawing_utils",
    "MediaPipe 그리기 도우미(사이트가 대신하는 모듈 — mediapipe 1.1.1 소스를 옮겨 진짜 cv2로 그린다).",
    DrawingSpec=DrawingSpec,
    WHITE_COLOR=WHITE_COLOR,
    BLACK_COLOR=BLACK_COLOR,
    RED_COLOR=RED_COLOR,
    GREEN_COLOR=GREEN_COLOR,
    BLUE_COLOR=BLUE_COLOR,
    draw_landmarks=draw_landmarks,
    draw_detection=draw_detection,
    draw_axis=draw_axis,
    plot_landmarks=plot_landmarks,
    _normalized_to_pixel_coordinates=_normalized_to_pixel_coordinates,
)

drawing_styles = _module(
    "mediapipe.tasks.python.vision.drawing_styles",
    "MediaPipe 기본 스타일(사이트가 대신하는 모듈).",
    get_default_hand_landmarks_style=get_default_hand_landmarks_style,
    get_default_hand_connections_style=get_default_hand_connections_style,
    get_default_face_mesh_contours_style=get_default_face_mesh_contours_style,
    get_default_face_mesh_tesselation_style=get_default_face_mesh_tesselation_style,
    get_default_face_mesh_iris_connections_style=get_default_face_mesh_iris_connections_style,
    get_default_pose_landmarks_style=get_default_pose_landmarks_style,
)

_hand_landmarker = _module(
    "mediapipe.tasks.python.vision.hand_landmarker",
    "손 인식(사이트가 대신하는 모듈).",
    HandLandmark=HandLandmark,
    HandLandmarker=HandLandmarker,
    HandLandmarkerOptions=HandLandmarkerOptions,
    HandLandmarkerResult=HandLandmarkerResult,
    HandLandmarksConnections=HandLandmarksConnections,
)
_face_landmarker = _module(
    "mediapipe.tasks.python.vision.face_landmarker",
    "얼굴 그물(사이트가 대신하는 모듈).",
    FaceLandmarker=FaceLandmarker,
    FaceLandmarkerOptions=FaceLandmarkerOptions,
    FaceLandmarkerResult=FaceLandmarkerResult,
    FaceLandmarksConnections=FaceLandmarksConnections,
)
_pose_landmarker = _module(
    "mediapipe.tasks.python.vision.pose_landmarker",
    "자세 인식(사이트가 대신하는 모듈).",
    PoseLandmark=PoseLandmark,
    PoseLandmarker=PoseLandmarker,
    PoseLandmarkerOptions=PoseLandmarkerOptions,
    PoseLandmarkerResult=PoseLandmarkerResult,
    PoseLandmarksConnections=PoseLandmarksConnections,
)
_face_detector = _module(
    "mediapipe.tasks.python.vision.face_detector",
    "얼굴 상자(사이트가 대신하는 모듈).",
    FaceDetector=FaceDetector,
    FaceDetectorOptions=FaceDetectorOptions,
    FaceDetectorResult=FaceDetectorResult,
)
_running_mode = _module(
    "mediapipe.tasks.python.vision.core.vision_task_running_mode",
    "실행 모드(사이트가 대신하는 모듈).",
    VisionTaskRunningMode=VisionTaskRunningMode,
)
_image_module = _module("mediapipe.tasks.python.vision.core.image", "사진 그릇(사이트가 대신하는 모듈).", Image=Image, ImageFormat=ImageFormat)
_image_processing = _module(
    "mediapipe.tasks.python.vision.core.image_processing_options",
    "사진 처리 설정(사이트가 대신하는 모듈).",
    ImageProcessingOptions=ImageProcessingOptions,
)
_vision_core = _module(
    "mediapipe.tasks.python.vision.core",
    "비전 작업 공통(사이트가 대신하는 모듈).",
    image=_image_module,
    vision_task_running_mode=_running_mode,
    image_processing_options=_image_processing,
)

vision = _module(
    "mediapipe.tasks.python.vision",
    "MediaPipe 비전 작업(사이트가 대신하는 모듈 — 추론은 브라우저의 MediaPipe Tasks Vision).",
    FaceDetector=FaceDetector,
    FaceDetectorOptions=FaceDetectorOptions,
    FaceDetectorResult=FaceDetectorResult,
    FaceLandmarker=FaceLandmarker,
    FaceLandmarkerOptions=FaceLandmarkerOptions,
    FaceLandmarkerResult=FaceLandmarkerResult,
    FaceLandmarksConnections=FaceLandmarksConnections,
    GestureRecognizer=GestureRecognizer,
    GestureRecognizerOptions=GestureRecognizerOptions,
    HandLandmarker=HandLandmarker,
    HandLandmarkerOptions=HandLandmarkerOptions,
    HandLandmarkerResult=HandLandmarkerResult,
    HandLandmarksConnections=HandLandmarksConnections,
    HolisticLandmarker=HolisticLandmarker,
    HolisticLandmarkerOptions=HolisticLandmarkerOptions,
    ImageClassifier=ImageClassifier,
    ImageClassifierOptions=ImageClassifierOptions,
    ImageEmbedder=ImageEmbedder,
    ImageEmbedderOptions=ImageEmbedderOptions,
    ImageProcessingOptions=ImageProcessingOptions,
    ImageSegmenter=ImageSegmenter,
    ImageSegmenterOptions=ImageSegmenterOptions,
    InteractiveSegmenter=InteractiveSegmenter,
    InteractiveSegmenterOptions=InteractiveSegmenterOptions,
    ObjectDetector=ObjectDetector,
    ObjectDetectorOptions=ObjectDetectorOptions,
    PoseLandmark=PoseLandmark,
    PoseLandmarker=PoseLandmarker,
    PoseLandmarkerOptions=PoseLandmarkerOptions,
    PoseLandmarkerResult=PoseLandmarkerResult,
    PoseLandmarksConnections=PoseLandmarksConnections,
    RunningMode=RunningMode,
    drawing_styles=drawing_styles,
    drawing_utils=drawing_utils,
    core=_vision_core,
    hand_landmarker=_hand_landmarker,
    face_landmarker=_face_landmarker,
    pose_landmarker=_pose_landmarker,
    face_detector=_face_detector,
)

_landmark_module = _module("mediapipe.tasks.python.components.containers.landmark", "점(사이트가 대신하는 모듈).", Landmark=Landmark, NormalizedLandmark=NormalizedLandmark)
_category_module = _module("mediapipe.tasks.python.components.containers.category", "분류(사이트가 대신하는 모듈).", Category=Category)
_detections_module = _module(
    "mediapipe.tasks.python.components.containers.detections",
    "검출 결과(사이트가 대신하는 모듈).",
    Detection=Detection,
    DetectionResult=DetectionResult,
)
_bounding_box_module = _module("mediapipe.tasks.python.components.containers.bounding_box", "상자(사이트가 대신하는 모듈).", BoundingBox=BoundingBox)
_keypoint_module = _module("mediapipe.tasks.python.components.containers.keypoint", "점(사이트가 대신하는 모듈).", NormalizedKeypoint=NormalizedKeypoint)
_containers = _module(
    "mediapipe.tasks.python.components.containers",
    "결과 그릇(사이트가 대신하는 모듈).",
    BoundingBox=BoundingBox,
    Category=Category,
    Detection=Detection,
    DetectionResult=DetectionResult,
    Landmark=Landmark,
    NormalizedLandmark=NormalizedLandmark,
    landmark=_landmark_module,
    category=_category_module,
    detections=_detections_module,
    bounding_box=_bounding_box_module,
    keypoint=_keypoint_module,
)
_components = _module("mediapipe.tasks.python.components", "구성 요소(사이트가 대신하는 모듈).", containers=_containers)
_base_options_module = _module("mediapipe.tasks.python.core.base_options", "모델 설정(사이트가 대신하는 모듈).", BaseOptions=BaseOptions)
_core = _module("mediapipe.tasks.python.core", "작업 공통(사이트가 대신하는 모듈).", base_options=_base_options_module)

# mp.tasks는 진짜처럼 mediapipe.tasks.python 모듈 자체다(`from mediapipe.tasks import python`도 같은 모듈을 준다).
tasks = _module(
    "mediapipe.tasks.python",
    "MediaPipe Tasks(사이트가 대신하는 모듈): BaseOptions·vision·components.",
    BaseOptions=BaseOptions,
    vision=vision,
    components=_components,
    core=_core,
)
tasks.python = tasks

# mediapipe.py가 sys.modules에 등록해 `from mediapipe.tasks.python import vision`·`import mediapipe.tasks.python.vision.drawing_utils`가 되게 한다.
SUBMODULES = {
    "mediapipe.tasks": tasks,
    "mediapipe.tasks.python": tasks,
    "mediapipe.tasks.python.vision": vision,
    "mediapipe.tasks.python.vision.drawing_utils": drawing_utils,
    "mediapipe.tasks.python.vision.drawing_styles": drawing_styles,
    "mediapipe.tasks.python.vision.hand_landmarker": _hand_landmarker,
    "mediapipe.tasks.python.vision.face_landmarker": _face_landmarker,
    "mediapipe.tasks.python.vision.pose_landmarker": _pose_landmarker,
    "mediapipe.tasks.python.vision.face_detector": _face_detector,
    "mediapipe.tasks.python.vision.core": _vision_core,
    "mediapipe.tasks.python.vision.core.image": _image_module,
    "mediapipe.tasks.python.vision.core.vision_task_running_mode": _running_mode,
    "mediapipe.tasks.python.vision.core.image_processing_options": _image_processing,
    "mediapipe.tasks.python.components": _components,
    "mediapipe.tasks.python.components.containers": _containers,
    "mediapipe.tasks.python.components.containers.landmark": _landmark_module,
    "mediapipe.tasks.python.components.containers.category": _category_module,
    "mediapipe.tasks.python.components.containers.detections": _detections_module,
    "mediapipe.tasks.python.components.containers.bounding_box": _bounding_box_module,
    "mediapipe.tasks.python.components.containers.keypoint": _keypoint_module,
    "mediapipe.tasks.python.core": _core,
    "mediapipe.tasks.python.core.base_options": _base_options_module,
}


def legacy_solutions_error():
    """mediapipe.py의 __getattr__('solutions')이 부른다: 안내 한 번 + 진짜와 같은 AttributeError."""
    _notice_once("legacy-solutions", LEGACY_SOLUTIONS_NOTICE, "warn")
    return AttributeError(LEGACY_SOLUTIONS_MESSAGE)


def _reset():
    """실행이 시작될 때(동기 진입점 — 양보 금지) 안내 기록과 객체 번호를 비운다(쪽마다 한 번인 모델 안내는 남긴다)."""
    _state["next_id"] = 1
    _state["noticed"].clear()


def install():
    """워커가 실행 직전에 부른다(apc_shims.install_available — /apc/mediapipe.py가 있어 '받아 둔 패키지'로 잡힌다). 덮어쓸 진짜 패키지는 없고
    실행마다 초기화 함수를 등록해 두는 일만 한다(멱등)."""
    if _state["installed"]:
        return
    apc_runtime.register_reset_hook(_reset)
    _state["installed"] = True
