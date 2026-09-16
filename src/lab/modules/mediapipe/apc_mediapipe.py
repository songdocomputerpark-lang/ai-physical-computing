"""mediapipe 흉내 모듈의 파이썬 쪽(PLAN §8.2 P2-08 손 / P2-09 얼굴·자세, CODE_MAPPING §3.2 MPH·MPF·MPD·MPP·DRAW) — 레거시 `mp.solutions` API 모양.

학생 코드는 PC에서 쓰던 그대로 쓴다(같은 폴더의 mediapipe.py가 이 모듈을 `mediapipe`라는 이름으로 내보낸다):

    import mediapipe as mp
    hands = mp.solutions.hands.Hands()                 # 기본값: 손 2개(레거시와 같음), 신뢰도 0.5·0.5
    result = hands.process(rgb)                        # RGB numpy 배열(높이×너비×3, uint8) → 대기 지점(화면이 추론)
    if result.multi_hand_landmarks:                    # 손이 없으면 None(빈 리스트가 아님 — 레거시와 같음)
        for hand in result.multi_hand_landmarks:
            hand.landmark[8].x                         # 0~1 좌표, .y .z
            mp.solutions.drawing_utils.draw_landmarks(img, hand, mp.solutions.hands.HAND_CONNECTIONS)
    result.multi_handedness[0].classification[0].label # 'Left' / 'Right'
    mp.solutions.hands.HandLandmark.INDEX_FINGER_TIP   # == 8 (IntEnum)

얼굴·자세도 같은 모양이다(P2-09):

    face_mesh = mp.solutions.face_mesh.FaceMesh(max_num_faces=1)     # 점 468개(refine_landmarks=True면 눈동자까지 478개)
    result = face_mesh.process(rgb)
    result.multi_face_landmarks[0].landmark[1].x                     # 1번 = 코끝 부근
    mp.solutions.face_mesh.FACEMESH_TESSELATION                      # 그물 연결표(2,556쌍)

    pose = mp.solutions.pose.Pose()                                  # 한 사람만
    result = pose.process(rgb)
    result.pose_landmarks.landmark[mp.solutions.pose.PoseLandmark.LEFT_WRIST].y
    mp.solutions.pose.POSE_CONNECTIONS                               # 뼈대 연결표(35쌍)

    detector = mp.solutions.face_detection.FaceDetection(min_detection_confidence=0.5)
    result = detector.process(rgb)                                   # 얼굴이 없으면 result.detections is None
    box = result.detections[0].location_data.relative_bounding_box   # xmin·ymin·width·height (0~1)

동작
- Hands(...)는 화면에 'mediapipe.open'을 부탁해 엔진을 준비시킨다(대기 지점 — 카메라가 없으면 화면이 재생 입력으로 바꾼다).
- process(image)는 배열을 RGBA로 바꿔 'mediapipe.detect'로 보내고 답(손 목록)을 기다린다(대기 지점: [정지]·조절 값이 여기서 들어온다).
  추론은 파이썬이 넘긴 배열로 한다 — 대부분 예제가 flip 뒤 process()를 부르므로 좌표가 화면과 맞는다(CODE_MAPPING §3.1).
  f026처럼 BGR을 그대로 넘기면 PC와 똑같이 색이 바뀐 채 인식된다(원본 동작 재현).
- 결과는 레거시와 같은 모양: SolutionOutputs(multi_hand_landmarks, multi_hand_world_landmarks, multi_handedness) — 각 필드는 손이 없으면 None.
  NormalizedLandmark(.x .y .z), NormalizedLandmarkList(.landmark 리스트), Classification(.index .score .label), print()는 protobuf 글자 형식.
- drawing_utils.draw_landmarks(image, landmark_list, connections=None, landmark_drawing_spec=DrawingSpec(color=RED), connection_drawing_spec=DrawingSpec(),
  is_drawing_landmarks=True)는 레거시 소스(mediapipe/python/solutions/drawing_utils.py v0.10.x)를 그대로 옮겨 진짜 cv2로 numpy 프레임에 그린다.
  위치 인자 순서(4번째 점 스타일, 5번째 선 스타일)를 지켜 교안 계단 4(f131)의 "순서를 바꾸면 스타일이 뒤바뀐다"가 재현된다.
- 제한 모드(JSPI 없음): 기다릴 수 없어 process()는 손 없음(None)을 돌려주고 한 번 안내한다.

PC의 mediapipe(레거시 0.10.x)와 다른 점(화면 쪽 hands-engine.ts 머리말과 같은 내용):
- 추론 엔진이 MediaPipe Tasks Vision 0.10.35(브라우저) — 모델이 달라 같은 신뢰도에서 결과가 조금 다를 수 있다(임계값은 조절 패널·@slider로).
- Tasks의 numHands 기본은 1이지만 이 모듈은 레거시 기본 max_num_hands=2를 지킨다. model_complexity는 무시한다(Tasks 손 모델은 한 종류).
- FaceMesh: Tasks는 늘 478점(눈동자 포함)을 주므로 refine_landmarks=False(기본)면 **앞 468개만** 돌려준다(레거시와 같은 개수·같은 IndexError).
- Pose: Tasks는 여러 사람을 주지만 레거시처럼 **첫 사람만** pose_landmarks(단수)로 준다. model_complexity 0은 lite, 1·2는 full 모델을 쓰고
  2(heavy)는 콘솔로 한 번 알린다(PD-20 — heavy 30MB는 사이트에 두지 않는다). 조절 패널의 '저사양 모드'를 켜면 늘 lite를 쓴다.
- FaceDetection: Tasks 상자는 픽셀이라 화면 쪽이 0~1로 바꿔 준다(레거시와 같은 relative_bounding_box). 키포인트 6개도 0~1이다.
- 좌표계는 같다(x·y 0~1, z 손목 기준 깊이). Left/Right도 같은 규칙("거울처럼 뒤집힌 셀카 영상" 가정)이다 — 실제 카메라 대조는 운영자 확인.
- multi_hand_world_landmarks는 Tasks 결과가 있을 때만 값이 있고 재생 입력(합성 좌표)에서는 None이다.
- process()에 3채널이 아닌 배열을 넣으면 레거시의 IndexError 대신 한국어 설명이 붙은 ValueError가 난다(오류 사전 P2-06과 연결).

규칙(src/lab/README.md 4.4): apc_runtime의 request·notice·can_wait·register_reset_hook만 쓴다. install()·초기화 함수(_reset)는 동기 진입점에서
불리므로 양보하는 함수를 부르지 않는다(PROGRESS 미해결 25번). cv2는 draw_landmarks·RGBA 변환에서만 늦게 import한다.

출처 고지: HAND_CONNECTIONS·FACEMESH_*·POSE_CONNECTIONS 연결표(FACEMESH_*·POSE_CONNECTIONS는 생성 파일 apc_mp_tables.py),
HandLandmark 21점·PoseLandmark 33점 번호, DrawingSpec 기본값(색·두께·반지름), drawing_styles의 스타일 표,
draw_landmarks·draw_detection 그리기 규칙은 google-ai-edge/mediapipe의 파이썬 코드(Copyright 2020 The MediaPipe Authors, Apache License 2.0)에서 옮겼다.
라이선스 전문은 public/licenses/mediapipe-tasks-vision.txt, 출처 항목은 sources.yaml "MediaPipe Tasks Vision". 이 파일 자체는 사이트 소프트웨어(MIT, PD-26)이며
옮긴 부분은 위 표시로 구분한다(Apache-2.0 4조 변경 표시).
"""

