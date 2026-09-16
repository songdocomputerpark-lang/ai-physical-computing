"""러너 공통 모듈(P2-10, CODE_MAPPING §3.3 RUN·FS·FONT)의 파이썬 쪽 — 작업 폴더의 가상 파일, 글꼴 경로 연결, 저장 파일 알림, 이름 가림 경고.
화면 쪽은 같은 폴더의 index.ts, 규약은 src/lab/README.md 4절.

학생 코드는 이 모듈을 import하지 않는다. manifest.ts의 shims {builtins: 'apc_files'} 덕분에 워커가 매 실행 직전(동기 진입점)에 install()을 부른다
(builtins는 늘 있는 모듈이라 "받아 둔 패키지가 있을 때만 install()"이라는 등록표 규칙 아래서도 항상 불린다 — 러너 공통은 특정 패키지의 흉내가 아니라
실행 환경(작업 폴더·글꼴·저장 파일)을 보완하기 때문이다).

하는 일
1. 글꼴 경로 연결(FONT, f043): Pillow가 받아져 있으면 PIL.ImageFont.truetype을 감싼다. 글꼴 경로가 이 파일시스템에 없으면
   ('C:/Windows/Fonts/malgun.ttf' 같은 PC 경로) 사이트 글꼴(Pretendard, OFL-1.1)로 바꾸고 콘솔에 "맑은 고딕 대신 사이트 글꼴 사용"을 알린다
   (실행마다 경로별 한 번). 글꼴 파일은 처음 필요할 때 화면에 request('runtime-extras.font')로 부탁해 SITE_FONT_PATH에 받는다 — 이 request는
   학생 코드가 truetype()을 부르는 자리(비동기 진입점, 대기 지점)에서만 일어난다. 학생이 넣은 글꼴 파일(있는 경로)은 그대로 쓴다.
   사이트 글꼴 파일이 아직 없으면(통합 요청 .cache/phase2-requests/runner.md 1번) 오류로 멈추지 않고 Pillow 기본 글꼴로 그리며 한국어로 알린다
   (영어·숫자는 나오고 한글은 빈칸).
   2026-09-16 Node 실제 Pyodide 314.0.7로 확인: Pillow 12.2.0은 FreeType 2.13.3이 켜져 있어 실제 .ttf/.otf 경로면 truetype()이 되고
   (raqm은 꺼져 있다 — 완성형 한글 글리프면 된다), 없는 경로는 OSError: cannot open resource, load_default(size)는 언제나 된다.

RUN(exit()·quit()·__main__): Pyodide 314.0.7은 site 모듈을 읽어 builtins.exit·builtins.quit가 이미 있고(부르면 SystemExit),
   워커가 학생 코드를 __name__ == '__main__' 전역으로 돌리므로(worker.ts) 이 모듈이 따로 넣을 것이 없다. SystemExit은 워커가 정상 종료로 처리한다
   (2026-09-16 Node 실제 Pyodide와 tests/unit/runtime-extras/pyodide-runtime-extras.test.ts로 확인).
2. 저장 파일 알림(FS): 실행이 시작될 때 작업 폴더(/home/pyodide — Pyodide 기본 현재 폴더)의 파일 목록(크기·수정 시각)을 기준으로 두고,
   입력 확인 지점(틱 훅, 0.25초마다)과 실행이 끝날 때 달라진 파일(cv2.imwrite·PIL Image.save·open(…, 'w')로 만든 것)을 읽어
   emit('runtime-extras.file_saved', {name, size, data})로 화면에 보낸다(화면의 파일 패널에서 [내려받기]). 폴더 목록은 emit('runtime-extras.files').
3. 이름 가림 경고: 작업 폴더의 .py 파일 이름이 표준 라이브러리·받아 둔 패키지·흉내 모듈 대상 이름과 같으면 실행 시작 때 한국어로 경고한다.
   Pyodide의 sys.path는 ''(현재 폴더)가 site-packages보다 앞이라 cv2.py 같은 파일이 진짜 라이브러리를 가린다(2026-09-16 Node Pyodide로 확인).

동기 진입점 규칙(PROGRESS 미해결 25번): install()·초기화 함수(_reset)·틱 훅(_tick)·끝 훅(_finish)에서는 양보하는 함수(request·sleep·get·poll)를 쓰지 않는다.
실행이 끝날 때 부르는 훅: apc_runtime에 register_finish_hook이 있으면 그것을 쓰고, 없으면(2026-09-16 현재) 워커가 실행이 끝난 뒤 동기(runPython)로 부르는
apc_runtime.unbind_run_globals를 감싸 그 앞에서 마지막 검사를 한다(통합 요청: .cache/phase2-requests/runner.md — apc_runtime에 register_finish_hook 추가).

라이선스: 사이트 소프트웨어(MIT, PD-26). Vite가 이 파일을 글자로 묶어 워커가 /apc에 넣는다.
"""

