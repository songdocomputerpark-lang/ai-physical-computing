"""부품 흉내: USB-UART 변환기와 컴퓨터 시리얼 창 — 보드 UART와 가상 선으로 이어진 "컴퓨터 쪽"(PLAN §6.2 "UART2 상대 장치 — 송신 패널",
§7.3 USB 시리얼, CODE_MAPPING §2.3·§2.8 f001·f007·f082, §6.1 U1~U5). 화면 쪽은 같은 폴더의 part.ts(그림·송신 패널).

실물 구성(원고 3단원 187쪽 "USB to UART 변환기"): 컴퓨터 USB ↔ 변환기 ↔ 보드 UART2 핀. 교차 연결이라 역할 이름은 변환기 쪽 이름이다 —
rx(변환기가 받는 핀) ← 보드 TX(17), tx(변환기가 보내는 핀) → 보드 RX(16). 화면의 송신 패널이 컴퓨터의 시리얼 프로그램 역할을 한다.

하는 일
- 보드가 TX로 보낸 바이트(uart.write)를 받아 화면의 "받은 글자" 칸에 보인다(최근 512바이트와 모두 받은 수).
- 화면 송신 패널이 보낸 글자·바이트('board.device.input' {kind: 'send', bytes: [...], baud})를 입력 확인 지점에서 변환기 TX 핀으로 보낸다
  (apc_board_uart.deliver — 그 핀을 RX로 쓰는 UART의 받을 칸에 쌓인다). 받는 UART가 없으면 한 번 알린다.
- 속도: 패널에서 '자동'(보드 UART와 같게 — 실물 시리얼 프로그램은 직접 맞춰야 함) 또는 9600·115200bps를 고른다. 다르면 가상 선이 비트 단위로 깨뜨린다.
- 실행 전에 보낸 것은 사라진다(보드가 켜지기 전에 보낸 글자를 받을 곳이 없음 — apc_board.on_device_input 규칙).

화면에 보내는 상태('board.device' state): {v, choice: 'auto'|9600|…, baud: 지금 쓰는 속도(자동이고 이어진 UART가 없으면 null), boardBaud,
rxTotal(보드에서 받은 바이트 수), rxTail(최근 받은 바이트 목록, 최대 512), txTotal(보낸 바이트 수), lastSend{bytes, reached}|null, mismatch(속도가 달랐는지)}
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import apc_board
import apc_board_uart

__all__ = ["BAUD_CHOICES", "PART_ID", "RX_TAIL", "UsbUartBridge"]

PART_ID = "uart"
#: 화면 "받은 글자" 칸에 보내는 최근 바이트 수
RX_TAIL = 512
#: 패널에서 고를 수 있는 속도(bps) — 교과서 예제가 쓰는 9600(HW·MP3)·115200(3단원)과 흔한 값
BAUD_CHOICES = (9600, 19200, 38400, 57600, 115200)


class UsbUartBridge:
    """배선의 USB-UART 변환기 하나(실행마다 새로 — apc_board.register_part factory)"""

    SERIAL_RX_ROLE = "rx"
    SERIAL_TX_ROLE = "tx"

    def __init__(self, entry):
        self.entry = entry
        self.id = entry["id"]
        self.pins = entry.get("pins", {})
        self.choice = "auto"
        self.rx_tail = bytearray()
        self.rx_total = 0
        self.tx_total = 0
        self.last_send = None
        self.mismatch = False
        apc_board.on_device_input(self.id, self._on_input)
        self.publish()

    # ── 속도 ──

    def _board_settings(self):
        """이 변환기와 이어진 보드 UART의 설정(받는 쪽 → 보내는 쪽 순서로 찾음). 없으면 None"""
        rx_pin = self.pins.get(self.SERIAL_RX_ROLE)
        tx_pin = self.pins.get(self.SERIAL_TX_ROLE)
        found = apc_board_uart.uart_on_tx_pin(rx_pin) if rx_pin is not None else None
        if found is None and tx_pin is not None:
            found = apc_board_uart.uart_on_rx_pin(tx_pin)
        return found

    def serial_settings(self):
        if self.choice == "auto":
            board = self._board_settings()
            return dict(board) if board is not None else dict(apc_board_uart.SERIAL_DEFAULT)
        settings = dict(apc_board_uart.SERIAL_DEFAULT)
        settings["baudrate"] = int(self.choice)
        return settings

    # ── 선 ──

    def serial_receive(self, data, info):
        self.rx_total += len(data)
        self.rx_tail += data
        if len(self.rx_tail) > RX_TAIL:
            del self.rx_tail[: len(self.rx_tail) - RX_TAIL]
        self.mismatch = not info.get("matched", True)
        self.publish()

    # ── 화면 송신 패널 ──

    def _on_input(self, data):
        if not isinstance(data, dict):
            return
        choice = data.get("baud")
        if choice == "auto" or (isinstance(choice, int) and not isinstance(choice, bool) and choice > 0):
            self.choice = choice
        if data.get("kind") != "send":
            self.publish()
            return
        raw = data.get("bytes")
        if not isinstance(raw, list):
            return
        payload = bytes(int(value) & 0xFF for value in raw if isinstance(value, int) and not isinstance(value, bool))
        pin = self.pins.get(self.SERIAL_TX_ROLE)
        reached = apc_board_uart.deliver(pin, payload, self.serial_settings()) if pin is not None else 0
        self.tx_total += len(payload)
        self.last_send = {"bytes": len(payload), "reached": reached}
        if reached == 0 and pin is not None:
            apc_board.BOARD.warn_once(
                ("usb-uart-nobody", self.id),
                f"시리얼 창에서 보낸 {len(payload)}바이트가 {pin}번 핀으로 갔지만, 이 핀을 받는 핀(RX)으로 쓰는 UART가 없어요. "
                f"코드의 UART(…, rx={pin})가 먼저 실행됐는지, rx 핀 번호가 배선도와 같은지 확인해요.",
            )
        self.publish()

    def publish(self):
        board = self._board_settings()
        settings = self.serial_settings() if (self.choice != "auto" or board is not None) else None
        apc_board.set_device_state(
            self.id,
            PART_ID,
            {
                "v": 1,
                "choice": self.choice,
                "baud": None if settings is None else settings["baudrate"],
                "boardBaud": None if board is None else board["baudrate"],
                "rxTotal": self.rx_total,
                "rxTail": list(self.rx_tail),
                "txTotal": self.tx_total,
                "lastSend": self.last_send,
                "mismatch": self.mismatch,
            },
        )


apc_board.register_part(PART_ID, UsbUartBridge)