import collections
import dataclasses
import enum
import math
import struct
import types

import apc_mp_tables
import apc_runtime

try:  # numpy는 실습실이 미리 받아 두지만, install()은 패키지를 받기 전에도 불릴 수 있다(동기 진입점).
    import numpy as np
except ImportError:  # pragma: no cover - 실습실에서는 opencv-python과 함께 늘 있다.
    np = None

__all__ = [
    "Classification",
    "ClassificationList",
    "Detection",
    "FaceDetection",
    "FaceKeyPoint",
    "FaceMesh",
    "HAND_CONNECTIONS",
    "HandLandmark",
    "Hands",
    "Landmark",
    "LandmarkList",
    "NormalizedLandmark",
    "NormalizedLandmarkList",
    "Pose",
    "PoseLandmark",
    "SUBMODULES",
    "SolutionOutputs",
    "VERSION",
    "drawing_styles",
    "drawing_utils",
    "face_detection",
    "face_mesh",
    "hands",
    "get_key_point",
    "install",
    "pose",
    "solutions",
]

# 학생이 mp.__version__으로 볼 값(Tasks 판을 적어 어떤 엔진인지 알 수 있게)
VERSION = "0.10.35-apc"

REQUEST_OPEN = "mediapipe.open"
REQUEST_DETECT = "mediapipe.detect"
SOLUTION_HANDS = "hands"
SOLUTION_FACE_MESH = "face_mesh"
SOLUTION_FACE_DETECTION = "face_detection"
SOLUTION_POSE = "pose"

LIMITED_MESSAGE = (
    "이 브라우저에는 JSPI(파이썬 기다리기 기능)가 없어서 인식 결과를 기다릴 수 없어요. "
    "process()는 아무것도 찾지 못한 것(None)으로 답해요. 컴퓨터의 Chrome이나 Edge 최신판에서 열어 주세요."
)
CLOSED_MESSAGE = "_graph is None in SolutionBase (이미 close()한 객체예요. 새로 만들어 주세요.)"
NOT_RGB_MESSAGE = (
    "Input image must contain three channel rgb data. "
    "(process()에는 높이×너비×3 모양의 RGB 배열을 넣어요 — 예: rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))"
)
NO_NUMPY_MESSAGE = (
    "손 인식에는 numpy가 필요한데 아직 받지 못했어요. 코드 위쪽에 import cv2를 두면 실습실이 OpenCV·numpy를 함께 받아요."
)


def _require_numpy():
    """numpy를 실제로 쓰는 자리에서만 확인한다(install()은 numpy 없이도 되게 — 동기 진입점 규칙)."""
    if np is None:
        raise RuntimeError(NO_NUMPY_MESSAGE)
    return np

_state = {"next_id": 1, "noticed": set(), "installed": False}


def _notice_once(key, text, level="warn"):
    if key in _state["noticed"]:
        return
    _state["noticed"].add(key)
    apc_runtime.notice(text, level)


# ── protobuf 글자 형식 흉내 ──


def _float32(value):
    """파이썬 float → float32로 한 번 접었다 편 값(numpy 없이 struct로 — 이 파일은 numpy 없이도 import돼야 한다)."""
    return struct.unpack("<f", struct.pack("<f", float(value)))[0]


def _fmt_float32(value):
    """protobuf 텍스트 형식처럼 float32로 다시 읽어도 같은 가장 짧은 표기(0.5 → '0.5', 1.0 → '1', 0.123456789 → '0.123456791')."""
    number = float(value)
    if math.isnan(number):
        return "nan"
    if math.isinf(number):
        return "inf" if number > 0 else "-inf"
    target = _float32(number)
    if target == int(target) and abs(target) < 1e15:
        return str(int(target))
    for digits in range(6, 10):
        text = f"{target:.{digits}g}"
        if _float32(float(text)) == target:
            return text
    return f"{target:.9g}"


class NormalizedLandmark:
    """레거시 NormalizedLandmark(x·y는 0~1, z는 손목 기준 깊이). visibility·presence는 손·얼굴에는 없다(HasField가 False)."""

    __slots__ = ("x", "y", "z", "_visibility", "_presence")

    def __init__(self, x=0.0, y=0.0, z=0.0, visibility=None, presence=None):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)
        self._visibility = None if visibility is None else float(visibility)
        self._presence = None if presence is None else float(presence)

    @property
    def visibility(self):
        return 0.0 if self._visibility is None else self._visibility

    @visibility.setter
    def visibility(self, value):
        self._visibility = float(value)

    @property
    def presence(self):
        return 0.0 if self._presence is None else self._presence

    @presence.setter
    def presence(self, value):
        self._presence = float(value)

    def HasField(self, name):  # noqa: N802 — protobuf 메서드 이름
        if name == "visibility":
            return self._visibility is not None
        if name == "presence":
            return self._presence is not None
        if name in ("x", "y", "z"):
            return True
        raise ValueError(f"Protocol message NormalizedLandmark has no field {name}.")

    def _text(self):
        lines = [f"x: {_fmt_float32(self.x)}", f"y: {_fmt_float32(self.y)}", f"z: {_fmt_float32(self.z)}"]
        if self._visibility is not None:
            lines.append(f"visibility: {_fmt_float32(self._visibility)}")
        if self._presence is not None:
            lines.append(f"presence: {_fmt_float32(self._presence)}")
        return "\n".join(lines) + "\n"

    def __str__(self):
        return self._text()

    def __repr__(self):
        return self._text()


class Landmark(NormalizedLandmark):
    """레거시 Landmark(월드 좌표, 미터). 모양은 NormalizedLandmark와 같다."""

    __slots__ = ()