import functools
import importlib.util
import os
import sys
import time

from pyodide.ffi import to_js

import apc_runtime

__all__ = [
    "EVENT_FILES",
    "EVENT_FILE_SAVED",
    "EVENT_SHADOW",
    "REQUEST_FONT",
    "SITE_FONT_FILE",
    "SITE_FONT_LABEL",
    "SITE_FONT_PATH",
    "WORK_DIR",
    "font_label",
    "install",
    "reserved_module_names",
    "resolve_font",
    "shadowed_files",
    "snapshot",
]

# ── 화면 쪽(assets.ts·manifest.ts)과 같아야 하는 값 ──
WORK_DIR = "/home/pyodide"
SITE_FONT_FILE = "Pretendard-Regular.otf"
SITE_FONT_LABEL = "Pretendard"
SITE_FONT_DIR = "/site-assets/fonts"
SITE_FONT_PATH = f"{SITE_FONT_DIR}/{SITE_FONT_FILE}"
REQUEST_FONT = "runtime-extras.font"
EVENT_FILE_SAVED = "runtime-extras.file_saved"
EVENT_FILES = "runtime-extras.files"
EVENT_SHADOW = "runtime-extras.shadow"

# 작업 폴더를 다시 훑는 간격(초)과 같은 파일을 다시 보내기까지의 간격(초). 실행이 끝날 때는 간격과 상관없이 보낸다.
SCAN_INTERVAL_S = 0.25
SAME_FILE_INTERVAL_S = 0.5
# 이보다 큰 파일은 화면으로 보내지 않는다(내려받기 목록에 크기만 보임)
MAX_EMIT_BYTES = 16 * 1024 * 1024

# 자주 보는 글꼴 파일 이름 → 사람이 아는 이름(안내 글에 씀)
KNOWN_FONTS = {
    "malgun.ttf": "맑은 고딕",
    "malgunbd.ttf": "맑은 고딕 굵게",
    "malgunsl.ttf": "맑은 고딕 Semilight",
    "gulim.ttc": "굴림",
    "batang.ttc": "바탕",
    "dotum.ttc": "돋움",
    "gungsuh.ttc": "궁서",
    "nanumgothic.ttf": "나눔고딕",
    "nanumbarungothic.ttf": "나눔바른고딕",
    "nanummyeongjo.ttf": "나눔명조",
    "applegothic.ttf": "AppleGothic",
    "applesdgothicneo.ttc": "Apple SD 산돌고딕 Neo",
    "arial.ttf": "Arial",
    "times.ttf": "Times New Roman",
    "cour.ttf": "Courier New",
}

# 학생이 자주 쓰는 라이브러리 이름(표준 라이브러리 목록·site-packages 목록에 더한다)
_EXTRA_RESERVED = {"cv2", "numpy", "mediapipe", "pyautogui", "PIL", "serial", "speech_recognition", "pyodide", "js", "micropython", "machine"}

