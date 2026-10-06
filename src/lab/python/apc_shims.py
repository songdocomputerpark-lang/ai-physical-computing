"""흉내 모듈 등록표(PLAN §8.2 P2-03, CODE_MAPPING §3) — 어떤 패키지를 어떤 사이트 모듈이 덮어쓰는지 한 곳에 적는다.

워커(src/lab/runtime/worker.ts)가 학생 코드의 import 문으로 패키지를 받은 뒤, 실행 직전에 install_available()을 부른다.
받아 둔 패키지(예: opencv-python의 cv2)가 있으면 짝이 되는 흉내 모듈의 install()을 한 번 부르고, 없으면 건너뛴다.
install()은 여러 번 불러도 한 번만 덮어쓰게(멱등) 만든다.

새 흉내 모듈은 src/lab/modules/<id>/ 폴더로 만들고(src/lab/README.md 4절) 그 폴더의 manifest.ts에 shims를 적는다.
워커가 시작할 때 모든 폴더의 shims를 모아 register_shims()로 이 표에 더한다(붙박이 cv2만 아래에 직접 적혀 있다).

라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import importlib
import importlib.util
import sys

import apc_runtime

# '학생 코드가 import하는 이름': '그 이름을 덮어쓰는 사이트 모듈'
# asyncio(판 1.2.0): 진짜 패키지를 덮어쓰지 않고, 학생 코드에만 [정지]를 아는 asyncio를 주는 import 훅을 건다(apc_asyncio.py 머리말 —
# 가상 보드 실습실에서는 아무것도 하지 않는다). asyncio는 늘 있으므로 install()이 실행마다 불린다(멱등).
SHIMS = {
    "cv2": "apc_cv2",
    "asyncio": "apc_asyncio",
}


def register_shims(table) -> dict:
    """흉내 모듈 폴더들이 선언한 표({'mediapipe': 'apc_mediapipe', …})를 더한다(워커가 시작할 때 한 번).
    붙박이 항목(cv2)은 바꾸지 못하고, 같은 패키지를 두 모듈이 덮어쓰려 하면 ValueError."""
    for module_name, shim_name in dict(table).items():
        module_name = str(module_name)
        shim_name = str(shim_name)
        existing = SHIMS.get(module_name)
        if existing is not None and existing != shim_name:
            raise ValueError(f"패키지 '{module_name}'의 흉내 모듈이 겹쳐요: {existing}와(과) {shim_name}")
        SHIMS[module_name] = shim_name
    return dict(SHIMS)


def _is_available(module_name: str) -> bool:
    """패키지가 이미 불러와졌거나 받아 두어서 import할 수 있는지(실제로 import하지는 않는다)."""
    if module_name in sys.modules:
        return True
    try:
        return importlib.util.find_spec(module_name) is not None
    except (ImportError, ValueError):
        return False


# 마지막 install_available()에서 설치하지 못한 흉내 모듈: [(패키지 이름, "예외 종류: 한 줄 까닭"), …]
_last_failures: list[tuple[str, str]] = []

# 받는 중이라 미룬 흉내 모듈의 패키지 이름(판 1.2.0) — 실패가 아니다. 이 실행이 그 패키지를 import하면 apc_runtime의 import 문지기가
# 다 받을 때까지 기다린 뒤 install_deferred()로 설치하고, 아니면 다음 실행의 install_available()이 설치한다. 받기가 실행 도중에 이미 끝난
# 뒤의 import는 기다릴 일이 없으므로 apc_runtime이 그 import가 끝나는 자리에서 설치한다(set_deferred_shims로 이름을 알려 둔다 — 판 1.2.1).
_deferred: list[str] = []


def _one_line(error: BaseException) -> str:
    text = str(error).strip().splitlines()
    return f"{type(error).__name__}: {text[-1]}" if text else type(error).__name__


def _initializing(name: str) -> bool:
    """name 모듈이 지금 import되는 중인지(파일을 실행하는 도중 — CPython importlib._bootstrap이 그동안 `__spec__._initializing`을 참으로 둔다)."""
    module = sys.modules.get(name)
    return bool(getattr(getattr(module, "__spec__", None), "_initializing", False))


def _install_one(module_name: str, shim_name: str) -> bool:
    """흉내 모듈 하나를 설치한다. 설치했으면 True. 받는 중이면 미루고(_deferred), 실패면 _last_failures에 적는다(예외를 내지 않는다)."""
    if apc_runtime.package_loading(module_name):
        # 받는 중인 패키지(파일은 풀렸지만 .so는 아직일 수 있다)는 찾아보지도 않는다 — import하면 ImportError가 난다(판 1.2.0).
        _deferred.append(module_name)
        return False
    if _initializing(shim_name) or _initializing(module_name):
        # 흉내 모듈(또는 그 패키지 이름의 모듈)이 지금 import되는 중이다 — 학생 코드의 `import mediapipe`가 apc_mediapipe를 불러오다
        # 그 맨 위 `import numpy`에서 받기를 기다린 뒤 미룬 흉내를 설치하는 자리(apc_runtime._wait_for_package). 덜 만들어진 모듈의
        # install()을 부르면 "partially initialized module … has no attribute 'install'"로 실패하므로 미루고, 그 import가 끝난 뒤
        # (apc_runtime의 맨 바깥 import가 끝날 때) 다시 설치한다(판 1.2.0 통합 — lab-vision-package-wait 검사가 찾음).
        _deferred.append(module_name)
        return False
    if not _is_available(module_name):
        return False
    try:
        importlib.import_module(shim_name).install()
    except apc_runtime.PackageStillLoading:
        # 흉내 모듈이 받는 중인 다른 패키지를 import하려 했다(apc_mediapipe의 numpy 등) — 그 모듈의 import는 되돌려졌다. 미룬다.
        _deferred.append(module_name)
        return False
    except Exception as error:  # 다른 흉내 모듈의 설치를 막지 않는다
        _last_failures.append((module_name, _one_line(error)))
        return False
    return True


def install_available() -> list[str]:
    """받아 둔 패키지의 흉내 모듈을 모두 설치하고, 설치한 패키지 이름 목록을 돌려준다.

    한 모듈의 설치가 실패해도 나머지는 설치한다(예외를 밖으로 내지 않는다). 실패한 것은 last_failures()가 알려 준다.
    받는 중인 패키지의 흉내(와 받는 중인 패키지를 import하는 흉내)는 실패가 아니라 미룬다(deferred() — 판 1.2.0, PROGRESS 미해결 219).
    예전 까닭(2026-09-25 Phase 5 검토에서 재현): 영상처리 실습실이 준비 뒤에 OpenCV를 미리 받는 동안 cv2가 쓰지 않는 예제를 다시
    실행하면, 풀어 놓았지만 아직 불러오기가 끝나지 않은 cv2를 import하다 실패했다. 판 1.2.0부터 워커가 받는 중인 이름을 알려 주어
    그 흉내를 미루고(numpy처럼 흉내 모듈 안에서 import하는 것은 apc_runtime.PackageStillLoading으로 알아챔), 받기가 끝난 뒤 설치한다."""
    installed = []
    _last_failures.clear()
    _deferred.clear()
    for module_name, shim_name in SHIMS.items():
        if _install_one(module_name, shim_name):
            installed.append(module_name)
    apc_runtime.set_deferred_shims(_deferred)
    return installed


def install_deferred() -> list[str]:
    """미뤄 둔 흉내 모듈 가운데 이제 받기가 끝난 것을 설치하고 설치한 이름을 돌려준다(apc_runtime의 import 문지기가 기다린 뒤 부른다 —
    학생 코드 실행 중이라 실패는 콘솔 알림으로). 아직 받는 중인 것은 다시 미룬다."""
    names = list(_deferred)
    _deferred.clear()
    installed = []
    for module_name in names:
        shim_name = SHIMS.get(module_name)
        if shim_name is None:
            continue
        before = len(_last_failures)
        if _install_one(module_name, shim_name):
            installed.append(module_name)
        for name, reason in _last_failures[before:]:
            apc_runtime.notice(f"사이트 흉내 모듈({name})을 준비하지 못했어요({reason}). 실행은 이어서 해요.", "warn")
    apc_runtime.set_deferred_shims(_deferred)
    return installed


def deferred() -> list[str]:
    """마지막 install_available()·install_deferred() 뒤에 받는 중이라 미뤄 둔 흉내 모듈의 패키지 이름."""
    return list(_deferred)


def last_failures() -> list[list[str]]:
    """마지막 install_available()에서 설치하지 못한 흉내 모듈 [[패키지 이름, 한 줄 까닭], …](워커가 콘솔 알림을 만든다)."""
    return [[name, reason] for name, reason in _last_failures]