def _indent(text):
    return "".join(f"  {line}\n" for line in text.rstrip("\n").split("\n"))


class NormalizedLandmarkList:
    """레거시 NormalizedLandmarkList: .landmark가 파이썬 리스트(정수·IntEnum 인덱싱, 반복, len)."""

    __slots__ = ("landmark",)
    _FIELD = "landmark"

    def __init__(self, landmarks=None):
        self.landmark = list(landmarks) if landmarks is not None else []

    def _text(self):
        return "".join(f"{self._FIELD} {{\n{_indent(item._text())}}}\n" for item in self.landmark)

    def __str__(self):
        return self._text()

    def __repr__(self):
        return self._text()


class LandmarkList(NormalizedLandmarkList):
    __slots__ = ()


class Classification:
    """레거시 Classification(index·score·label)."""

    __slots__ = ("index", "score", "label")

    def __init__(self, index=0, score=0.0, label=""):
        self.index = int(index)
        self.score = float(score)
        self.label = str(label)

    def _text(self):
        return f"index: {self.index}\nscore: {_fmt_float32(self.score)}\nlabel: \"{self.label}\"\n"

    def __str__(self):
        return self._text()

    def __repr__(self):
        return self._text()


class ClassificationList:
    """레거시 ClassificationList: .classification 리스트(손 좌우는 [0]만 있다)."""

    __slots__ = ("classification",)

    def __init__(self, items=None):
        self.classification = list(items) if items is not None else []

    def _text(self):
        return "".join(f"classification {{\n{_indent(item._text())}}}\n" for item in self.classification)

    def __str__(self):
        return self._text()

    def __repr__(self):
        return self._text()


# 레거시는 solution마다 출력 스트림 이름으로 namedtuple을 만들고 이름은 모두 'SolutionOutputs'다.
SolutionOutputs = collections.namedtuple("SolutionOutputs", ["multi_hand_landmarks", "multi_hand_world_landmarks", "multi_handedness"])
_EMPTY_HANDS = SolutionOutputs(None, None, None)

FaceMeshOutputs = collections.namedtuple("SolutionOutputs", ["multi_face_landmarks"])
_EMPTY_FACES = FaceMeshOutputs(None)

PoseOutputs = collections.namedtuple("SolutionOutputs", ["pose_landmarks", "pose_world_landmarks", "segmentation_mask"])
_EMPTY_POSE = PoseOutputs(None, None, None)

FaceDetectionOutputs = collections.namedtuple("SolutionOutputs", ["detections"])
_EMPTY_DETECTIONS = FaceDetectionOutputs(None)


# ── 손 관절 번호·연결표(MediaPipe 규격, Apache-2.0 고지는 머리말) ──


class HandLandmark(enum.IntEnum):
    """21개 손 관절 번호(레거시 mediapipe.python.solutions.hands.HandLandmark와 같음)."""

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


HAND_PALM_CONNECTIONS = ((0, 1), (0, 5), (9, 13), (13, 17), (5, 9), (0, 17))
HAND_THUMB_CONNECTIONS = ((1, 2), (2, 3), (3, 4))
HAND_INDEX_FINGER_CONNECTIONS = ((5, 6), (6, 7), (7, 8))
HAND_MIDDLE_FINGER_CONNECTIONS = ((9, 10), (10, 11), (11, 12))
HAND_RING_FINGER_CONNECTIONS = ((13, 14), (14, 15), (15, 16))
HAND_PINKY_FINGER_CONNECTIONS = ((17, 18), (18, 19), (19, 20))
HAND_CONNECTIONS = frozenset().union(
    HAND_PALM_CONNECTIONS,
    HAND_THUMB_CONNECTIONS,
    HAND_INDEX_FINGER_CONNECTIONS,
    HAND_MIDDLE_FINGER_CONNECTIONS,
    HAND_RING_FINGER_CONNECTIONS,
    HAND_PINKY_FINGER_CONNECTIONS,
)


class PoseLandmark(enum.IntEnum):
    """33개 몸 관절 번호(레거시 mediapipe.python.solutions.pose.PoseLandmark와 같음). LEFT/RIGHT는 **그 사람 기준**이다."""

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


# 얼굴 그물·자세 연결표는 생성 파일에서 온다(MediaPipe 규격, Apache-2.0 — 머리말 고지).
FACEMESH_TESSELATION = apc_mp_tables.FACEMESH_TESSELATION
FACEMESH_CONTOURS = apc_mp_tables.FACEMESH_CONTOURS
FACEMESH_FACE_OVAL = apc_mp_tables.FACEMESH_FACE_OVAL
FACEMESH_LIPS = apc_mp_tables.FACEMESH_LIPS
FACEMESH_LEFT_EYE = apc_mp_tables.FACEMESH_LEFT_EYE
FACEMESH_LEFT_EYEBROW = apc_mp_tables.FACEMESH_LEFT_EYEBROW
FACEMESH_LEFT_IRIS = apc_mp_tables.FACEMESH_LEFT_IRIS
FACEMESH_RIGHT_EYE = apc_mp_tables.FACEMESH_RIGHT_EYE
FACEMESH_RIGHT_EYEBROW = apc_mp_tables.FACEMESH_RIGHT_EYEBROW
FACEMESH_RIGHT_IRIS = apc_mp_tables.FACEMESH_RIGHT_IRIS
FACEMESH_IRISES = apc_mp_tables.FACEMESH_IRISES
FACEMESH_NUM_LANDMARKS = apc_mp_tables.FACEMESH_NUM_LANDMARKS
FACEMESH_NUM_LANDMARKS_WITH_IRISES = apc_mp_tables.FACEMESH_NUM_LANDMARKS_WITH_IRISES
POSE_CONNECTIONS = apc_mp_tables.POSE_CONNECTIONS


# ── 얼굴 검출 결과(레거시 protobuf 모양) ──


class RelativeBoundingBox:
    """0~1로 나타낸 얼굴 상자(레거시 location_data.relative_bounding_box)."""

    __slots__ = ("xmin", "ymin", "width", "height")

    def __init__(self, xmin=0.0, ymin=0.0, width=0.0, height=0.0):
        self.xmin = float(xmin)
        self.ymin = float(ymin)
        self.width = float(width)
        self.height = float(height)

    def _text(self):
        return "\n".join(f"{name}: {_fmt_float32(getattr(self, name))}" for name in ("xmin", "ymin", "width", "height")) + "\n"

    def __str__(self):
        return self._text()

    def __repr__(self):
        return self._text()