_installed = False
_pil_patched = False
_original_truetype = None
_run_active = False
_baseline = {}  # 파일 이름 → (크기, 수정 시각 ns): 이 실행이 시작될 때(또는 마지막으로 알린 때)의 상태
_last_scan = 0.0
_emitted_at = {}  # 파일 이름 → 마지막으로 화면에 보낸 시각(monotonic)
_notified_fonts = set()  # 이 실행에서 안내한 글꼴 경로


def _short(error) -> str:
    text = str(error).strip().splitlines()
    return text[-1] if text else type(error).__name__


# ── 글꼴 ──


def font_label(path: str) -> str:
    """글꼴 경로의 사람이 아는 이름(모르면 파일 이름)."""
    name = os.path.basename(str(path).replace("\\", "/"))
    return KNOWN_FONTS.get(name.lower(), name)


def _site_font_path(requested: str):
    """사이트 글꼴 파일의 경로. 아직 없으면 화면에 부탁해 받는다(대기 지점). 받을 수 없으면 (None, 한국어 이유)."""
    if os.path.exists(SITE_FONT_PATH):
        return SITE_FONT_PATH, ""
    if not apc_runtime.can_wait():
        # 제한 모드(JSPI 없음)에서는 기다릴 수 없다. 화면이 준비될 때 미리 넣어 주므로 여기까지 왔으면 그것도 실패한 것이다.
        return None, "제한 모드(JSPI 없는 브라우저)라 사이트 글꼴을 받아 오지 못했어요"
    try:
        reply = apc_runtime.request(REQUEST_FONT, {"requested": str(requested), "file": SITE_FONT_FILE})
    except KeyboardInterrupt:
        raise
    except Exception as error:  # 화면이 거절함(글꼴 파일이 아직 사이트에 없음 등)
        return None, _short(error)
    path = reply.get("path") if isinstance(reply, dict) else None
    if isinstance(path, str) and os.path.exists(path):
        return path, ""
    return None, f"사이트 글꼴({SITE_FONT_FILE})을 파일로 넣지 못했어요"


def resolve_font(font):
    """ImageFont.truetype의 font 인자를 실제로 열 경로로 바꾼다.
    경로가 아니거나(BytesIO 등) 있는 경로면 그대로, 없는 경로면 사이트 글꼴 경로로 바꾸고,
    사이트 글꼴도 없으면 None(부르는 쪽이 Pillow 기본 글꼴로 그린다). 콘솔 안내는 실행마다 경로별 한 번."""
    if font is None or not isinstance(font, (str, bytes, os.PathLike)):
        return font
    path = os.fsdecode(font) if isinstance(font, bytes) else os.fspath(font)
    if os.path.exists(path):
        return path
    site_path, reason = _site_font_path(path)
    first_time = path not in _notified_fonts
    _notified_fonts.add(path)
    if site_path is not None:
        if first_time:
            apc_runtime.notice(
                f"글꼴 파일 '{path}'({font_label(path)})은(는) 이 브라우저 안 파이썬에 없어서 사이트 글꼴 {SITE_FONT_LABEL}(OFL-1.1)로 대신 써요. "
                "글자 모양이 PC와 조금 달라요."
            )
        return site_path
    if first_time:
        apc_runtime.notice(
            f"글꼴 파일 '{path}'({font_label(path)})이(가) 없고 사이트 한글 글꼴도 아직 준비되지 않아서({reason}) "
            "Pillow 기본 글꼴로 그려요 — 영어·숫자는 나오지만 한글은 빈칸으로 보여요. "
            "[파일 넣기]로 한글 글꼴 파일(.ttf·.otf)을 넣고 그 이름을 적으면 제대로 나와요.",
            "warn",
        )
    return None


