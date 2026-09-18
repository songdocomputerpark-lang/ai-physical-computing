"""부품 흉내: 보드 안 블루투스(BLE)와 **상대 기기(스마트폰·컴퓨터)** — 화면의 조작 칸과 가상 BLE 무선을 잇는 다리.
PLAN §6.2 "BLE 주변기기(Nordic UART Service) — Phase 4", §8.4 P4-03, src/lab/README.md 7.5. 화면 쪽은 같은 폴더의 part.ts.

블루투스 자체(GATT·광고·IRQ)는 machine 확장 `apc_board_ble.py`가 맡고, 이 파일은 그 상태를 화면(`board.device`)에 보내고
화면 조작(`board.device.input`)을 무선에 넘기기만 한다.

화면 → 파이썬(`board.device.input`의 data, 모양은 part.ts·ble-state.ts와 같아야 한다)
    {'kind': 'connect'}                        상대 기기가 연결(IRQ 1)
    {'kind': 'disconnect'}                     연결 끊기(IRQ 2)
    {'kind': 'write', 'bytes': [72, 73]}       상대 기기가 RX 특성에 쓰기(IRQ 3). 연결이 없으면 먼저 연결한다
    {'kind': 'refresh'}                        지금 상태를 다시 보내 달라

파이썬 → 화면(`board.device` state): apc_board_ble.RADIO.state() 그대로.

배선의 핀(`led`, 기본 GPIO12)은 **보드 라이브러리 ESP32BLE.py가 연결 상태를 보여 주려고 쓰는 LED**다. 블루투스 무선 자체는
ESP32 안에 있어 선이 필요 없다(part.ts의 설명·그림에도 그렇게 적는다). esp32_ble_util.py를 쓰는 예제(f002)는 이 LED를 쓰지 않는다.

라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import apc_board
import apc_board_ble
import apc_runtime

__all__ = ["PART_ID", "BlePeer"]

PART_ID = apc_board_ble.PART_ID


class BlePeer:
    """배선의 블루투스 칸 하나(실행마다 새로 — apc_board.register_part factory)"""

    def __init__(self, entry):
        self.entry = entry
        self.id = entry["id"]
        apc_board.on_device_input(self.id, self._on_input)
        apc_board_ble.attach_view(self)
        self.publish()

    def _on_input(self, data):
        """화면 조작(입력 확인 지점에서 불린다 — 양보 금지)"""
        if not isinstance(data, dict):
            return
        kind = data.get("kind")
        radio = apc_board_ble.RADIO
        if kind == "connect":
            radio.connect()
        elif kind == "disconnect":
            radio.disconnect()
        elif kind == "write":
            raw = data.get("bytes")
            if not isinstance(raw, list):
                return
            payload = bytes(int(value) & 0xFF for value in raw if isinstance(value, int) and not isinstance(value, bool))
            radio.write_from_peer(payload)
        self.publish()

    def publish(self):
        apc_board.set_device_state(self.id, PART_ID, apc_board_ble.RADIO.state())


def factory(entry):
    return BlePeer(entry)


_ready = False


def _tick():
    """실행마다 한 번 배선의 블루투스 칸을 만들어 둔다 — 학생 코드가 블루투스를 켜기 전에도 [연결] 단추가 듣게. 양보 금지."""
    global _ready
    if _ready:
        return
    _ready = True
    apc_board.wired_devices(PART_ID)


def _reset():
    global _ready
    _ready = False


apc_board.register_part(PART_ID, factory)
apc_runtime.register_reset_hook(_reset)
apc_runtime.register_tick_hook(_tick)
