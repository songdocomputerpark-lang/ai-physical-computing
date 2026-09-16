"""cv2 카메라·창 흉내 모듈(PLAN §8.2 P2-03, CODE_MAPPING §3.1 CV) — 진짜 OpenCV 위에 카메라와 창 함수만 덮어쓴다.

왜 필요한가(2026-09-16 Node.js의 실제 Pyodide 314.0.7 + opencv-python 4.11.0.86으로 확인):
- Pyodide의 opencv-python은 highgui 모듈은 들어 있지만 창 백엔드(GTK·Qt·Win32·Cocoa) 없이 빌드됐다
  (cv2.getBuildInformation()의 "GUI:" 칸이 비어 있음). 그래서 cv2.imshow·namedWindow·waitKey·destroyWindow·destroyAllWindows는
  cv2.error "The function is not implemented. Rebuild the library with Windows, GTK+ 2.x or Cocoa support"(window.cpp:1301 등)를 낸다.
- cv2.VideoCapture(0)은 브라우저 안에서 장치에 닿을 수 없어 isOpened()가 False, read()가 (False, None)이다.
- cv2.getWindowProperty는 -1.0, setWindowProperty는 아무 일도 하지 않는다.
- 나머지(cvtColor·Canny·GaussianBlur·resize·putText·imencode 등)는 실물 그대로 돈다.

동작(학생 코드는 `import cv2`를 그대로 쓴다 — install()이 cv2 모듈의 이름을 이 파일의 것으로 바꾼다):
- cv2.VideoCapture(0): 화면에 'camera.open'을 부탁한다(웹캠, 없으면 화면이 고른 샘플 입력). 문자열(파일 경로)이면 진짜 VideoCapture에 맡긴다.
- cap.read(): 'camera.read'로 다음 프레임(RGBA 바이트)을 기다렸다가 numpy BGR 배열(HxWx3 uint8)로 돌려준다. 초당 15장 제한은 화면이 한다.
  이 대기가 "입력 확인 지점"이라 [정지]·슬라이더 값이 여기서 들어온다. 제한 모드(JSPI 없음)에서는 실행 직전에 화면이 넣어 둔
  마지막 한 장('camera.frame')을 돌려준다.
- cap.get(cv2.CAP_PROP_FRAME_WIDTH/HEIGHT): 파이썬이 실제로 받는 프레임 크기. cap.set(…)은 화면에 'camera.set'으로 부탁한다.
- cv2.imshow(이름, img): 회색(2차원)·BGR(3채널)·BGRA(4채널)를 RGBA로 바꿔 'window.show' 이벤트로 화면(창 이름별 탭)에 보낸다.
  기다리지 않는다. 같은 창은 초당 30번까지만 보내고, 16ms마다 한 번 양보한다(sleep 없는 반복문 대비).
- cv2.waitKey(ms): ms만큼 기다리며(양보 지점) 출력 화면에 들어온 키 코드(0~255, ESC=27)를 돌려준다. 없으면 -1.
  0 이하면 키가 올 때까지 기다린다. `& 0xFF == ord('q')`처럼 쓰는 관례가 그대로 된다.
- cv2.namedWindow(이름): 탭을 미리 만든다. cv2.getWindowProperty(이름, cv2.WND_PROP_VISIBLE): 탭이 열려 있으면 1.0, 화면에서 닫았으면 0.0,
  만든 적 없는 이름이면 -1.0(진짜 OpenCV의 Pyodide 빌드와 같은 값). cv2.destroyWindow·destroyAllWindows는 파이썬 쪽 목록만 지우고
  화면의 탭은 결과 확인용으로 남긴다(CODE_MAPPING §3.1).
- 오타(cv2.destoyAllWindows)는 원래대로 AttributeError가 난다.

화면 쪽 짝: src/lab/vision/vision-lab.ts(요청·이벤트 종류는 src/lab/runtime/protocol.ts 머리말).
이 모듈은 apc_runtime의 request·emit·get·poll·sleep·maybe_yield·notice만 쓴다(CODE_MAPPING §3.0 규칙 1).

라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import time

import numpy as np
from pyodide.ffi import to_js

import apc_runtime

__all__ = ["VideoCapture", "destroyAllWindows", "destroyWindow", "getWindowProperty", "imshow", "install", "namedWindow", "waitKey"]

KEY_CHANNEL = "cv2.keys"
WINDOW_CHANNEL = "cv2.window"
CAMERA_INFO_NAME = "camera.info"
CAMERA_FRAME_NAME = "camera.frame"

# 같은 창에 imshow를 이보다 자주 부르면 화면에 보내지 않는다(초당 30장). 화면이 다 그리지도 못할 영상을 보내지 않으려는 것이다.
SHOW_MIN_INTERVAL_S = 1.0 / 30.0
# waitKey(0)처럼 키를 기다릴 때 한 번에 양보하는 시간(초)
KEY_POLL_INTERVAL_S = apc_runtime.YIELD_INTERVAL_MS / 1000.0

# OpenCV 상수(2026-09-16 Pyodide의 cv2로 확인). cv2를 import하기 전에도 쓸 수 있게 값을 적어 둔다.
CAP_PROP_POS_MSEC = 0
CAP_PROP_POS_FRAMES = 1
CAP_PROP_FRAME_WIDTH = 3
CAP_PROP_FRAME_HEIGHT = 4
CAP_PROP_FPS = 5
CAP_PROP_FRAME_COUNT = 7
WND_PROP_FULLSCREEN = 0
WND_PROP_AUTOSIZE = 1
WND_PROP_ASPECT_RATIO = 2
WND_PROP_OPENGL = 3
WND_PROP_VISIBLE = 4
WND_PROP_TOPMOST = 5

NO_CAMERA_MESSAGE = "카메라(입력 소스)를 열지 못했어요. 화면의 '입력 소스'에서 웹캠이나 샘플 입력을 고른 뒤 다시 실행해 주세요."
LIMITED_WAITKEY_MESSAGE = (
    "이 브라우저에는 JSPI(파이썬 기다리기 기능)가 없어서 cv2.waitKey(0)처럼 키를 기다리는 코드는 실행할 수 없어요. "
    "컴퓨터의 Chrome이나 Edge 최신판에서 열어 주세요."
)

_cv2 = None  # install()이 채운다(진짜 cv2 모듈)
_originals = {}
_installed = False
_windows = {}  # 창 이름 → {'visible': bool}
_key_queue = []
_last_show = {}  # 창 이름 → 마지막으로 화면에 보낸 시각(monotonic)
_next_capture_id = 1

_PATCHED_NAMES = (
    "VideoCapture",
    "imshow",
    "waitKey",
    "waitKeyEx",
    "pollKey",
    "namedWindow",
    "getWindowProperty",
    "setWindowProperty",
    "destroyWindow",
    "destroyAllWindows",
    "moveWindow",
    "resizeWindow",
    "setWindowTitle",
    "startWindowThread",
)


def _error(message):
    """cv2.error(학생 코드의 except cv2.error가 잡을 수 있게)로 만든다. cv2가 없으면 RuntimeError."""
    if _cv2 is not None and hasattr(_cv2, "error"):
        return _cv2.error(message)
    return RuntimeError(message)


def _as_int(value, name):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise TypeError(f"{name}은(는) 정수여야 해요. 받은 값: {value!r}") from None


# ── 카메라 ──


def _frame_to_bgr(frame):
    """화면이 보낸 프레임(JsProxy: width·height·data(RGBA 바이트))을 numpy BGR 배열로 바꾼다(복사 두 번: assign_to, cvtColor)."""
    width = int(frame.width)
    height = int(frame.height)
    data = frame.data
    expected = width * height * 4
    if width <= 0 or height <= 0 or int(data.length) != expected:
        raise _error(f"카메라 프레임 크기가 맞지 않아요: {width}x{height}, 바이트 {int(data.length)} (기대 {expected})")
    rgba = np.empty((height, width, 4), dtype=np.uint8)
    data.assign_to(rgba)
    return _cv2.cvtColor(rgba, _cv2.COLOR_RGBA2BGR)


class VideoCapture:
    """cv2.VideoCapture 흉내. 번호(0)는 화면의 카메라·샘플 입력, 문자열(파일 경로)은 진짜 VideoCapture에 맡긴다."""

    def __init__(self, source=0, api_preference=None, params=None):
        global _next_capture_id
        self._id = _next_capture_id
        _next_capture_id += 1
        self._real = None
        self._opened = False
        self._width = 0.0
        self._height = 0.0
        self._fps = 0.0
        self._source = ""
        self._grabbed = None
        if isinstance(source, str):
            self._real = _originals["VideoCapture"](source)
            return
        index = _as_int(source, "카메라 번호")
        if apc_runtime.can_wait():
            info = apc_runtime.request("camera.open", {"index": index, "capture": self._id})
        else:
            # 제한 모드: 화면이 미리 넣어 둔 정보만 읽을 수 있다(기다릴 수 없다).
            info = apc_runtime.get(CAMERA_INFO_NAME)
        if isinstance(info, dict) and info.get("ok", True) and info.get("width"):
            self._opened = True
            self._width = float(info.get("width", 0))
            self._height = float(info.get("height", 0))
            self._fps = float(info.get("fps", 0))
            self._source = str(info.get("source", ""))
        else:
            apc_runtime.notice(NO_CAMERA_MESSAGE, "warn")

    # 진짜 VideoCapture(파일)에 맡기는 경우
    def _delegate(self, name, *args):
        return getattr(self._real, name)(*args)

    def isOpened(self):
        if self._real is not None:
            return self._delegate("isOpened")
        return self._opened

    def read(self, image=None):
        if self._real is not None:
            return self._delegate("read") if image is None else self._delegate("read", image)
        if not self._opened:
            return False, None
        if apc_runtime.can_wait():
            frame = apc_runtime.request("camera.read", {"capture": self._id}, raw=True)
        else:
            frame = apc_runtime.get(CAMERA_FRAME_NAME, raw=True)
        if frame is None:
            return False, None
        bgr = _frame_to_bgr(frame)
        self._height, self._width = float(bgr.shape[0]), float(bgr.shape[1])
        return True, bgr

    def grab(self):
        ok, frame = self.read()
        self._grabbed = frame if ok else None
        return ok

    def retrieve(self, image=None, flag=0):
        if self._real is not None:
            return self._delegate("retrieve")
        if self._grabbed is None:
            return False, None
        frame, self._grabbed = self._grabbed, None
        return True, frame

    def get(self, prop_id):
        if self._real is not None:
            return self._delegate("get", prop_id)
        prop = _as_int(prop_id, "속성 번호")
        if prop == CAP_PROP_FRAME_WIDTH:
            return self._width
        if prop == CAP_PROP_FRAME_HEIGHT:
            return self._height
        if prop == CAP_PROP_FPS:
            return self._fps
        return 0.0

    def set(self, prop_id, value):
        if self._real is not None:
            return self._delegate("set", prop_id, value)
        prop = _as_int(prop_id, "속성 번호")
        if not self._opened or not apc_runtime.can_wait():
            return False
        if prop in (CAP_PROP_FRAME_WIDTH, CAP_PROP_FRAME_HEIGHT):
            name = "width" if prop == CAP_PROP_FRAME_WIDTH else "height"
            result = apc_runtime.request("camera.set", {"capture": self._id, "prop": name, "value": float(value)})
            if isinstance(result, dict):
                self._width = float(result.get("width", self._width))
                self._height = float(result.get("height", self._height))
                return bool(result.get("ok", False))
            return bool(result)
        return False

    def release(self):
        if self._real is not None:
            self._delegate("release")
            return
        if self._opened and apc_runtime.can_wait():
            try:
                apc_runtime.request("camera.release", {"capture": self._id})
            except KeyboardInterrupt:
                raise
            except Exception:
                pass  # 화면이 이미 정리한 뒤라면 답이 없어도 된다.
        self._opened = False

    def getBackendName(self):
        if self._real is not None:
            return self._delegate("getBackendName")
        return "APC-BROWSER"

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        self.release()
        return False


# ── 창 ──


def _collect_keys():
    for code in apc_runtime.poll(KEY_CHANNEL):
        try:
            _key_queue.append(int(code))
        except (TypeError, ValueError):
            continue


def _sync_windows():
    """화면에서 탭을 닫은 것을 반영한다(getWindowProperty가 0.0을 돌려주게)."""
    for event in apc_runtime.poll(WINDOW_CHANNEL):
        if not isinstance(event, dict):
            continue
        name = str(event.get("name", ""))
        if name in _windows and event.get("closed"):
            _windows[name]["visible"] = False


def _check_image(mat, winname):
    """imshow에 들어온 값이 보여 줄 수 있는 배열인지 먼저(복사 없이) 검사한다. 잘못된 값은 빈도 제한과 상관없이 늘 오류가 난다."""
    if not isinstance(mat, np.ndarray):
        raise _error(f"cv2.imshow('{winname}', …): 두 번째 인자는 numpy 배열(이미지)이어야 해요. 받은 것: {type(mat).__name__}")
    if mat.size == 0:
        raise _error(f"cv2.imshow('{winname}', …): 빈 이미지는 보여 줄 수 없어요.")
    if not (mat.ndim == 2 or (mat.ndim == 3 and mat.shape[2] in (1, 3, 4))):
        raise _error(
            f"cv2.imshow('{winname}', …): 이미지 모양 {tuple(mat.shape)}은(는) 보여 줄 수 없어요. "
            "회색(높이×너비), 색(높이×너비×3), 투명도 포함(높이×너비×4)만 돼요."
        )


def _to_rgba(mat, winname):
    """imshow에 들어온 배열을 uint8 RGBA(HxWx4)로 바꾼다. 진짜 imshow처럼 float는 0~1을 0~255로, uint16은 256으로 나눈다."""
    _check_image(mat, winname)
    arr = mat
    if arr.dtype != np.uint8:
        if arr.dtype.kind == "f":
            arr = np.clip(arr * 255.0, 0, 255).astype(np.uint8)
        elif arr.dtype == np.bool_:
            arr = arr.astype(np.uint8) * 255
        elif arr.dtype == np.uint16:
            arr = (arr // 256).astype(np.uint8)
        else:
            arr = np.clip(arr, 0, 255).astype(np.uint8)
    if arr.ndim == 3 and arr.shape[2] == 1:
        arr = arr[:, :, 0]
    if arr.ndim == 2:
        code = _cv2.COLOR_GRAY2RGBA
    elif arr.ndim == 3 and arr.shape[2] == 3:
        code = _cv2.COLOR_BGR2RGBA
    elif arr.ndim == 3 and arr.shape[2] == 4:
        code = _cv2.COLOR_BGRA2RGBA
    else:
        raise _error(
            f"cv2.imshow('{winname}', …): 이미지 모양 {tuple(arr.shape)}은(는) 보여 줄 수 없어요. "
            "회색(높이×너비), 색(높이×너비×3), 투명도 포함(높이×너비×4)만 돼요."
        )
    return _cv2.cvtColor(np.ascontiguousarray(arr), code)


def imshow(winname, mat):
    name = str(winname)
    _check_image(mat, name)  # 잘못된 이미지는 빈도 제한에 걸려도 오류가 나야 한다(조용히 넘어가면 학생이 원인을 못 찾는다).
    window = _windows.setdefault(name, {"visible": True})
    window["visible"] = True
    now = time.monotonic()
    last = _last_show.get(name)
    if last is not None and now - last < SHOW_MIN_INTERVAL_S:
        apc_runtime.maybe_yield()
        return
    _last_show[name] = now
    rgba = _to_rgba(mat, name)
    height, width = int(rgba.shape[0]), int(rgba.shape[1])
    data = to_js(rgba.reshape(-1))  # 1차원 uint8 → 새 Uint8Array(복사). 2차원 이상은 중첩 배열이 되므로 꼭 펴서 넘긴다.
    apc_runtime.emit("window.show", {"name": name, "width": width, "height": height, "data": data}, transfer=[data.buffer])
    apc_runtime.maybe_yield()


def namedWindow(winname, flags=None):
    name = str(winname)
    _windows[name] = {"visible": True}
    apc_runtime.emit("window.open", {"name": name})


def getWindowProperty(winname, prop_id):
    _sync_windows()
    name = str(winname)
    prop = _as_int(prop_id, "속성 번호")
    window = _windows.get(name)
    if window is None:
        return -1.0
    if prop == WND_PROP_VISIBLE:
        return 1.0 if window["visible"] else 0.0
    if prop == WND_PROP_AUTOSIZE:
        return 1.0
    return 0.0


def setWindowProperty(winname, prop_id, prop_value):
    return None


def destroyWindow(winname):
    name = str(winname)
    _windows.pop(name, None)
    _last_show.pop(name, None)
    apc_runtime.emit("window.close", {"name": name})


def destroyAllWindows():
    _windows.clear()
    _last_show.clear()
    apc_runtime.emit("window.close", {"name": None})


def moveWindow(winname, x, y):
    return None


def resizeWindow(winname, *args):
    return None


def setWindowTitle(winname, title):
    return None


def startWindowThread():
    return 0


def waitKey(delay=0):
    _sync_windows()
    ms = _as_int(delay, "waitKey의 기다리는 시간(ms)")
    if ms > 0:
        apc_runtime.sleep(ms / 1000.0)
        _collect_keys()
        return _key_queue.pop(0) if _key_queue else -1
    while True:
        _collect_keys()
        if _key_queue:
            return _key_queue.pop(0)
        if not apc_runtime.can_wait():
            raise RuntimeError(LIMITED_WAITKEY_MESSAGE)
        apc_runtime.sleep(KEY_POLL_INTERVAL_S)


def waitKeyEx(delay=0):
    return waitKey(delay)


def pollKey():
    _sync_windows()
    _collect_keys()
    return _key_queue.pop(0) if _key_queue else -1


def reset_for_run():
    """실행을 시작할 때 창 목록·키 큐와 실행 전에 쌓인 화면 값을 비운다(apc_runtime.reset_for_run이 부른다).
    워커가 동기(runPython)로 부르므로 양보하는 poll 대신 drain을 쓴다(양보를 시도하면 JSPI가 스택 전환을 거부한다)."""
    _windows.clear()
    _last_show.clear()
    _key_queue.clear()
    apc_runtime.drain(KEY_CHANNEL)
    apc_runtime.drain(WINDOW_CHANNEL)


def install():
    """진짜 cv2 모듈의 카메라·창 이름을 이 모듈의 것으로 바꾼다(한 번만). 학생 코드의 import cv2는 같은 모듈 객체를 받는다."""
    global _cv2, _installed
    import cv2  # 받아 둔 opencv-python(worker.ts가 이 함수를 부르기 전에 받는다)

    _cv2 = cv2
    if _installed:
        return
    for name in _PATCHED_NAMES:
        _originals[name] = getattr(cv2, name, None)
        setattr(cv2, name, globals()[name])
    apc_runtime.register_reset_hook(reset_for_run)
    _installed = True


def originals():
    """덮어쓰기 전의 진짜 함수(테스트·디버깅용)."""
    return dict(_originals)