def _patch_pil() -> None:
    """Pillow가 받아져 있으면 PIL.ImageFont.truetype을 한 번만 감싼다(학생 코드의 `from PIL import ImageFont` 뒤 ImageFont.truetype이 이것을 쓴다).
    워커는 학생 코드의 import 문을 보고 패키지를 먼저 받으므로(loadPackagesFromImports), install()이 불리는 시점에는 Pillow가 이미 있다."""
    global _pil_patched, _original_truetype
    if _pil_patched:
        return
    try:
        if importlib.util.find_spec("PIL") is None:
            return
        import PIL.ImageFont as image_font
    except Exception:
        return
    original = image_font.truetype
    if getattr(original, "_apc_files_wrapped", False):
        _pil_patched = True
        return
    _original_truetype = original

    @functools.wraps(original)
    def truetype(font=None, size=10, *args, **kwargs):
        resolved = resolve_font(font)
        if resolved is None:
            # 사이트 글꼴이 없을 때: 오류로 멈추지 않고 Pillow 기본 글꼴(영문 전용)로 그린다. 안내는 resolve_font가 했다.
            return image_font.load_default(size)
        return original(resolved, size, *args, **kwargs)

    truetype._apc_files_wrapped = True
    image_font.truetype = truetype
    _pil_patched = True


# ── 작업 폴더 ──


def snapshot() -> dict:
    """작업 폴더의 파일 목록 {이름: (크기, 수정 시각 ns)}. 숨김 파일(.으로 시작)과 폴더는 뺀다."""
    files = {}
    try:
        with os.scandir(WORK_DIR) as entries:
            for entry in entries:
                if entry.name.startswith("."):
                    continue
                try:
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    stat = entry.stat(follow_symlinks=False)
                except OSError:
                    continue
                files[entry.name] = (stat.st_size, stat.st_mtime_ns)
    except OSError:
        pass
    return files