class RelativeKeypoint:
    """얼굴 검출이 함께 주는 점 6개(오른눈·왼눈·코끝·입 가운데·오른귀·왼귀)."""

    __slots__ = ("x", "y")

    def __init__(self, x=0.0, y=0.0):
        self.x = float(x)
        self.y = float(y)

    def _text(self):
        return f"x: {_fmt_float32(self.x)}\ny: {_fmt_float32(self.y)}\n"

    def __str__(self):
        return self._text()

    def __repr__(self):
        return self._text()


class LocationData:
    """레거시 detection.location_data. format은 늘 RELATIVE_BOUNDING_BOX(=2)."""

    RELATIVE_BOUNDING_BOX = 2

    __slots__ = ("format", "relative_bounding_box", "relative_keypoints")

    def __init__(self, relative_bounding_box=None, relative_keypoints=None):
        self.format = LocationData.RELATIVE_BOUNDING_BOX
        self.relative_bounding_box = relative_bounding_box if relative_bounding_box is not None else RelativeBoundingBox()
        self.relative_keypoints = list(relative_keypoints) if relative_keypoints is not None else []

    def HasField(self, name):  # noqa: N802 — protobuf 메서드 이름
        if name == "relative_bounding_box":
            return self.relative_bounding_box is not None
        if name == "relative_keypoints":
            return bool(self.relative_keypoints)
        raise ValueError(f"Protocol message LocationData has no field {name}.")

    def __bool__(self):
        return self.relative_bounding_box is not None

    def _text(self):
        parts = [f"format: RELATIVE_BOUNDING_BOX\nrelative_bounding_box {{\n{_indent(self.relative_bounding_box._text())}}}\n"]
        parts.extend(f"relative_keypoints {{\n{_indent(point._text())}}}\n" for point in self.relative_keypoints)
        return "".join(parts)

    def __str__(self):
        return self._text()

    def __repr__(self):
        return self._text()


class FaceKeyPoint(enum.IntEnum):
    """얼굴 검출이 함께 주는 점 6개의 번호(레거시 face_detection.FaceKeyPoint)."""

    RIGHT_EYE = 0
    LEFT_EYE = 1
    NOSE_TIP = 2
    MOUTH_CENTER = 3
    RIGHT_EAR_TRAGION = 4
    LEFT_EAR_TRAGION = 5


class Detection:
    """레거시 얼굴 검출 결과 하나: .score(리스트), .label_id(리스트), .location_data."""

    __slots__ = ("label_id", "score", "location_data")

    def __init__(self, score=0.0, location_data=None):
        self.label_id = [0]
        self.score = [float(score)]
        self.location_data = location_data if location_data is not None else LocationData()

    def _text(self):
        return f"label_id: 0\nscore: {_fmt_float32(self.score[0])}\nlocation_data {{\n{_indent(self.location_data._text())}}}\n"

    def __str__(self):
        return self._text()

    def __repr__(self):
        return self._text()


# ── 화면과 주고받기 ──


def _check_image(image):
    np = _require_numpy()
    if not isinstance(image, np.ndarray):
        raise TypeError(f"process()에는 numpy 배열(카메라 프레임)을 넣어요. 받은 것: {type(image).__name__}")
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError(NOT_RGB_MESSAGE)
    if image.dtype != np.uint8:
        raise ValueError(f"process()의 이미지는 uint8(0~255) 배열이어야 해요. 지금 dtype: {image.dtype}")
    if image.shape[0] == 0 or image.shape[1] == 0:
        raise ValueError("process()에 빈 이미지를 넣었어요(높이나 너비가 0).")


def _to_rgba_bytes(image):
    """RGB 배열(높이×너비×3) → 화면의 ImageData가 바로 읽는 RGBA 1차원 바이트."""
    np = _require_numpy()
    rgb = np.ascontiguousarray(image)
    try:
        import cv2  # 영상처리 실습실이 미리 받아 둔 OpenCV(없으면 numpy로)

        rgba = cv2.cvtColor(rgb, cv2.COLOR_RGB2RGBA)
    except ImportError:
        alpha = np.full(rgb.shape[:2] + (1,), 255, dtype=np.uint8)
        rgba = np.concatenate([rgb, alpha], axis=2)
    return np.ascontiguousarray(rgba).reshape(-1)


def _landmark_list(points, cls=NormalizedLandmark, list_cls=NormalizedLandmarkList):
    return list_cls(cls(float(p[0]), float(p[1]), float(p[2]) if len(p) > 2 else 0.0) for p in points)


def _hands_result(reply):
    """화면의 답({hands: [{landmarks, worldLandmarks, handedness}], source}) → 레거시 SolutionOutputs."""
    if not isinstance(reply, dict):
        return _EMPTY_HANDS
    hands_data = reply.get("hands") or []
    if not hands_data:
        return _EMPTY_HANDS
    landmarks = []
    world = []
    handedness = []
    for item in hands_data:
        if not isinstance(item, dict):
            continue
        landmarks.append(_landmark_list(item.get("landmarks") or []))
        item_world = item.get("worldLandmarks")
        world.append(_landmark_list(item_world, Landmark, LandmarkList) if item_world else None)
        category = item.get("handedness") or {}
        handedness.append(
            ClassificationList([Classification(category.get("index", 0), category.get("score", 0.0), category.get("label", ""))])
            if category
            else ClassificationList()
        )
    if not landmarks:
        return _EMPTY_HANDS
    return SolutionOutputs(landmarks, None if any(w is None for w in world) else world, handedness)


def get_key_point(detection, key_point_enum):
    """레거시 face_detection.get_key_point: 얼굴 검출이 준 점 하나의 (x, y)를 돌려준다(없으면 None)."""
    if detection is None or not detection.location_data:
        return None
    keypoints = detection.location_data.relative_keypoints
    index = int(key_point_enum)
    if index < 0 or index >= len(keypoints):
        return None
    point = keypoints[index]
    return (point.x, point.y)


def _faces_result(reply, refine_landmarks):
    """화면의 답({faces: [[x, y, z], …]}) → 레거시 FaceMeshOutputs. refine_landmarks=False면 앞 468점만(레거시와 같은 개수)."""
    if not isinstance(reply, dict):
        return _EMPTY_FACES
    faces_data = reply.get("faces") or []
    if not faces_data:
        return _EMPTY_FACES
    limit = FACEMESH_NUM_LANDMARKS_WITH_IRISES if refine_landmarks else FACEMESH_NUM_LANDMARKS
    faces = []
    for points in faces_data:
        if not points:
            continue
        faces.append(_landmark_list(list(points)[:limit]))
    return FaceMeshOutputs(faces) if faces else _EMPTY_FACES


