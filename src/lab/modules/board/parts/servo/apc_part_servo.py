"""가상 서보모터 부품의 파이썬 쪽 — 각도 환산 프로필 알리기(PLAN §6.1 PD-15, §8.3 P3-03, src/lab/README.md 7.5). 화면 쪽은 같은 폴더의 part.ts.

서보모터는 핀의 PWM 펄스 폭으로 각도를 정한다. 화면(part.ts)은 board.state 핀 항목의 duty·freq로 펄스 폭을 계산하고 프로필로 각도를 그린다.
교과서 자료에는 같은 각도에 다른 duty를 보내는 라이브러리가 두 가지 있다(INVENTORY §4.2 "서보 duty 매핑").
    servo_library(원고 2-2-4, f078~f081)          int(40 + angle / 180 × 75)            → 프로필 servo40(duty 40 = 0°, 115 = 180°)
    mg90s_servo·gorillacell_servo(f012·f003, 4단원) map(angle, 0, 180, 23, 124)             → 프로필 mg90s(duty 23 = 0°, 124 = 180°, 기본값)
PD-15는 "각 예제가 원고 의도대로 0·90·180°를 가리키게" 예제마다 프로필을 두기로 했다. 배선 표(WiringEntry)에는 아직 부품 옵션 칸이 없어서
(공유 파일 변경 요청 — 구역 A 보고서), 이 파일이 학생 코드가 **이번 실행에서 부른 서보 라이브러리**로 프로필을 정해 화면에 알린다:
- apc_board.register_board_module(라이브러리 이름, 불러오기 함수)로 학생 코드의 `from servo_library import ServoMotor`를 받아, 진짜 파일
  (/board/lib/servo_library.py — 보드 라이브러리 폴더, 학생 작업 폴더에 같은 이름 파일이 있으면 그 파일)을 importlib로 불러 그대로 돌려준다.
- 불러오면 배선의 서보마다 apc_board.set_device_state(배선 id, 'servo', {'profile': 'servo40', 'library': 'servo_library'})를 보낸다(board.device).
- 실행마다 보드를 새로 켜므로 알림도 새로 한다(화면은 reset 때 장치 상태를 비운다). 라이브러리를 부르지 않은 코드(PWM duty를 직접 쓰는 코드)는
  알림이 없어 화면이 기본 프로필 mg90s를 쓴다.
- 파일이 없으면 원래와 같은 ModuleNotFoundError(표 NOT_YET_MODULES에 있는 이름이면 한국어 안내가 든 것)를 낸다.
훅 규칙(README 4.4): 불러오기 함수는 학생 코드의 import 자리에서 불리므로 양보해도 되지만, 여기서는 양보하는 함수를 쓰지 않는다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import importlib

import apc_board
import apc_runtime

__all__ = ["LIBRARY_PROFILES", "SERVO_PART_ID", "current_profile"]

SERVO_PART_ID = "servo"

#: 서보 라이브러리 import 이름 → 각도 환산 프로필 id(part.ts의 SERVO_PROFILES와 같은 이름)
LIBRARY_PROFILES = {
    "servo_library": "servo40",
    "mg90s_servo": "mg90s",
    "gorillacell_servo": "mg90s",
}

_state = {"profile": None, "library": None}


def current_profile():
    """이번 실행에서 알린 (프로필, 라이브러리) — 부르지 않았으면 (None, None)"""
    return _state["profile"], _state["library"]


def _reset():
    _state["profile"] = None
    _state["library"] = None


class _ServoDevice:
    """배선의 서보 하나(각도는 화면이 핀 신호로 계산하므로 배선 항목만 든다)"""

    __slots__ = ("entry",)

    def __init__(self, entry):
        self.entry = entry


def _factory(entry):
    return _ServoDevice(entry)


def _publish():
    profile, library = current_profile()
    if profile is None:
        return
    for entry, _device in apc_board.wired_devices(SERVO_PART_ID):
        apc_board.set_device_state(entry["id"], SERVO_PART_ID, {"profile": profile, "library": library})


def _loader(name):
    def load():
        try:
            module = importlib.import_module(name)
        except ModuleNotFoundError as error:
            if error.name == name and name in apc_board.NOT_YET_MODULES:
                raise ModuleNotFoundError(apc_board.not_yet_module_message(name), name=name) from None
            raise
        if _state["library"] != name:
            _state["profile"] = LIBRARY_PROFILES[name]
            _state["library"] = name
            _publish()
        return module

    return load


for _name in LIBRARY_PROFILES:
    apc_board.register_board_module(_name, _loader(_name))
apc_board.register_part(SERVO_PART_ID, _factory)
apc_runtime.register_reset_hook(_reset)