def _emit_listing(files: dict, phase: str) -> None:
    listing = [{"name": name, "size": size, "mtime_ms": mtime_ns // 1_000_000} for name, (size, mtime_ns) in sorted(files.items())]
    apc_runtime.emit(EVENT_FILES, {"phase": phase, "files": listing})


def _emit_file(name: str, size: int) -> bool:
    """파일 하나를 읽어 화면에 보낸다(복사 없이 옮김). 읽지 못하면 False(다음 검사에서 다시 본다)."""
    if size > MAX_EMIT_BYTES:
        apc_runtime.notice(f"'{name}'은(는) {size:,}바이트라 너무 커서 내려받기 목록에 넣지 않았어요(최대 16MB).", "warn")
        return True
    try:
        with open(os.path.join(WORK_DIR, name), "rb") as handle:
            data = handle.read()
    except OSError:
        return False
    js_bytes = to_js(data)  # bytes → 새 Uint8Array
    apc_runtime.emit(EVENT_FILE_SAVED, {"name": name, "size": len(data), "data": js_bytes}, transfer=[js_bytes.buffer])
    return True


def _scan(force: bool = False) -> int:
    """기준과 달라진 파일을 화면에 보낸다. force가 아니면 SCAN_INTERVAL_S마다, 같은 파일은 SAME_FILE_INTERVAL_S마다만."""
    global _last_scan
    now = time.monotonic()
    if not force and now - _last_scan < SCAN_INTERVAL_S:
        return 0
    _last_scan = now
    current = snapshot()
    sent = 0
    for name, meta in current.items():
        if _baseline.get(name) == meta:
            continue
        if not force and now - _emitted_at.get(name, -1.0e9) < SAME_FILE_INTERVAL_S:
            continue
        if _emit_file(name, meta[0]):
            _baseline[name] = meta
            _emitted_at[name] = now
            sent += 1
    for name in [name for name in _baseline if name not in current]:
        _baseline.pop(name, None)
    return sent


def reserved_module_names() -> set:
    """작업 폴더의 .py 파일이 가리면 문제가 되는 이름: 표준 라이브러리, 내장 모듈, 자주 쓰는 라이브러리, 흉내 대상 패키지와 흉내 모듈, site-packages의 꼭대기 이름."""
    names = set(getattr(sys, "stdlib_module_names", ())) | set(sys.builtin_module_names) | set(_EXTRA_RESERVED)
    try:
        import apc_shims

        names |= set(apc_shims.SHIMS.keys()) | set(apc_shims.SHIMS.values())
    except Exception:
        pass
    for folder in sys.path:
        if not folder.endswith("site-packages") or not os.path.isdir(folder):
            continue
        try:
            for entry in os.listdir(folder):
                if entry.endswith(".dist-info") or entry.startswith("_"):
                    continue
                names.add(entry[:-3] if entry.endswith(".py") else entry)
        except OSError:
            continue
    return names


def shadowed_files(files) -> list:
    """작업 폴더 파일 이름 목록에서 라이브러리 이름을 가리는 .py 파일을 [(파일 이름, 가리는 이름)]로 돌려준다."""
    reserved = reserved_module_names()
    found = []
    for name in sorted(files):
        if not name.endswith(".py"):
            continue
        stem = name[:-3]
        if stem.isidentifier() and stem in reserved:
            found.append((name, stem))
    return found


def _shadow_check(files: dict) -> None:
    for file_name, module_name in shadowed_files(files):
        apc_runtime.notice(
            f"작업 폴더의 '{file_name}'이(가) 파이썬 라이브러리 이름 '{module_name}'과(와) 같아요. import {module_name}이(가) 진짜 라이브러리 대신 "
            f"이 파일을 불러와서 오류가 나요. 파일 이름을 바꿔 주세요(예: my_{module_name}.py).",
            "warn",
        )
        apc_runtime.emit(EVENT_SHADOW, {"file": file_name, "name": module_name})


# ── 훅(동기 진입점 — 양보하는 함수를 부르지 않는다) ──


def _reset() -> None:
    """실행이 시작될 때(apc_runtime.reset_for_run): 기준 목록을 잡고, 가리는 파일을 경고하고, 목록을 화면에 알린다."""
    global _baseline, _run_active, _last_scan
    _notified_fonts.clear()
    _emitted_at.clear()
    _baseline = snapshot()
    _last_scan = time.monotonic()
    _run_active = True
    _shadow_check(_baseline)
    _emit_listing(_baseline, "start")


def _tick() -> None:
    """입력 확인 지점마다(apc_runtime 틱 훅): 간격이 지났으면 달라진 파일을 보낸다."""
    if _run_active:
        _scan()


def _finish() -> None:
    """실행이 끝날 때: 마지막으로 달라진 파일을 모두 보내고 목록을 알린다. 두 번 불려도 한 번만 일한다."""
    global _run_active
    if not _run_active:
        return
    _run_active = False
    try:
        _scan(force=True)
        _emit_listing(snapshot(), "done")
    except Exception as error:  # 끝 훅의 오류가 실행 결과 처리를 막지 않게 한다.
        apc_runtime.notice(f"저장한 파일을 확인하다 오류가 났어요: {type(error).__name__}: {_short(error)}", "warn")


def _install_finish_hook() -> None:
    register = getattr(apc_runtime, "register_finish_hook", None)
    if callable(register):
        register(_finish)
        return
    original = apc_runtime.unbind_run_globals
    if getattr(original, "_apc_files_finish", False):
        return

    @functools.wraps(original)
    def unbind_run_globals():
        try:
            _finish()
        finally:
            original()

    unbind_run_globals._apc_files_finish = True
    apc_runtime.unbind_run_globals = unbind_run_globals


def install() -> None:
    """워커가 매 실행 직전(동기 진입점)에 부른다. 글꼴 감싸기는 Pillow가 나중에 받아져도 되게 매번 확인하고, 훅 등록은 한 번만 한다. 오류를 내지 않는다
    (등록표의 다음 흉내 모듈 설치를 막지 않게)."""
    global _installed
    try:
        _patch_pil()
    except Exception as error:
        apc_runtime.notice(f"글꼴 경로 연결을 준비하지 못했어요: {type(error).__name__}: {_short(error)}", "warn")
    if _installed:
        return
    try:
        apc_runtime.register_reset_hook(_reset)
        apc_runtime.register_tick_hook(_tick)
        _install_finish_hook()
        _installed = True
    except Exception as error:
        apc_runtime.notice(f"파일 패널 연결을 준비하지 못했어요: {type(error).__name__}: {_short(error)}", "warn")
