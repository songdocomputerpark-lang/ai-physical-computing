"""학생 코드의 `import mediapipe as mp`가 받는 모듈(사이트 흉내, PLAN §8.2 P2-08). 알맹이는 같은 폴더의 apc_mediapipe.py.

진짜 mediapipe 패키지는 Pyodide(브라우저 파이썬)에 없어서, 워커가 이 파일을 가상 파일시스템 /apc/mediapipe.py에 두고 sys.path 맨 앞에서
찾게 한다(학생이 mediapipe.py 파일을 만들어도 가리지 못한다). 레거시 mp.solutions 모양(Hands·HandLandmark·HAND_CONNECTIONS·drawing_utils·
drawing_styles)을 그대로 쓰고, 추론은 브라우저의 MediaPipe Tasks Vision이 한다. 지금은 손(hands)만 있고 얼굴·자세는 다음 묶음(P2-09)에서 더한다.

    import mediapipe as mp
    mp_hands = mp.solutions.hands
    from mediapipe.solutions import drawing_utils        # 이런 import도 된다(아래 sys.modules 등록)
    import mediapipe.solutions.hands as hands_module

라이선스: 사이트 소프트웨어(MIT, PD-26). 상수·그리기 규칙의 출처 고지는 apc_mediapipe.py 머리말.
"""

import sys as _sys

import apc_mediapipe as _apc

__version__ = _apc.VERSION
solutions = _apc.solutions

# 패키지처럼 보이게 한다: `import mediapipe.solutions`는 부모를 불러온 뒤 sys.modules에서 하위 이름을 찾고,
# 없는 이름(`import mediapipe.tasks`)은 "No module named 'mediapipe.tasks'"로 끝난다(Tasks API는 제공하지 않는다).
__path__ = []

for _name, _module in _apc.SUBMODULES.items():
    _sys.modules.setdefault(_name, _module)

__all__ = ["__version__", "solutions"]