def _pose_result(reply):
    """화면의 답({poses: [[x, y, z, visibility], …]}) → 레거시 PoseOutputs(첫 사람만, 단수)."""
    if not isinstance(reply, dict):
        return _EMPTY_POSE
    poses_data = reply.get("poses") or []
    if not poses_data or not poses_data[0]:
        return _EMPTY_POSE
    points = poses_data[0]
    landmarks = NormalizedLandmarkList(
        NormalizedLandmark(point[0], point[1], point[2] if len(point) > 2 else 0.0, visibility=point[3] if len(point) > 3 else 1.0) for point in points
    )
    world_data = reply.get("poseWorlds") or []
    world = None
    if world_data and world_data[0]:
        world = LandmarkList(
            Landmark(point[0], point[1], point[2] if len(point) > 2 else 0.0, visibility=point[3] if len(point) > 3 else 1.0) for point in world_data[0]
        )
    return PoseOutputs(landmarks, world, None)


def _detections_result(reply):
    """화면의 답({detections: [{score, box{xmin,…}, keypoints}]}) → 레거시 FaceDetectionOutputs."""
    if not isinstance(reply, dict):
        return _EMPTY_DETECTIONS
    items = reply.get("detections") or []
    if not items:
        return _EMPTY_DETECTIONS
    detections = []
    for item in items:
        if not isinstance(item, dict):
            continue
        box = item.get("box") or {}
        keypoints = [RelativeKeypoint(point[0], point[1]) for point in (item.get("keypoints") or [])]
        location = LocationData(
            RelativeBoundingBox(box.get("xmin", 0.0), box.get("ymin", 0.0), box.get("width", 0.0), box.get("height", 0.0)),
            keypoints,
        )
        detections.append(Detection(item.get("score", 0.0), location))
    return FaceDetectionOutputs(detections) if detections else _EMPTY_DETECTIONS


class _Solution:
    """solution 네 가지가 함께 쓰는 뼈대: 만들 때 화면에 엔진을 부탁하고(mediapipe.open), process()마다 한 장을 보낸다(mediapipe.detect).

    레거시 SolutionBase와 같은 겉모양(close()·reset()·with 문·닫힌 뒤 process()는 ValueError)을 갖춘다.
    """

    _SOLUTION = ""
    _EMPTY = None

    def __init__(self, options):
        self._id = _state["next_id"]
        _state["next_id"] += 1
        self._closed = False
        self._engine = "none"
        self._options = dict(options)
        self._open()

    def _open(self):
        if not apc_runtime.can_wait():
            self._engine = "limited"
            _notice_once("limited", LIMITED_MESSAGE)
            return
        reply = apc_runtime.request(REQUEST_OPEN, {"solution": self._SOLUTION, "id": self._id, "options": dict(self._options)})
        if isinstance(reply, dict):
            self._engine = str(reply.get("engine", "none"))
        else:
            self._engine = "none"

    @property
    def engine(self):
        """화면이 알려 준 엔진 상태: 'replay'(합성 좌표), 'ready'(Tasks), 'missing-model', 'failed', 'loading', 'limited', 'none'."""
        return self._engine

    def _result(self, reply):  # pragma: no cover - 하위 클래스가 채운다
        raise NotImplementedError

    def process(self, image):
        """RGB 배열 한 장 → 레거시 결과 객체(찾지 못하면 필드가 None). 대기 지점([정지]·조절 값이 여기서 들어온다)."""
        if self._closed:
            raise ValueError(CLOSED_MESSAGE)
        _check_image(image)
        if self._engine == "limited" or not apc_runtime.can_wait():
            _notice_once("limited", LIMITED_MESSAGE)
            return self._EMPTY
        height, width = int(image.shape[0]), int(image.shape[1])
        payload = {
            "solution": self._SOLUTION,
            "id": self._id,
            "width": width,
            "height": height,
            "data": _to_rgba_bytes(image),
        }
        return self._result(apc_runtime.request(REQUEST_DETECT, payload))

    def close(self):
        self._closed = True

    def reset(self):
        """레거시 reset()(그래프 다시 시작). 여기서는 할 일이 없다."""
        return None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()
        return False


class Hands(_Solution):
    """레거시 mp.solutions.hands.Hands 모양. 인자 이름·기본값은 mediapipe 0.10.x와 같다."""

    _SOLUTION = SOLUTION_HANDS
    _EMPTY = _EMPTY_HANDS

    def __init__(
        self,
        static_image_mode=False,
        max_num_hands=2,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ):
        super().__init__(
            {
                "staticImageMode": bool(static_image_mode),
                "maxNumHands": _as_int(max_num_hands, "Hands", "max_num_hands", minimum=1),
                "modelComplexity": _as_int(model_complexity, "Hands", "model_complexity", minimum=0),
                "minDetectionConfidence": _as_ratio(min_detection_confidence, "Hands", "min_detection_confidence"),
                "minTrackingConfidence": _as_ratio(min_tracking_confidence, "Hands", "min_tracking_confidence"),
            }
        )

    def _result(self, reply):
        return _hands_result(reply)


class FaceMesh(_Solution):
    """레거시 mp.solutions.face_mesh.FaceMesh 모양(점 468개, refine_landmarks=True면 눈동자까지 478개)."""

    _SOLUTION = SOLUTION_FACE_MESH
    _EMPTY = _EMPTY_FACES

    def __init__(
        self,
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ):
        self._refine = bool(refine_landmarks)
        super().__init__(
            {
                "staticImageMode": bool(static_image_mode),
                "maxNumFaces": _as_int(max_num_faces, "FaceMesh", "max_num_faces", minimum=1),
                "refineLandmarks": self._refine,
                "minDetectionConfidence": _as_ratio(min_detection_confidence, "FaceMesh", "min_detection_confidence"),
                "minTrackingConfidence": _as_ratio(min_tracking_confidence, "FaceMesh", "min_tracking_confidence"),
            }
        )

    def _result(self, reply):
        return _faces_result(reply, self._refine)


