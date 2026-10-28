"""학생 코드의 `import mediapipe as mp`가 받는 모듈(사이트 흉내, PLAN §8.2 P2-08 — 판 1.8.0부터 mediapipe 1.x 파이썬 판의 Tasks API 모양).
알맹이는 같은 폴더의 apc_mediapipe.py.

진짜 mediapipe 패키지는 Pyodide(브라우저 파이썬)에 없어서, 워커가 이 파일을 가상 파일시스템 /apc/mediapipe.py에 두고 sys.path 맨 앞에서
찾게 한다(학생이 mediapipe.py 파일을 만들어도 가리지 못한다). 진짜 1.1.1·1.2.0처럼 맨 위에는 Image·ImageFormat·tasks 셋만 있고,
추론은 브라우저의 MediaPipe Tasks Vision이 한다.

    import mediapipe as mp
    from mediapipe.tasks.python import vision                 # 이런 import도 된다(아래 sys.modules 등록)
    from mediapipe.tasks import python                        # mp.tasks와 같은 모듈
    from mediapipe.tasks.python.vision import drawing_utils

옛 사용법 `mp.solutions`는 mediapipe 0.10.30부터 없으므로 진짜와 같은 AttributeError가 난다(안내 한 번 + 오류 사전 풀이).

라이선스: 사이트 소프트웨어(MIT, PD-26). 상수·그리기 규칙의 출처 고지는 apc_mediapipe.py 머리말.
"""

import sys as _sys

import apc_mediapipe as _apc

__version__ = _apc.VERSION
Image = _apc.Image
ImageFormat = _apc.ImageFormat
tasks = _apc.tasks

# 패키지처럼 보이게 한다: `import mediapipe.tasks.python.vision`은 부모를 불러온 뒤 sys.modules에서 하위 이름을 찾고,
# 없는 이름(`import mediapipe.solutions`)은 진짜 1.x처럼 "No module named 'mediapipe.solutions'"로 끝난다.
__path__ = []

for _name, _module in _apc.SUBMODULES.items():
    _sys.modules.setdefault(_name, _module)


def __getattr__(name):
    if name == "solutions":
        raise _apc.legacy_solutions_error()
    raise AttributeError(f"module 'mediapipe' has no attribute '{name}'")


__all__ = ["Image", "ImageFormat", "__version__", "tasks"]
