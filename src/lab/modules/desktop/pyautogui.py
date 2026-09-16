"""pyautogui 흉내 모듈 — 화면 안의 가상 데스크톱을 움직인다(PLAN §8.2 P2-11·P2-12, CODE_MAPPING §3.4 PAG, SPEC §6.1).

브라우저는 진짜 마우스·키보드·다른 프로그램을 움직일 수 없다. 그래서 학생 코드의 `import pyautogui`는 이 모듈을 받고,
`moveTo`·`click`·`dragTo`·`typewrite` 같은 함수는 실습실 아래의 **가상 모니터**(src/lab/modules/desktop/index.ts가 그림)에
커서·클릭·글자를 보낸다. 같은 코드를 진짜 PC에서 돌리면 진짜 pyautogui가 진짜 마우스를 움직인다("진짜 PC에서 돌리기" 내려받기).

PyAutoGUI 0.9.54와 같게 맞춘 것(공식 소스·문서로 확인, CODE_MAPPING §3.4)
- size() → Size(width=1920, height=1080) 같은 namedtuple(가상 모니터 논리 해상도, 기본 1920×1080 — PD-22), position() → Point(x, y).
- 함수를 부를 때마다 PAUSE(기본 0.1초)만큼 쉰다. FAILSAFE(기본 True)면 커서가 FAILSAFE_POINTS(기본 [(0, 0)] — 화면 왼쪽 위 모서리)에
  있을 때 다음 pyautogui 함수를 부르는 순간 FailSafeException이 난다(가상 모니터의 왼쪽 위 모서리에 마우스를 올리거나 [모서리로] 버튼).
- moveTo·dragTo의 duration: 0.1초(MINIMUM_DURATION)보다 길면 0.05초(MINIMUM_SLEEP) 간격의 여러 걸음으로 나눠 옮긴다(진짜와 같은 계산).
  좌표는 int()로 잘라 정수 픽셀이 되고(f021의 소수 좌표), 화면 밖은 화면 안으로 잘린다(운영체제가 커서를 화면 밖에 두지 않는 것과 같음).
- typewrite/write는 한 글자씩(interval 간격), '\\n'은 Enter. press·keyDown·keyUp·hotkey는 KEYBOARD_KEYS의 이름만 받고 모르는 이름은
  진짜처럼 조용히 넘기되 콘솔에 한 번 안내한다. `pyautogui.enter(...)`처럼 없는 함수는 AttributeError(+ 한국어 힌트)다.
- scroll(clicks, x, y)은 커서를 옮기고 스크롤 이벤트를 보낸다(가상 데스크톱은 표시만 한다).

이 사이트에서만 다른 것
- 기다림(duration·PAUSE·interval)은 apc_runtime.sleep — JSPI 대기 지점이라 그동안 화면이 그려지고 [정지]가 바로 먹는다(KeyboardInterrupt).
  제한 모드(JSPI 없음)에서는 기다리지 않고 즉시 다음으로 간다(코드는 끝까지 돌고 화면은 결과를 한꺼번에 그린다).
- 화면 상태는 이 모듈이 가진다(커서 위치·크기). 화면은 이벤트(desktop.*)를 받아 그리기만 하고, 학생이 가상 모니터를 눌러 커서를 옮기면
  'desktop.pointer' 채널로 알려 주어 다음 pyautogui 함수에서 position()이 따라간다(진짜 PC에서 사람이 마우스를 움직인 것과 같음).
- screenshot(): 가상 모니터를 Pillow 그림으로 돌려준다(요청 'desktop.screenshot'). region으로 잘라 받을 수 있고, 저장하면
  화면의 '내 파일'(미리보기·[내려받기])에 나온다(이벤트 'desktop.file'). 같은 이름 반복 저장은 0.5초에 한 번만 실제로 저장한다(f090).
- webbrowser.open(url)은 같은 폴더의 webbrowser.py가 가상 브라우저 창을 연다(P2-12). press('space')는 가상 데스크톱의
  미니게임으로 간다(f121) — 미니게임 창이 없으면 화면이 열어 준다.

규칙(src/lab/README.md 4.4, PROGRESS 미해결 25번): apc_runtime의 emit·request·get·poll·drain·sleep·notice·register_reset_hook만 쓴다.
_reset(실행 시작마다 동기 진입점에서 불림)에서는 양보하는 함수를 쓰지 않는다 — 크기·커서는 첫 함수 호출 때 get으로 읽는다(_ensure_state).
이벤트 이름은 같은 폴더의 manifest.ts에 적혀 있다. 라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import collections
import functools
import os
import time

import apc_runtime

__all__ = [
    "FAILSAFE",
    "FAILSAFE_POINTS",
    "KEYBOARD_KEYS",
    "KEY_NAMES",
    "LEFT",
    "MIDDLE",
    "MINIMUM_DURATION",
    "MINIMUM_SLEEP",
    "PAUSE",
    "PRIMARY",
    "RIGHT",
    "SECONDARY",
    "FailSafeException",
    "Point",
    "PyAutoGUIException",
    "Size",
    "click",
    "countdown",
    "doubleClick",
    "drag",
    "dragRel",
    "dragTo",
    "easeInOutQuad",
    "easeInQuad",
    "easeOutQuad",
    "failSafeCheck",
    "hold",
    "hotkey",
    "hscroll",
    "isValidKey",
    "keyDown",
    "keyUp",
    "leftClick",
    "linear",
    "middleClick",
    "mouseDown",
    "mouseUp",
    "move",
    "moveRel",
    "moveTo",
    "onScreen",
    "position",
    "press",
    "rightClick",
    "screenshot",
    "scroll",
    "size",
    "sleep",
    "tripleClick",
    "typewrite",
    "vscroll",
    "write",
]

__version__ = "0.9.54-apc"  # 흉내 낸 원본 판. 사이트 판은 뒤에 붙였다.

# ── 이름(manifest.ts와 같아야 한다) ──
EVENT_OPEN = "desktop.open"
EVENT_CURSOR = "desktop.cursor"
EVENT_MOUSE = "desktop.mouse"
EVENT_CLICK = "desktop.click"
EVENT_KEY = "desktop.key"
EVENT_HOTKEY = "desktop.hotkey"
EVENT_SCROLL = "desktop.scroll"
EVENT_FILE = "desktop.file"
REQUEST_SCREENSHOT = "desktop.screenshot"
STATE_NAME = "desktop.state"
POINTER_CHANNEL = "desktop.pointer"

# 같은 이름으로 다시 저장하는 사이 간격(초). f090은 손 모양이 맞는 동안 매 프레임 같은 파일에 저장하므로
# (CODE_MAPPING §2.4 f090 비고 "저장 빈도를 제한하고 표시"), 이보다 빨리 오는 저장은 건너뛰고 콘솔에 한 번 알린다.
SAVE_MIN_INTERVAL = 0.5

DEFAULT_WIDTH = 1920
DEFAULT_HEIGHT = 1080

# ── PyAutoGUI 공개 상수(원본과 같은 이름·기본값) ──
PAUSE = 0.1
FAILSAFE = True
FAILSAFE_POINTS = [(0, 0)]
MINIMUM_DURATION = 0.1
MINIMUM_SLEEP = 0.05
LEFT = "left"
MIDDLE = "middle"
RIGHT = "right"
PRIMARY = "primary"
SECONDARY = "secondary"

Point = collections.namedtuple("Point", "x y")
Size = collections.namedtuple("Size", "width height")

KEYBOARD_KEYS = [
    "\t", "\n", "\r", " ", "!", '"', "#", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ":", ";", "<", "=", ">", "?", "@", "[", "\\", "]", "^", "_", "`",
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
    "{", "|", "}", "~",
    "accept", "add", "alt", "altleft", "altright", "apps", "backspace", "browserback", "browserfavorites", "browserforward", "browserhome",
    "browserrefresh", "browsersearch", "browserstop", "capslock", "clear", "convert", "ctrl", "ctrlleft", "ctrlright", "decimal", "del",
    "delete", "divide", "down", "end", "enter", "esc", "escape", "execute", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10",
    "f11", "f12", "f13", "f14", "f15", "f16", "f17", "f18", "f19", "f20", "f21", "f22", "f23", "f24", "final", "fn", "hanguel", "hangul",
    "hanja", "help", "home", "insert", "junja", "kana", "kanji", "launchapp1", "launchapp2", "launchmail", "launchmediaselect", "left",
    "modechange", "multiply", "nexttrack", "nonconvert", "num0", "num1", "num2", "num3", "num4", "num5", "num6", "num7", "num8", "num9",
    "numlock", "pagedown", "pageup", "pause", "pgdn", "pgup", "playpause", "prevtrack", "print", "printscreen", "prntscrn", "prtsc",
    "prtscr", "return", "right", "scrolllock", "select", "separator", "shift", "shiftleft", "shiftright", "sleep", "space", "stop",
    "subtract", "tab", "up", "volumedown", "volumemute", "volumeup", "win", "winleft", "winright", "yen", "command", "option",
    "optionleft", "optionright",
]
KEY_NAMES = KEYBOARD_KEYS  # 원본도 같은 목록을 두 이름으로 내보낸다.
_KEY_SET = set(KEYBOARD_KEYS) | set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

FAILSAFE_MESSAGE = (
    "PyAutoGUI fail-safe triggered from mouse moving to a corner of the screen. "
    "To disable this fail-safe, set pyautogui.FAILSAFE to False. DISABLING FAIL-SAFE IS NOT RECOMMENDED.\n"
    "(안전장치) 마우스 커서가 화면 왼쪽 위 모서리 (0, 0)에 있어서 PyAutoGUI가 실행을 멈췄어요. "
    "진짜 PC에서 자동화가 폭주할 때 사람이 마우스를 모서리로 밀어 멈추는 장치예요. "
    "가상 데스크톱에서는 모니터의 왼쪽 위 모서리에 마우스를 올리거나 [모서리로] 버튼을 누르면 걸려요."
)
LIMITED_SCREENSHOT_MESSAGE = (
    "이 브라우저에는 JSPI(파이썬 기다리기 기능)가 없어서 screenshot()처럼 화면의 답을 기다리는 함수는 쓸 수 없어요. "
    "컴퓨터의 Chrome이나 Edge 최신판에서 열어 주세요."
)
PILLOW_MISSING_MESSAGE = (
    "screenshot()은 그림을 다루는 Pillow(PIL) 패키지가 필요한데 아직 받지 않았어요. "
    "예제 목록의 '화면 캡처하기' 예제를 고르거나, 코드 맨 위에 `import PIL` 한 줄을 더하면 실습실이 Pillow를 받아요."
)

# 없는 이름을 부를 때의 한국어 힌트(AttributeError 메시지 뒤에 붙는다). 진짜 pyautogui에도 없는 이름만 적는다.
_MISSING_HINTS = {
    "enter": "PyAutoGUI에는 enter() 함수가 없어요(진짜 PC에서도 같은 오류). 키를 누르려면 pyautogui.press('enter')를 써요.",
    "Enter": "PyAutoGUI에는 Enter() 함수가 없어요. 키를 누르려면 pyautogui.press('enter')를 써요.",
    "type": "PyAutoGUI에는 type() 함수가 없어요. 글자를 치려면 pyautogui.typewrite('글') 또는 pyautogui.write('글')를 써요.",
    "moveto": "함수 이름은 대소문자를 구분해요: pyautogui.moveTo(x, y)",
    "clickTo": "클릭은 pyautogui.click(x, y)예요.",
    "locateOnScreen": "화면 속 그림 찾기(locateOnScreen 등)는 가상 데스크톱에 없어요. 좌표를 직접 적어 moveTo·click을 써요.",
    "locateCenterOnScreen": "화면 속 그림 찾기(locate…)는 가상 데스크톱에 없어요. 좌표를 직접 적어요.",
    "alert": "알림 상자(alert·confirm·prompt)는 가상 데스크톱에 없어요. print()로 콘솔에 적어요.",
    "confirm": "알림 상자(alert·confirm·prompt)는 가상 데스크톱에 없어요. print()와 input()을 써요.",
    "prompt": "알림 상자(alert·confirm·prompt)는 가상 데스크톱에 없어요. input()을 써요.",
    "password": "비밀번호 상자는 가상 데스크톱에 없어요.",
    "displayMousePosition": "displayMousePosition()은 터미널용이에요. 대신 print(pyautogui.position())을 반복해 보세요.",
}


class PyAutoGUIException(Exception):
    """PyAutoGUI가 내는 오류의 부모 클래스(원본과 같은 이름)."""


class FailSafeException(PyAutoGUIException):
    """커서가 화면 모서리(FAILSAFE_POINTS)에 있어서 멈춤(원본과 같은 이름)."""


# ── 모듈 상태 ──
_width = DEFAULT_WIDTH
_height = DEFAULT_HEIGHT
_x = DEFAULT_WIDTH // 2
_y = DEFAULT_HEIGHT // 2
_state_ready = False
_opened = False
_pressed = set()
_keys_down = []
_warned_keys = set()
# 화면 캡처 저장 기록: 파일 이름 → (마지막으로 정말 저장한 시각, 건너뛴 횟수). 실행마다 비운다.
_saved_at = {}
_skipped_saves = {}
_warned_save_rate = set()
_last_shot = None
_screenshot_class = None


def __getattr__(name):
    """없는 이름(pyautogui.enter 등)은 AttributeError + 한국어 힌트(PEP 562)."""
    message = f"module 'pyautogui' has no attribute '{name}'"
    hint = _MISSING_HINTS.get(name)
    if hint:
        message = f"{message}. {hint}"
    raise AttributeError(message)


def _emit(kind, payload):
    apc_runtime.emit(kind, payload)


def _sleep(seconds):
    """PAUSE·duration·interval 기다리기. JSPI 대기 지점(그동안 화면이 그려지고 [정지]가 먹는다). 제한 모드에서는 즉시."""
    try:
        seconds = float(seconds)
    except (TypeError, ValueError):
        raise TypeError(f"기다리는 시간은 숫자여야 해요. 받은 값: {seconds!r}") from None
    if seconds <= 0:
        return
    if apc_runtime.can_wait():
        apc_runtime.sleep(seconds)


def _ensure_state():
    """실행마다 첫 호출에서 화면이 넣어 둔 모니터 크기·커서 위치(desktop.state)를 읽고 화면에 '열림'을 알린다."""
    global _width, _height, _x, _y, _state_ready, _opened
    if _state_ready:
        return
    _state_ready = True
    state = apc_runtime.get(STATE_NAME)
    if isinstance(state, dict):
        try:
            _width = max(1, int(state.get("width", DEFAULT_WIDTH)))
            _height = max(1, int(state.get("height", DEFAULT_HEIGHT)))
            _x = int(state.get("x", _width // 2))
            _y = int(state.get("y", _height // 2))
        except (TypeError, ValueError):
            _width, _height = DEFAULT_WIDTH, DEFAULT_HEIGHT
            _x, _y = _width // 2, _height // 2
    _x, _y = _clamp(_x, _y)
    if not _opened:
        _opened = True
        _emit(EVENT_OPEN, {"width": _width, "height": _height, "x": _x, "y": _y})


def _clamp(x, y):
    return (min(max(int(x), 0), _width - 1), min(max(int(y), 0), _height - 1))


def _sync_pointer():
    """학생이 가상 모니터를 눌러(또는 모서리로) 커서를 옮긴 것을 반영한다(입력 확인 지점)."""
    global _x, _y
    _ensure_state()
    for event in apc_runtime.poll(POINTER_CHANNEL):
        if isinstance(event, dict):
            try:
                _x, _y = _clamp(event.get("x", _x), event.get("y", _y))
            except (TypeError, ValueError):
                continue


def _handle_pause(pause):
    if pause and PAUSE:
        _sleep(PAUSE)


def _generic_checks(func):
    """원본의 _genericPyAutoGUIChecks: 부르기 전에 안전장치 확인, 끝난 뒤 PAUSE만큼 쉼(_pause=False면 쉬지 않음)."""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        failSafeCheck()
        result = func(*args, **kwargs)
        _handle_pause(kwargs.get("_pause", True))
        return result

    return wrapper


def _normalize_button(button):
    if button in (LEFT, MIDDLE, RIGHT):
        return button
    if button == PRIMARY:
        return LEFT
    if button == SECONDARY:
        return RIGHT
    if isinstance(button, int) and button in (1, 2, 3):
        return (LEFT, MIDDLE, RIGHT)[button - 1]
    raise PyAutoGUIException(
        f"button 인자는 'left', 'middle', 'right', 1, 2, 3 가운데 하나여야 해요. 받은 값: {button!r}"
    )


def _normalize_xy(first, second):
    """원본의 _normalizeXYArgs: (x, y) 튜플 하나도 되고, 둘 다 None이면 지금 커서."""
    if first is None and second is None:
        return position()
    if isinstance(first, str):
        raise PyAutoGUIException(
            "가상 데스크톱에서는 그림 파일 이름으로 위치를 찾는 기능(locateOnScreen)이 없어요. x, y 좌표를 숫자로 적어요."
        )
    if isinstance(first, (tuple, list)) and not isinstance(first, Point):
        if len(first) == 2 and second is None:
            return Point(first[0], first[1])
        if len(first) == 4 and second is None:
            # 사각형(left, top, width, height)이면 가운데
            return Point(first[0] + first[2] / 2, first[1] + first[3] / 2)
        raise PyAutoGUIException(f"좌표는 (x, y) 두 값이어야 해요. 받은 값: {first!r}")
    if isinstance(first, Point) and second is None:
        return first
    x, y = position()
    if first is not None:
        x = first
    if second is not None:
        y = second
    return Point(x, y)


# ── tween(원본은 pytweening을 씀. 자주 쓰는 것만) ──


def linear(n):
    return n


def easeInQuad(n):
    return n * n


def easeOutQuad(n):
    return -n * (n - 2)


def easeInOutQuad(n):
    if n < 0.5:
        return 2 * n * n
    n = n * 2 - 1
    return -0.5 * (n * (n - 2) - 1)


def _point_on_line(x1, y1, x2, y2, n):
    return (((x2 - x1) * n) + x1, ((y2 - y1) * n) + y1)


# ── 공개 API: 화면·커서 ──


def size():
    """가상 모니터 크기 Size(width, height)."""
    _ensure_state()
    return Size(_width, _height)


def position(x=None, y=None):
    """지금 커서 위치 Point(x, y). x·y를 주면 그 값으로 바꾼 Point(원본과 같음 — 커서를 옮기지는 않음)."""
    _sync_pointer()
    return Point(_x if x is None else x, _y if y is None else y)


def onScreen(x, y=None):
    """(x, y)가 화면 안인지."""
    point = _normalize_xy(x, y)
    _ensure_state()
    return 0 <= point.x < _width and 0 <= point.y < _height


def failSafeCheck():
    """FAILSAFE가 켜져 있고 커서가 FAILSAFE_POINTS(기본 왼쪽 위 모서리)에 있으면 FailSafeException."""
    _sync_pointer()
    if FAILSAFE and (_x, _y) in [tuple(point) for point in FAILSAFE_POINTS]:
        raise FailSafeException(FAILSAFE_MESSAGE)


def _move_to(x, y):
    global _x, _y
    _x, _y = _clamp(x, y)
    _emit(EVENT_CURSOR, {"x": _x, "y": _y})


def _drag_to(x, y, button):
    global _x, _y
    _x, _y = _clamp(x, y)
    _emit(EVENT_MOUSE, {"type": "move", "x": _x, "y": _y, "button": button})


def _mouse_move_drag(move_or_drag, x, y, x_offset, y_offset, duration, tween=linear, button=None):
    """원본 _mouseMoveDrag와 같은 걸음 계산. duration이 0.1초 이하면 한 번에, 길면 0.05초 간격으로 나눠 간다."""
    x_offset = int(x_offset) if x_offset is not None else 0
    y_offset = int(y_offset) if y_offset is not None else 0
    if x is None and y is None and x_offset == 0 and y_offset == 0:
        return
    start_x, start_y = position()
    x = int(x) if x is not None else start_x
    y = int(y) if y is not None else start_y
    x += x_offset
    y += y_offset
    width, height = size()
    steps = [(x, y)]
    sleep_amount = 0.0
    duration = float(duration or 0)
    if duration > MINIMUM_DURATION:
        num_steps = max(width, height)
        sleep_amount = duration / num_steps
        if sleep_amount < MINIMUM_SLEEP:
            num_steps = max(1, int(duration / MINIMUM_SLEEP))
            sleep_amount = duration / num_steps
        steps = [_point_on_line(start_x, start_y, x, y, tween(n / num_steps)) for n in range(num_steps)]
        steps.append((x, y))
    for tween_x, tween_y in steps:
        if len(steps) > 1:
            _sleep(sleep_amount)
        tween_x = int(round(tween_x))
        tween_y = int(round(tween_y))
        # 이 함수가 커서를 모서리로 보내는 것은 안전장치가 아니다(사람이 옮긴 것만 잡는다) — 원본과 같은 규칙.
        if (tween_x, tween_y) not in [tuple(point) for point in FAILSAFE_POINTS]:
            failSafeCheck()
        if move_or_drag == "drag":
            _drag_to(tween_x, tween_y, button)
        else:
            _move_to(tween_x, tween_y)


@_generic_checks
def moveTo(x=None, y=None, duration=0.0, tween=linear, logScreenshot=False, _pause=True):
    """커서를 (x, y)로 옮긴다. duration(초) 동안 여러 걸음으로 움직인다."""
    x, y = _normalize_xy(x, y)
    _mouse_move_drag("move", x, y, 0, 0, duration, tween)


@_generic_checks
def moveRel(xOffset=None, yOffset=None, duration=0.0, tween=linear, logScreenshot=False, _pause=True):
    """지금 위치에서 (xOffset, yOffset)만큼 옮긴다."""
    if isinstance(xOffset, (tuple, list)) and yOffset is None and len(xOffset) == 2:
        xOffset, yOffset = xOffset
    _mouse_move_drag("move", None, None, xOffset, yOffset, duration, tween)


move = moveRel


@_generic_checks
def mouseDown(x=None, y=None, button=PRIMARY, duration=0.0, tween=linear, logScreenshot=None, _pause=True):
    button = _normalize_button(button)
    x, y = _normalize_xy(x, y)
    _mouse_move_drag("move", x, y, 0, 0, duration, tween)
    _pressed.add(button)
    _emit(EVENT_MOUSE, {"type": "down", "x": _x, "y": _y, "button": button})


@_generic_checks
def mouseUp(x=None, y=None, button=PRIMARY, duration=0.0, tween=linear, logScreenshot=None, _pause=True):
    button = _normalize_button(button)
    x, y = _normalize_xy(x, y)
    _mouse_move_drag("move", x, y, 0, 0, duration, tween)
    _pressed.discard(button)
    _emit(EVENT_MOUSE, {"type": "up", "x": _x, "y": _y, "button": button})


@_generic_checks
def click(x=None, y=None, clicks=1, interval=0.0, button=PRIMARY, duration=0.0, tween=linear, logScreenshot=None, _pause=True):
    """(x, y)로 옮겨 clicks번 누른다. clicks=2면 더블 클릭. button='right'면 오른쪽 클릭(메뉴)."""
    button = _normalize_button(button)
    x, y = _normalize_xy(x, y)
    _mouse_move_drag("move", x, y, 0, 0, duration, tween)
    try:
        clicks = int(clicks)
    except (TypeError, ValueError):
        raise TypeError(f"clicks는 정수여야 해요. 받은 값: {clicks!r}") from None
    for index in range(clicks):
        failSafeCheck()
        _emit(EVENT_CLICK, {"x": _x, "y": _y, "button": button, "count": index + 1, "clicks": clicks})
        if index < clicks - 1:
            _sleep(interval)


@_generic_checks
def leftClick(x=None, y=None, interval=0.0, duration=0.0, tween=linear, logScreenshot=None, _pause=True):
    click(x, y, 1, interval, LEFT, duration, tween, logScreenshot, _pause=False)


@_generic_checks
def rightClick(x=None, y=None, interval=0.0, duration=0.0, tween=linear, logScreenshot=None, _pause=True):
    click(x, y, 1, interval, RIGHT, duration, tween, logScreenshot, _pause=False)


@_generic_checks
def middleClick(x=None, y=None, interval=0.0, duration=0.0, tween=linear, logScreenshot=None, _pause=True):
    click(x, y, 1, interval, MIDDLE, duration, tween, logScreenshot, _pause=False)


@_generic_checks
def doubleClick(x=None, y=None, interval=0.0, button=LEFT, duration=0.0, tween=linear, logScreenshot=None, _pause=True):
    click(x, y, 2, interval, button, duration, tween, logScreenshot, _pause=False)


@_generic_checks
def tripleClick(x=None, y=None, interval=0.0, button=LEFT, duration=0.0, tween=linear, logScreenshot=None, _pause=True):
    click(x, y, 3, interval, button, duration, tween, logScreenshot, _pause=False)


@_generic_checks
def dragTo(x=None, y=None, duration=0.0, tween=linear, button=PRIMARY, logScreenshot=None, _pause=True, mouseDownUp=True):
    """버튼을 누른 채 (x, y)까지 끌어 놓는다. 그림판 위에서는 선이 그려진다."""
    button = _normalize_button(button)
    x, y = _normalize_xy(x, y)
    if mouseDownUp:
        mouseDown(button=button, logScreenshot=False, _pause=False)
    _mouse_move_drag("drag", x, y, 0, 0, duration, tween, button)
    if mouseDownUp:
        mouseUp(button=button, logScreenshot=False, _pause=False)


@_generic_checks
def dragRel(xOffset=0, yOffset=0, duration=0.0, tween=linear, button=PRIMARY, logScreenshot=None, _pause=True, mouseDownUp=True):
    """지금 위치에서 (xOffset, yOffset)만큼 끌어 놓는다."""
    if xOffset is None:
        xOffset = 0
    if yOffset is None:
        yOffset = 0
    if isinstance(xOffset, (tuple, list)) and len(xOffset) == 2:
        xOffset, yOffset = xOffset
    if xOffset == 0 and yOffset == 0:
        return
    button = _normalize_button(button)
    if mouseDownUp:
        mouseDown(button=button, logScreenshot=False, _pause=False)
    _mouse_move_drag("drag", None, None, xOffset, yOffset, duration, tween, button)
    if mouseDownUp:
        mouseUp(button=button, logScreenshot=False, _pause=False)


drag = dragRel


@_generic_checks
def scroll(clicks, x=None, y=None, logScreenshot=None, _pause=True):
    """clicks칸 스크롤(양수 위, 음수 아래). x, y를 주면 그 자리로 옮긴 뒤."""
    if isinstance(x, (tuple, list)) and len(x) == 2 and y is None:
        x, y = x
    x, y = position(x, y)
    _move_to(x, y)
    _emit(EVENT_SCROLL, {"x": _x, "y": _y, "clicks": int(clicks), "axis": "vertical"})


@_generic_checks
def hscroll(clicks, x=None, y=None, logScreenshot=None, _pause=True):
    if isinstance(x, (tuple, list)) and len(x) == 2 and y is None:
        x, y = x
    x, y = position(x, y)
    _move_to(x, y)
    _emit(EVENT_SCROLL, {"x": _x, "y": _y, "clicks": int(clicks), "axis": "horizontal"})


vscroll = scroll


# ── 공개 API: 키보드 ──


def isValidKey(key):
    return key in _KEY_SET


def _normalize_key(key):
    if not isinstance(key, str):
        raise TypeError(f"키 이름은 글자여야 해요. 받은 값: {key!r}")
    return key.lower() if len(key) > 1 else key


def _warn_unknown_key(key):
    if key in _warned_keys:
        return
    _warned_keys.add(key)
    apc_runtime.notice(
        f"'{key}'은(는) PyAutoGUI 키 이름이 아니어서 무시했어요(진짜 pyautogui도 무시해요). "
        "쓸 수 있는 이름: pyautogui.KEYBOARD_KEYS (예: 'enter', 'space', 'ctrl', 'a').",
        "warn",
    )


def _key_event(kind, key):
    """키 하나를 누르거나(down) 뗀다(up). 모르는 이름은 무시(+ 한 번 안내)."""
    key = _normalize_key(key)
    if key not in _KEY_SET:
        _warn_unknown_key(key)
        return False
    if kind == "down":
        _keys_down.append(key)
    elif key in _keys_down:
        _keys_down.remove(key)
    text = key if len(key) == 1 else {"enter": "\n", "return": "\n", "tab": "\t", "space": " "}.get(key)
    _emit(EVENT_KEY, {"type": kind, "key": key, "text": text})
    return True


@_generic_checks
def keyDown(key, logScreenshot=None, _pause=True):
    _key_event("down", key)


@_generic_checks
def keyUp(key, logScreenshot=None, _pause=True):
    _key_event("up", key)


@_generic_checks
def press(keys, presses=1, interval=0.0, logScreenshot=None, _pause=True):
    """키를 presses번 누른다(누르고 뗌). keys는 이름 하나('enter')나 목록."""
    if isinstance(keys, str):
        keys = [keys]
    else:
        keys = [k if len(k) == 1 else k.lower() for k in keys]
    try:
        presses = int(presses)
    except (TypeError, ValueError):
        raise TypeError(f"presses는 정수여야 해요. 받은 값: {presses!r}") from None
    for index in range(presses):
        for key in keys:
            failSafeCheck()
            _key_event("down", key)
            _key_event("up", key)
        if index < presses - 1:
            _sleep(interval)


class _Hold:
    def __init__(self, keys):
        self.keys = [keys] if isinstance(keys, str) else list(keys)

    def __enter__(self):
        for key in self.keys:
            _key_event("down", key)
        return self

    def __exit__(self, *exc_info):
        for key in reversed(self.keys):
            _key_event("up", key)
        return False


def hold(keys, logScreenshot=None, _pause=True):
    """with pyautogui.hold('shift'): ... — 블록 동안 키를 누른 채 둔다."""
    return _Hold(keys)


@_generic_checks
def typewrite(message, interval=0.0, logScreenshot=None, _pause=True):
    """글자를 한 글자씩 친다(interval초 간격). 줄바꿈 '\\n'은 Enter. 목록이면 키 이름 목록으로 본다."""
    interval = float(interval)
    for char in message:
        if len(char) > 1:
            char = char.lower()
        press(char, _pause=False)
        _sleep(interval)
        failSafeCheck()


write = typewrite


@_generic_checks
def hotkey(*args, **kwargs):
    """조합키. hotkey('ctrl', 's'): 차례로 누르고 거꾸로 뗀다. interval 키워드로 사이 간격."""
    interval = float(kwargs.get("interval", 0.0))
    if len(args) == 1 and isinstance(args[0], (tuple, list)):
        args = tuple(args[0])
    keys = [k if len(k) == 1 else k.lower() for k in args]
    for key in keys:
        _key_event("down", key)
        _sleep(interval)
    for key in reversed(keys):
        _key_event("up", key)
        _sleep(interval)
    _emit(EVENT_HOTKEY, {"keys": keys})


# ── 공개 API: 그 밖 ──


def sleep(seconds):
    """time.sleep과 같다(원본도 그렇다)."""
    time.sleep(seconds)


def countdown(seconds):
    """3, 2, 1 하고 1초씩 센다(원본과 같음)."""
    for count in range(int(seconds), 0, -1):
        print(count, end=" ", flush=True)
        time.sleep(1)
    print()


def _file_path_of(fp):
    """save(fp)의 fp가 파일 이름이면 그 글자, 아니면 None(BytesIO 같은 것)."""
    if isinstance(fp, str):
        return fp
    if isinstance(fp, bytes):
        return fp.decode("utf-8", "replace")
    if hasattr(fp, "__fspath__"):
        return os.fspath(fp)
    return None


def _should_skip_save(name):
    """같은 이름으로 너무 빨리 다시 저장하는지(f090처럼 매 프레임 저장하는 코드). 건너뛰면 True."""
    last = _saved_at.get(name)
    if last is None or time.monotonic() - last >= SAVE_MIN_INTERVAL:
        return False
    _skipped_saves[name] = _skipped_saves.get(name, 0) + 1
    if name not in _warned_save_rate:
        _warned_save_rate.add(name)
        apc_runtime.notice(
            f'같은 이름("{name}")으로 아주 빠르게 다시 저장하고 있어요. 화면이 느려지지 않게 {SAVE_MIN_INTERVAL}초에 한 번만 실제로 저장해요'
            "(진짜 PC에서는 부를 때마다 저장돼요 — 그래서 파일 하나가 계속 덮어써져요).",
            "info",
        )
    return True


def _announce_file(name, width, height):
    """저장한 그림을 가상 데스크톱의 '내 파일'(패널)에 알린다 — 미리보기와 [내려받기]에 쓴다."""
    _saved_at[name] = time.monotonic()
    try:
        # 여기 open은 파이썬 기본 open이다(이 모듈에는 open이라는 이름이 없다).
        with open(name, "rb") as handle:
            raw = handle.read()
    except OSError:
        return
    if len(raw) > 12_000_000:
        apc_runtime.notice(f'"{name}" 그림이 너무 커서 미리보기는 만들지 않았어요(파일은 저장됐어요).', "info")
        return
    data = _to_js_bytes(raw)
    apc_runtime.emit(
        EVENT_FILE,
        {"name": name, "bytes": data, "width": int(width), "height": int(height), "skipped": _skipped_saves.pop(name, 0)},
        transfer=[data.buffer],
    )


def _to_js_bytes(raw):
    """파이썬 bytes → JS Uint8Array(옮길 수 있는 버퍼). 화면이 그대로 그림 파일로 쓴다."""
    from pyodide.ffi import to_js

    return to_js(raw)


def _screenshot_type():
    """PIL 그림을 상속한 클래스(한 번만 만든다). 다른 것은 PIL 그림과 똑같고 save()가 '내 파일'에도 넣는다."""
    global _screenshot_class
    if _screenshot_class is not None:
        return _screenshot_class
    from PIL import Image

    class _Screenshot(Image.Image):
        """pyautogui.screenshot()이 돌려주는 그림(PIL.Image.Image와 같게 쓴다)."""

        def save(self, fp, format=None, **params):  # noqa: A002 - PIL과 같은 인자 이름
            name = _file_path_of(fp)
            if name is not None and _should_skip_save(name):
                return None
            result = super().save(fp, format, **params)
            if name is not None:
                _announce_file(name, self.width, self.height)
            return result

    _screenshot_class = _Screenshot
    return _screenshot_class


def screenshot(imageFilename=None, region=None):
    """가상 모니터를 Pillow 그림(RGB)으로 찍는다. 진짜 PC 화면이 아니라 이 페이지 안의 가상 모니터를 찍는다.

    imageFilename을 주면 그 이름으로 저장하고(가상 파일시스템), region=(left, top, width, height)를 주면 그만큼 잘라서 준다.
    저장한 그림은 아래 패널의 '내 파일'에 미리보기와 [내려받기]로 나온다. 같은 이름으로 아주 빠르게 다시 저장하면
    (f090처럼 매 프레임 저장하는 코드) 0.5초(SAVE_MIN_INTERVAL)에 한 번만 실제로 저장하고 콘솔에 한 번 알린다.
    """
    global _last_shot
    _ensure_state()
    if not apc_runtime.can_wait():
        raise RuntimeError(LIMITED_SCREENSHOT_MESSAGE)
    try:
        from PIL import Image
    except ImportError:
        raise ModuleNotFoundError(PILLOW_MISSING_MESSAGE) from None
    if imageFilename is not None and _last_shot is not None and _should_skip_save(str(imageFilename)):
        # 아주 빠른 반복 저장: 화면을 다시 찍지도 않고 바로 앞 그림을 돌려준다(f090).
        return _last_shot
    shot = apc_runtime.request(REQUEST_SCREENSHOT, {"width": _width, "height": _height}, raw=True)
    if shot is None:
        raise PyAutoGUIException("화면이 캡처를 돌려주지 않았어요. 가상 데스크톱 패널이 보이는지 확인해요.")
    width = int(shot.width)
    height = int(shot.height)
    data = shot.data.to_bytes()
    image = Image.frombytes("RGBA", (width, height), data).convert("RGB")
    if width != _width or height != _height:
        image = image.resize((_width, _height))
    if region is not None:
        left, top, w, h = [int(v) for v in region]
        image = image.crop((left, top, left + w, top + h))
    try:
        # 돌려주는 그림만 save()를 덧입힌다(다른 것은 PIL 그림과 똑같다). Pillow 판이 바뀌어 바꿔 끼울 수 없으면 그냥 PIL 그림으로 둔다.
        image.__class__ = _screenshot_type()
        hooked = True
    except TypeError:
        hooked = False
    _last_shot = image
    if imageFilename is not None:
        image.save(imageFilename)
        if not hooked:
            _announce_file(str(imageFilename), image.width, image.height)
    return image


def _reset():
    """실행이 시작될 때(동기 진입점 — 양보하는 함수 금지, drain만): PAUSE·FAILSAFE 기본값과 커서 상태를 처음으로 돌린다.
    진짜 PC에서는 실행마다 새 파이썬이 뜨므로 pyautogui.PAUSE = 0.01 같은 설정이 다음 실행에 남지 않는다 — 여기서도 같게 한다."""
    global PAUSE, FAILSAFE, FAILSAFE_POINTS, MINIMUM_DURATION, MINIMUM_SLEEP, _state_ready, _opened, _last_shot
    PAUSE = 0.1
    FAILSAFE = True
    FAILSAFE_POINTS = [(0, 0)]
    MINIMUM_DURATION = 0.1
    MINIMUM_SLEEP = 0.05
    _state_ready = False
    _opened = False
    _pressed.clear()
    _keys_down.clear()
    _warned_keys.clear()
    _saved_at.clear()
    _skipped_saves.clear()
    _warned_save_rate.clear()
    _last_shot = None
    apc_runtime.drain(POINTER_CHANNEL)


apc_runtime.register_reset_hook(_reset)