class Pose(_Solution):
    """레거시 mp.solutions.pose.Pose 모양(한 사람, 33점, visibility 포함)."""

    _SOLUTION = SOLUTION_POSE
    _EMPTY = _EMPTY_POSE

    def __init__(
        self,
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True,
        enable_segmentation=False,
        smooth_segmentation=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ):
        complexity = _as_int(model_complexity, "Pose", "model_complexity", minimum=0)
        if complexity > 2:
            raise ValueError(f"Pose(model_complexity=...)는 0·1·2 중 하나예요. 받은 값: {complexity}")
        if complexity == 2:
            _notice_once(
                "pose-heavy",
                "Pose(model_complexity=2)는 아주 무거운 모델(30MB)이라 이 사이트에는 두지 않았어요. 대신 model_complexity=1과 같은 모델로 돌려요.",
                "info",
            )
        if enable_segmentation:
            _notice_once(
                "pose-segmentation",
                "Pose(enable_segmentation=True)의 사람 모양 잘라내기(segmentation_mask)는 이 실습실에서 지원하지 않아요. 결과의 segmentation_mask는 None이에요.",
                "info",
            )
        super().__init__(
            {
                "staticImageMode": bool(static_image_mode),
                "modelComplexity": complexity,
                "smoothLandmarks": bool(smooth_landmarks),
                "enableSegmentation": bool(enable_segmentation),
                "minDetectionConfidence": _as_ratio(min_detection_confidence, "Pose", "min_detection_confidence"),
                "minTrackingConfidence": _as_ratio(min_tracking_confidence, "Pose", "min_tracking_confidence"),
            }
        )

    def _result(self, reply):
        return _pose_result(reply)


class FaceDetection(_Solution):
    """레거시 mp.solutions.face_detection.FaceDetection 모양(상자는 0~1 값)."""

    _SOLUTION = SOLUTION_FACE_DETECTION
    _EMPTY = _EMPTY_DETECTIONS

    def __init__(self, min_detection_confidence=0.5, model_selection=0):
        super().__init__(
            {
                "minDetectionConfidence": _as_ratio(min_detection_confidence, "FaceDetection", "min_detection_confidence"),
                "modelSelection": _as_int(model_selection, "FaceDetection", "model_selection", minimum=0),
            }
        )

    def _result(self, reply):
        return _detections_result(reply)


def _as_int(value, cls, name, minimum=0):
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise TypeError(f"{cls}({name}=...)에는 정수를 넣어요. 받은 값: {value!r}") from None
    if number < minimum:
        raise ValueError(f"{cls}({name}=...)은(는) {minimum} 이상이어야 해요. 받은 값: {number}")
    return number


def _as_ratio(value, cls, name):
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise TypeError(f"{cls}({name}=...)에는 0과 1 사이의 숫자를 넣어요. 받은 값: {value!r}") from None
    if not 0.0 <= number <= 1.0:
        raise ValueError(f"{cls}({name}=...)은(는) 0과 1 사이여야 해요. 받은 값: {number}")
    return number


# ── drawing_utils(레거시 소스를 옮김, Apache-2.0 고지는 머리말) ──

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
    """0~1 좌표 → 픽셀. 범위 밖이면 None(레거시와 같음 — 그 점과 그 점에 닿은 선은 그리지 않는다)."""

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
        raise ImportError("draw_landmarks는 OpenCV(cv2)가 필요해요. 코드 위쪽에 import cv2를 두면 실습실이 OpenCV를 함께 받아요.") from None
    return cv2


def _has_field(landmark, name):
    has_field = getattr(landmark, "HasField", None)
    if callable(has_field):
        try:
            return bool(has_field(name))
        except ValueError:
            return False
    return getattr(landmark, name, None) is not None


def draw_landmarks(
    image,
    landmark_list,
    connections=None,
    landmark_drawing_spec=DrawingSpec(color=RED_COLOR),
    connection_drawing_spec=DrawingSpec(),
    is_drawing_landmarks=True,
):
    """레거시 draw_landmarks: BGR 3채널 numpy 프레임에 연결선을 먼저, 점(흰 테두리 원 + 채운 원)을 나중에 그린다.
    landmark_drawing_spec이 None이면 점을 그리지 않는다. visibility/presence가 있고 0.5 미만인 점은 건너뛴다(자세에만 해당)."""
    if not landmark_list:
        return
    np = _require_numpy()
    if not isinstance(image, np.ndarray) or image.ndim != 3 or image.shape[2] != _BGR_CHANNELS:
        raise ValueError("Input image must contain three channel bgr data. (draw_landmarks의 첫 인자는 높이×너비×3 BGR 프레임이에요)")
    cv2 = _cv2()
    landmarks = getattr(landmark_list, "landmark", None)
    if landmarks is None:
        raise TypeError("draw_landmarks의 두 번째 인자는 landmark 목록(result.multi_hand_landmarks의 원소)이어야 해요.")
    image_rows, image_cols, _ = image.shape
    idx_to_coordinates = {}
    for idx, landmark in enumerate(landmarks):
        if (_has_field(landmark, "visibility") and landmark.visibility < _VISIBILITY_THRESHOLD) or (
            _has_field(landmark, "presence") and landmark.presence < _PRESENCE_THRESHOLD
        ):
            continue
        landmark_px = _normalized_to_pixel_coordinates(landmark.x, landmark.y, image_cols, image_rows)
        if landmark_px:
            idx_to_coordinates[idx] = landmark_px
    if connections:
        num_landmarks = len(landmarks)
        for connection in connections:
            start_idx = connection[0]
            end_idx = connection[1]
            if not (0 <= start_idx < num_landmarks and 0 <= end_idx < num_landmarks):
                raise ValueError(f"Landmark index is out of range. Invalid connection from landmark #{start_idx} to landmark #{end_idx}.")
            if start_idx in idx_to_coordinates and end_idx in idx_to_coordinates:
                drawing_spec = (
                    connection_drawing_spec[connection] if isinstance(connection_drawing_spec, collections.abc.Mapping) else connection_drawing_spec
                )
                if drawing_spec is None:
                    continue
                cv2.line(image, idx_to_coordinates[start_idx], idx_to_coordinates[end_idx], drawing_spec.color, drawing_spec.thickness)
    if is_drawing_landmarks and landmark_drawing_spec:
        for idx, landmark_px in idx_to_coordinates.items():
            drawing_spec = landmark_drawing_spec[idx] if isinstance(landmark_drawing_spec, collections.abc.Mapping) else landmark_drawing_spec
            circle_border_radius = max(drawing_spec.circle_radius + 1, int(drawing_spec.circle_radius * 1.2))
            cv2.circle(image, landmark_px, circle_border_radius, WHITE_COLOR, drawing_spec.thickness)
            cv2.circle(image, landmark_px, drawing_spec.circle_radius, drawing_spec.color, drawing_spec.thickness)


