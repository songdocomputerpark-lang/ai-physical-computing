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

# '학생 코드가 import하는 이름': '그 이름을 덮어쓰는 사이트 모듈'
SHIMS = {
    "cv2": "apc_cv2",
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


def install_available() -> list[str]:
    """받아 둔 패키지의 흉내 모듈을 모두 설치하고, 설치한 패키지 이름 목록을 돌려준다."""
    installed = []
    for module_name, shim_name in SHIMS.items():
        if not _is_available(module_name):
            continue
        importlib.import_module(shim_name).install()
        installed.append(module_name)
    return installed
