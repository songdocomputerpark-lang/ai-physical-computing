"""모듈 뼈대 예시 "hello"의 파이썬 쪽(src/lab/README.md 4절). 화면 쪽은 같은 폴더의 index.ts.

학생 코드에서:
    import apc_hello
    print(apc_hello.greet("세계"))   # 화면이 답한 인사말(대기 지점 — request 'hello.greet')
    apc_hello.wave()                  # 화면 패널의 손 흔든 횟수 +1(emit 'hello.wave', 답을 기다리지 않음)
    print(apc_hello.name())           # 패널 입력칸의 최신 값(get 'hello.name')
    print(apc_hello.clicks())         # 패널 [누르기]를 누른 기록(poll 'hello.clicks', 꺼내면 비워짐)

규칙(PROGRESS 미해결 25번): 초기화 함수(_reset — 실행 시작 때 워커가 동기 진입점에서 부름)에서는 양보하는 함수(get·poll·sleep·request)를
쓰지 않고 drain으로만 비운다. 화면과 주고받는 일은 apc_runtime의 request·emit·get·poll·drain·notice·register_reset_hook만 쓴다.
라이선스: 사이트 소프트웨어(MIT, PD-26). Vite가 이 파일을 글자로 묶어 워커가 /apc에 넣는다.
"""

import apc_runtime

REQUEST_GREET = "hello.greet"
EVENT_WAVE = "hello.wave"
NAME_VALUE = "hello.name"
CLICKS_CHANNEL = "hello.clicks"


def greet(name="친구"):
    """화면에 인사말을 부탁하고 답을 기다린다(대기 지점). [정지]를 누르면 여기서 KeyboardInterrupt."""
    return apc_runtime.request(REQUEST_GREET, {"name": str(name)})


def wave(count=1):
    """화면 패널에 손을 흔든다(답을 기다리지 않음, 제한 모드에서도 됨)."""
    apc_runtime.emit(EVENT_WAVE, {"count": int(count)})


def name(default=""):
    """패널 입력칸의 최신 값(입력 확인 지점)."""
    value = apc_runtime.get(NAME_VALUE, default)
    return default if value is None or value == "" else str(value)


def clicks():
    """패널 [누르기]를 누른 기록(누른 순서대로 번호 목록). 꺼내면 비워진다(입력 확인 지점)."""
    return [int(value) for value in apc_runtime.poll(CLICKS_CHANNEL)]


def _reset():
    """실행이 시작될 때 이전 실행의 누른 기록을 버린다(동기 진입점 — drain만 쓴다)."""
    apc_runtime.drain(CLICKS_CHANNEL)


apc_runtime.register_reset_hook(_reset)