def draw_detection(image, detection, keypoint_drawing_spec=DrawingSpec(color=RED_COLOR), bbox_drawing_spec=DrawingSpec()):
    """레거시 draw_detection: 얼굴 검출이 준 점 6개를 찍고 상자를 그린다(BGR 3채널 numpy 프레임)."""
    if not detection.location_data:
        return
    np = _require_numpy()
    if not isinstance(image, np.ndarray) or image.ndim != 3 or image.shape[2] != _BGR_CHANNELS:
        raise ValueError("Input image must contain three channel bgr data. (draw_detection의 첫 인자는 높이×너비×3 BGR 프레임이에요)")
    cv2 = _cv2()
    image_rows, image_cols, _ = image.shape
    location = detection.location_data
    if location.format != LocationData.RELATIVE_BOUNDING_BOX:
        raise ValueError("LocationData must be relative for this drawing funtion to work.")
    for keypoint in location.relative_keypoints:
        keypoint_px = _normalized_to_pixel_coordinates(keypoint.x, keypoint.y, image_cols, image_rows)
        if keypoint_px:
            cv2.circle(image, keypoint_px, keypoint_drawing_spec.circle_radius, keypoint_drawing_spec.color, keypoint_drawing_spec.thickness)
    if not location.HasField("relative_bounding_box"):
        return
    box = location.relative_bounding_box
    start = _normalized_to_pixel_coordinates(box.xmin, box.ymin, image_cols, image_rows)
    end = _normalized_to_pixel_coordinates(box.xmin + box.width, box.ymin + box.height, image_cols, image_rows)
    if start and end:
        cv2.rectangle(image, start, end, bbox_drawing_spec.color, bbox_drawing_spec.thickness)


def plot_landmarks(*args, **kwargs):
    raise NotImplementedError("plot_landmarks(matplotlib 3D 그림)은 브라우저 실습실에서 지원하지 않아요. cv2.imshow로 프레임에 그려 보세요.")


# ── drawing_styles(레거시 손 스타일 표, Apache-2.0 고지는 머리말) ──

_RADIUS = 5
_RED = (48, 48, 255)
_GREEN = (48, 255, 48)
_BLUE = (192, 101, 21)
_YELLOW = (0, 204, 255)
_GRAY = (128, 128, 128)
_PURPLE = (128, 64, 128)
_PEACH = (180, 229, 255)
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

_HAND_CONNECTION_STYLE = {
    HAND_PALM_CONNECTIONS: DrawingSpec(color=_GRAY, thickness=_THICKNESS_WRIST_MCP),
    HAND_THUMB_CONNECTIONS: DrawingSpec(color=_PEACH, thickness=_THICKNESS_FINGER),
    HAND_INDEX_FINGER_CONNECTIONS: DrawingSpec(color=_PURPLE, thickness=_THICKNESS_FINGER),
    HAND_MIDDLE_FINGER_CONNECTIONS: DrawingSpec(color=_YELLOW, thickness=_THICKNESS_FINGER),
    HAND_RING_FINGER_CONNECTIONS: DrawingSpec(color=_GREEN, thickness=_THICKNESS_FINGER),
    HAND_PINKY_FINGER_CONNECTIONS: DrawingSpec(color=_BLUE, thickness=_THICKNESS_FINGER),
}


def get_default_hand_landmarks_style():
    """관절 번호 → DrawingSpec(손가락마다 다른 색, 채운 점)."""
    style = {}
    for keys, spec in _HAND_LANDMARK_STYLE.items():
        for key in keys:
            style[key] = spec
    return style


def get_default_hand_connections_style():
    """연결 → DrawingSpec(손가락마다 다른 색 선)."""
    style = {}
    for keys, spec in _HAND_CONNECTION_STYLE.items():
        for key in keys:
            style[key] = spec
    return style


# 얼굴 그물·자세 기본 스타일(레거시 drawing_styles.py의 값. 색은 BGR)
_THICKNESS_TESSELATION = 1
_THICKNESS_CONTOURS = 2
_THICKNESS_POSE_LANDMARKS = 2
_FACE_WHITE = (224, 224, 224)
_FACE_GREEN = (48, 255, 48)
_FACE_RED = (48, 48, 255)

_FACEMESH_CONTOURS_STYLE = {
    FACEMESH_LIPS: DrawingSpec(color=_FACE_WHITE, thickness=_THICKNESS_CONTOURS),
    FACEMESH_LEFT_EYE: DrawingSpec(color=_FACE_GREEN, thickness=_THICKNESS_CONTOURS),
    FACEMESH_LEFT_EYEBROW: DrawingSpec(color=_FACE_GREEN, thickness=_THICKNESS_CONTOURS),
    FACEMESH_RIGHT_EYE: DrawingSpec(color=_FACE_RED, thickness=_THICKNESS_CONTOURS),
    FACEMESH_RIGHT_EYEBROW: DrawingSpec(color=_FACE_RED, thickness=_THICKNESS_CONTOURS),
    FACEMESH_FACE_OVAL: DrawingSpec(color=_FACE_WHITE, thickness=_THICKNESS_CONTOURS),
}

_FACEMESH_IRIS_STYLE = {
    FACEMESH_LEFT_IRIS: DrawingSpec(color=_FACE_GREEN, thickness=_THICKNESS_CONTOURS),
    FACEMESH_RIGHT_IRIS: DrawingSpec(color=_FACE_RED, thickness=_THICKNESS_CONTOURS),
}

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


def _expand_style(table):
    style = {}
    for connections, spec in table.items():
        for connection in connections:
            style[connection] = spec
    return style


def get_default_face_mesh_tesselation_style():
    """그물 전체를 그릴 때의 얇은 회색 선."""
    return DrawingSpec(color=(128, 128, 128), thickness=_THICKNESS_TESSELATION)


def get_default_face_mesh_contours_style():
    """윤곽선(입술·눈·눈썹·얼굴 테두리) 연결 → DrawingSpec."""
    return _expand_style(_FACEMESH_CONTOURS_STYLE)


def get_default_face_mesh_iris_connections_style():
    """눈동자 테두리 연결 → DrawingSpec."""
    return _expand_style(_FACEMESH_IRIS_STYLE)


def get_default_pose_landmarks_style():
    """자세 관절 번호 → DrawingSpec(사람의 왼쪽·오른쪽을 다른 색으로)."""
    style = {}
    left = DrawingSpec(color=(0, 138, 255), thickness=_THICKNESS_POSE_LANDMARKS)
    right = DrawingSpec(color=(231, 217, 0), thickness=_THICKNESS_POSE_LANDMARKS)
    for landmark in _POSE_LANDMARKS_LEFT:
        style[landmark] = left
    for landmark in _POSE_LANDMARKS_RIGHT:
        style[landmark] = right
    style[PoseLandmark.NOSE] = DrawingSpec(color=_FACE_WHITE, thickness=_THICKNESS_POSE_LANDMARKS)
    return style


# ── mp.solutions 이름 공간(모듈 객체로 만들어 import 문·repr이 진짜처럼 보이게) ──


def _module(name, doc, **attributes):
    module = types.ModuleType(name, doc)
    for key, value in attributes.items():
        setattr(module, key, value)
    module.__all__ = sorted(attributes)
    return module


hands = _module(
    "mediapipe.solutions.hands",
    "MediaPipe Hands(사이트 흉내 — 추론은 브라우저의 MediaPipe Tasks Vision).",
    Hands=Hands,
    HandLandmark=HandLandmark,
    HAND_CONNECTIONS=HAND_CONNECTIONS,
    HAND_PALM_CONNECTIONS=HAND_PALM_CONNECTIONS,
    HAND_THUMB_CONNECTIONS=HAND_THUMB_CONNECTIONS,
    HAND_INDEX_FINGER_CONNECTIONS=HAND_INDEX_FINGER_CONNECTIONS,
    HAND_MIDDLE_FINGER_CONNECTIONS=HAND_MIDDLE_FINGER_CONNECTIONS,
    HAND_RING_FINGER_CONNECTIONS=HAND_RING_FINGER_CONNECTIONS,
    HAND_PINKY_FINGER_CONNECTIONS=HAND_PINKY_FINGER_CONNECTIONS,
)

drawing_utils = _module(
    "mediapipe.solutions.drawing_utils",
    "MediaPipe 그리기 도우미(사이트 흉내 — 레거시 소스를 옮겨 진짜 cv2로 그린다).",
    DrawingSpec=DrawingSpec,
    WHITE_COLOR=WHITE_COLOR,
    BLACK_COLOR=BLACK_COLOR,
    RED_COLOR=RED_COLOR,
    GREEN_COLOR=GREEN_COLOR,
    BLUE_COLOR=BLUE_COLOR,
    draw_landmarks=draw_landmarks,
    draw_detection=draw_detection,
    plot_landmarks=plot_landmarks,
    _normalized_to_pixel_coordinates=_normalized_to_pixel_coordinates,
)

face_mesh = _module(
    "mediapipe.solutions.face_mesh",
    "MediaPipe Face Mesh(사이트 흉내 — 추론은 브라우저의 MediaPipe Tasks Vision).",
    FaceMesh=FaceMesh,
    FACEMESH_TESSELATION=FACEMESH_TESSELATION,
    FACEMESH_CONTOURS=FACEMESH_CONTOURS,
    FACEMESH_FACE_OVAL=FACEMESH_FACE_OVAL,
    FACEMESH_LIPS=FACEMESH_LIPS,
    FACEMESH_LEFT_EYE=FACEMESH_LEFT_EYE,
    FACEMESH_LEFT_EYEBROW=FACEMESH_LEFT_EYEBROW,
    FACEMESH_LEFT_IRIS=FACEMESH_LEFT_IRIS,
    FACEMESH_RIGHT_EYE=FACEMESH_RIGHT_EYE,
    FACEMESH_RIGHT_EYEBROW=FACEMESH_RIGHT_EYEBROW,
    FACEMESH_RIGHT_IRIS=FACEMESH_RIGHT_IRIS,
    FACEMESH_IRISES=FACEMESH_IRISES,
    FACEMESH_NUM_LANDMARKS=FACEMESH_NUM_LANDMARKS,
    FACEMESH_NUM_LANDMARKS_WITH_IRISES=FACEMESH_NUM_LANDMARKS_WITH_IRISES,
)

face_detection = _module(
    "mediapipe.solutions.face_detection",
    "MediaPipe Face Detection(사이트 흉내 — 얼굴 상자는 0~1 값).",
    FaceDetection=FaceDetection,
    FaceKeyPoint=FaceKeyPoint,
    get_key_point=get_key_point,
)

pose = _module(
    "mediapipe.solutions.pose",
    "MediaPipe Pose(사이트 흉내 — 한 사람 33점).",
    Pose=Pose,
    PoseLandmark=PoseLandmark,
    POSE_CONNECTIONS=POSE_CONNECTIONS,
)

drawing_styles = _module(
    "mediapipe.solutions.drawing_styles",
    "MediaPipe 기본 스타일(사이트 흉내).",
    get_default_hand_landmarks_style=get_default_hand_landmarks_style,
    get_default_hand_connections_style=get_default_hand_connections_style,
    get_default_face_mesh_tesselation_style=get_default_face_mesh_tesselation_style,
    get_default_face_mesh_contours_style=get_default_face_mesh_contours_style,
    get_default_face_mesh_iris_connections_style=get_default_face_mesh_iris_connections_style,
    get_default_pose_landmarks_style=get_default_pose_landmarks_style,
)

solutions = _module(
    "mediapipe.solutions",
    "MediaPipe Solutions(레거시 API 모양의 사이트 흉내): hands·face_mesh·face_detection·pose·drawing_utils·drawing_styles.",
    hands=hands,
    face_mesh=face_mesh,
    face_detection=face_detection,
    pose=pose,
    drawing_utils=drawing_utils,
    drawing_styles=drawing_styles,
)

# mediapipe.py가 sys.modules에 등록해 `import mediapipe.solutions.hands`·`from mediapipe.solutions import face_mesh`가 되게 한다.
SUBMODULES = {
    "mediapipe.solutions": solutions,
    "mediapipe.solutions.hands": hands,
    "mediapipe.solutions.face_mesh": face_mesh,
    "mediapipe.solutions.face_detection": face_detection,
    "mediapipe.solutions.pose": pose,
    "mediapipe.solutions.drawing_utils": drawing_utils,
    "mediapipe.solutions.drawing_styles": drawing_styles,
}


def _reset():
    """실행이 시작될 때(동기 진입점 — 양보 금지) 안내 기록과 객체 번호를 비운다."""
    _state["next_id"] = 1
    _state["noticed"].clear()


def install():
    """워커가 실행 직전에 부른다(apc_shims.install_available — /apc/mediapipe.py가 있어 '받아 둔 패키지'로 잡힌다). 덮어쓸 진짜 패키지는 없고
    실행마다 초기화 함수를 등록해 두는 일만 한다(멱등)."""
    if _state["installed"]:
        return
    apc_runtime.register_reset_hook(_reset)
    _state["installed"] = True
