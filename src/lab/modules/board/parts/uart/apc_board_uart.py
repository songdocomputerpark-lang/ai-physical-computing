"""가상 ESP32 보드의 machine.UART와 가상 직렬 선(PLAN §8.3 P3-05, §6.2 "UART2 상대 장치", CODE_MAPPING §3.8.1·§6.2, src/lab/README.md 7.6).

학생 코드는 실물 보드와 똑같이 쓴다(ESP32 실습실에서만 — 보드가 첫 실행 직전에 이 파일을 불러와 machine에 UART를 더한다):

    from machine import UART, Pin
    uart = UART(2, baudrate=9600, tx=17, rx=16)   # 핀은 정수나 Pin(17) 모두
    uart.write('hello world')                      # TX 핀(17)에 이어진 부품(MP3 모듈·USB-UART 변환기)이 받는다
    if uart.any() > 0:                             # 입력 확인 지점 — 화면 송신 패널이 보낸 바이트가 여기서 들어온다
        data = uart.read()                         # bytes, 받은 것이 없으면 None

실물과 같게 맞춘 것(MicroPython v1.29.0 ports/esp32/machine_uart.c·machine_uart.h·extmod/machine_uart.c·py/stream.c,
ESP-IDF v5.5.1 components/esp_driver_uart/src/uart.c·hal/esp32/include/hal/uart_ll.h — 2026-09-18 원문 확인)
- UART 번호는 0~2(ESP32 UART_NUM_MAX 3). 그 밖은 ValueError('UART(3) does not exist'). 같은 번호는 같은 객체이고, UART(...)를 부를 때마다
  설정을 다시 하며 받은 바이트를 비운다(uart_flush_input). 처음이거나 deinit() 뒤면 기본값으로 돌아간다.
- 기본값: baudrate 115200, bits 8, parity None, stop 1, txbuf 256, rxbuf 256, timeout 0, timeout_char 0, invert 0, flow 0,
  핀 UART1 tx 10·rx 9, UART2 tx 17·rx 16(UART0은 REPL 핀 그대로 — repr은 tx=-1, rx=-1).
- 위치 인자는 baudrate·bits·parity·stop 순서, 나머지는 키워드만. 핀은 정수·Pin 모두(machine_pin_find), -1은 바꾸지 않음, 없는 번호는
  ValueError('invalid pin'). bits 5~8 밖 ValueError('invalid data bits'), stop 1·2 밖 ValueError('invalid stop bits'), parity는 None·0(짝수)·1(홀수).
- baudrate 0 이하는 무시, 나누개 규칙으로 못 만드는 속도는 OSError(1, 'ESP_FAIL')(찍히는 글 `OSError: [Errno 1] EPERM: ESP_FAIL`). repr의 baudrate는 실물처럼 나누개로 다시 계산한 값
  (80MHz × 16 ÷ ⌊80MHz × 16 ÷ 속도⌋ — 115200을 적으면 115201로 보인다).
- read()·read(-1): 받을 칸의 바이트를 모두(없으면 None). read(n): 한 번에 최대 n바이트(없으면 None). readline(): 줄바꿈(\\n)까지 또는
  지금까지(없으면 None). readinto(buf[, n]) → 넣은 바이트 수 또는 None. write(글자·bytes·bytearray[, 최대][, 시작, 최대]) → 보낸 바이트 수.
  any() → 받을 칸의 바이트 수. txdone() → 보내기가 끝났는지. flush() → 다 보낼 때까지 기다림. sendbreak(). deinit(). irq(handler, trigger, hard).
- timeout(ms)은 첫 바이트를, timeout_char(ms)는 다음 바이트를 기다리는 시간이다 — 가상 시계로 기다린다(기다리는 동안 입력 확인 지점).
- 받을 칸(링 버퍼)은 쌓인다: 두 글자가 한꺼번에 오면 read()가 한 번에 준다(PLAN §7.7). rxbuf + 하드웨어 FIFO 128바이트를 넘게 쌓이면 넘친 바이트는 버린다.
- 바이트가 선을 지나는 시간을 가상 시계로 센다(8N1이면 1바이트 = 10비트 — 9600bps에서 약 1.04ms). v1.29.0은 timeout_char가 0이면
  rx_full_threshold를 1로 두어 바이트마다 받을 칸에 넣으므로, 송신 패널이 "12"를 보내면 '2'는 '1'보다 약 1ms 늦게 들어온다(실물과 같은 모양).
- 보내는 쪽과 받는 쪽의 속도·비트 수·패리티·정지 비트가 다르면 신호를 비트 단위로 다시 읽어 실물처럼 깨진 바이트가 된다(reframe).
- UART0은 USB로 컴퓨터와 이어진 REPL 통로라 write()가 콘솔에 나온다. 버퍼 크기 바꾸기는 ValueError('REPL UART buffer size is fixed'),
  irq()는 ValueError('REPL UART does not support IRQs'). 읽기는 흉내 내지 않는다(콘솔 입력은 input()).
- Pin(17, Pin.OUT)처럼 UART가 쓰는 핀을 Pin()으로 다시 정하면 실물처럼 그 핀의 UART 신호가 끊긴다(보낸 바이트가 부품에 닿지 않음 — 한 번 알림).

가상 직렬 선(부품 흉내가 쓰는 도구 — src/lab/README.md 7.10, 이 구역의 api_for_others)
- 보드 → 부품: UART.write가 TX 핀에 이어진 장치 가운데 serial_receive(data, info) 메서드가 있고 배선의 SERIAL_RX_ROLE(기본 'rx') 핀이 그 TX 핀인
  장치에 바이트를 준다. info = {'uart': 번호, 'pin': GPIO, 'settings': 보낸 쪽 설정, 'matched': 설정이 같았는지}.
- 부품 → 보드: deliver(gpio, data, settings=None)가 그 핀을 RX로 쓰는 UART의 받을 칸에 넣는다(설정이 다르면 깨짐). 받은 UART 수를 돌려준다.
- uart_on_rx_pin(gpio)·uart_on_tx_pin(gpio) → 그 핀을 쓰는 UART의 설정 사전(없으면 None) — 송신 패널의 "보드와 같은 속도" 자동 맞춤에 쓴다.
- 설정 사전 모양: {'baudrate': 9600, 'bits': 8, 'parity': None|0|1, 'stop': 1}. 부품의 기본값은 SERIAL_DEFAULT(9600 8N1).

동기 진입점 규칙(PROGRESS 미해결 25번): 초기화 훅(_reset)은 양보하지 않는다. 기다리는 곳(read·readline·flush)은 apc_board.wait_ns로만 기다린다.
라이선스: 사이트 소프트웨어(MIT, PD-26). MicroPython·ESP-IDF 코드는 옮기지 않고 동작·문구·값만 맞췄다.
"""

import sys

import apc_board
import apc_runtime

__all__ = [
    "IRQ_BREAK",
    "IRQ_RX",
    "IRQ_RXIDLE",
    "SERIAL_DEFAULT",
    "UART",
    "UART_NUM_MAX",
    "char_bits",
    "char_time_ns",
    "deliver",
    "reframe",
    "same_settings",
    "uart_on_rx_pin",
    "uart_on_tx_pin",
]

#: ESP32의 UART 수(ESP-IDF UART_NUM_MAX)
UART_NUM_MAX = 3
#: REPL(USB로 Thonny와 이어진 통로)이 쓰는 UART(ports/esp32/uart.h MICROPY_HW_UART_REPL)와 그 속도
REPL_UART = 0
REPL_BAUD = 115200
#: 핀을 바꾸지 않음(UART_PIN_NO_CHANGE)
PIN_NO_CHANGE = -1
#: 번호별 기본 (tx, rx) — ports/esp32/machine_uart.h(v1.29.0). UART0은 하드웨어 기본 배선(GPIO1·3)을 바꾸지 않는다.
DEFAULT_PINS = {0: (PIN_NO_CHANGE, PIN_NO_CHANGE), 1: (10, 9), 2: (17, 16)}
#: 하드웨어 FIFO 크기(ESP32 UART_HW_FIFO_LEN)
HW_FIFO_LEN = 128
DEFAULT_BUFFER = 256
#: UART 클럭(ESP32의 UART_SCLK_DEFAULT = APB 80MHz)과 정수 나누개 최댓값(UART_CLKDIV_V, 20비트)
APB_CLK_HZ = 80_000_000
CLKDIV_INT_MAX = 0xFFFFF
#: irq trigger 값(machine_uart.c: 1 << UART_DATA, 0x1000, 1 << UART_BREAK — ESP-IDF uart_event_type_t 순서)
IRQ_RX = 1
IRQ_RXIDLE = 0x1000
IRQ_BREAK = 2
_IRQ_ALLOWED = IRQ_RX | IRQ_RXIDLE | IRQ_BREAK
#: 선 반전·흐름 제어 상수(ESP-IDF hal/uart_types.h v5.5.1: UART_SIGNAL_TXD_INV 1<<5, RXD 1<<2, RTS 1<<6, CTS 1<<3 / UART_HW_FLOWCTRL_RTS 1, CTS 2)
INV_TX = 1 << 5
INV_RX = 1 << 2
INV_RTS = 1 << 6
INV_CTS = 1 << 3
_INV_MASK = INV_TX | INV_RX | INV_RTS | INV_CTS
FLOW_RTS = 1
FLOW_CTS = 2
#: IRQ_RXIDLE 최소 대기(machine_uart.c RXIDLE_TIMER_MIN 500µs)
RXIDLE_MIN_NS = 500_000

#: 부품 흉내의 기본 선 설정(DFPlayer·USB-UART 변환기 기본 9600bps 8N1)
SERIAL_DEFAULT = {"baudrate": 9600, "bits": 8, "parity": None, "stop": 1}

_PARITY_NAME = ("None", "1", "0")  # machine_uart.c _parity_name: self->parity 0 없음, 1 홀수, 2 짝수
_MISSING = object()


# ───────────────────────── 선 설정·비트 단위 다시 읽기 ─────────────────────────


def _normalize_settings(settings):
    """부품이 넘긴 설정 사전 → 빠진 칸은 SERIAL_DEFAULT로 채운 사전"""
    result = dict(SERIAL_DEFAULT)
    if isinstance(settings, dict):
        for key in ("baudrate", "bits", "parity", "stop"):
            if key in settings:
                result[key] = settings[key]
    result["baudrate"] = int(result["baudrate"]) if result["baudrate"] else SERIAL_DEFAULT["baudrate"]
    result["bits"] = int(result["bits"])
    result["stop"] = int(result["stop"])
    parity = result["parity"]
    result["parity"] = None if parity is None else (int(parity) & 1)
    return result


def char_bits(settings):
    """글자 하나가 선을 지날 때의 비트 수: 시작 1 + 데이터 + 패리티(있으면 1) + 정지"""
    s = _normalize_settings(settings)
    return 1 + s["bits"] + (0 if s["parity"] is None else 1) + s["stop"]


def char_time_ns(settings):
    """글자 하나가 선을 지나는 시간(나노초)"""
    s = _normalize_settings(settings)
    return char_bits(s) * 1_000_000_000 // max(1, s["baudrate"])


def same_settings(a, b):
    a = _normalize_settings(a)
    b = _normalize_settings(b)
    return a["baudrate"] == b["baudrate"] and a["bits"] == b["bits"] and a["parity"] == b["parity"] and a["stop"] == b["stop"]


def _parity_bit(value, bits, odd):
    ones = bin(value & ((1 << bits) - 1)).count("1")
    return (ones + (1 if odd else 0)) & 1


def reframe(data, tx_settings, rx_settings):
    """보내는 쪽 설정으로 만든 선 신호를 받는 쪽 설정으로 다시 읽는다(속도·비트 수가 다르면 실물처럼 깨진 바이트).
    같으면 그대로. 받는 쪽은 선이 1(쉼)에서 0으로 떨어지는 곳을 시작 비트로 잡고 각 비트의 가운데를 읽는다. 정지 비트가 0이어도(프레임 오류) 바이트는
    받을 칸에 남는다(ESP-IDF v5.5.1 uart.c의 UART_INTR_FRAM_ERR는 알림만 하고 FIFO를 비우지 않는다)."""
    data = bytes(data)
    if same_settings(tx_settings, rx_settings) or not data:
        return data
    tx = _normalize_settings(tx_settings)
    rx = _normalize_settings(rx_settings)
    levels = []
    for byte in data:
        levels.append(0)
        for k in range(tx["bits"]):
            levels.append((byte >> k) & 1)
        if tx["parity"] is not None:
            levels.append(_parity_bit(byte, tx["bits"], tx["parity"] == 1))
        levels.extend([1] * tx["stop"])
    total = len(levels)
    tx_bit = 1_000_000_000 / tx["baudrate"]
    rx_bit = 1_000_000_000 / rx["baudrate"]

    def level_at(t):
        index = int(t // tx_bit)
        return 1 if index < 0 or index >= total else levels[index]

    out = bytearray()
    t = 0.0
    end = total * tx_bit
    rx_parity = 0 if rx["parity"] is None else 1
    while t < end:
        index = int(t // tx_bit)
        start = None
        while index < total:
            if levels[index] == 0 and (index == 0 or levels[index - 1] == 1):
                edge = index * tx_bit
                if edge >= t:
                    start = edge
                    break
            index += 1
        if start is None:
            break
        if level_at(start + rx_bit / 2) != 0:
            t = start + rx_bit / 2
            continue
        value = 0
        for k in range(rx["bits"]):
            value |= level_at(start + (1.5 + k) * rx_bit) << k
        stop_at = start + (1.5 + rx["bits"] + rx_parity) * rx_bit
        out.append(value)
        t = stop_at
    return bytes(out)


# ───────────────────────── 실행마다 비우는 표 ─────────────────────────

#: 번호 → UART 객체(실행마다 새로 — 실물의 soft reset이 machine_uart_deinit_all로 모두 푸는 것과 같다)
_uarts = {}


def _reset():
    for uart in list(_uarts.values()):
        uart._installed = False
    _uarts.clear()


apc_runtime.register_reset_hook(_reset)


def _tick():
    """입력 확인 지점마다(양보 금지): 받기가 멈춘 UART의 IRQ_RXIDLE을 콜백 대기열에 넣는다."""
    for uart in _active_uarts():
        uart._service_idle_irq()


apc_runtime.register_tick_hook(_tick)


def _active_uarts():
    return [uart for uart in _uarts.values() if uart._installed]


def uart_on_rx_pin(gpio):
    """그 핀을 RX로 쓰는(설치된) UART의 설정 사전. 없으면 None"""
    for uart in _active_uarts():
        if uart._rx_pin() == gpio:
            return uart._settings()
    return None


def uart_on_tx_pin(gpio):
    """그 핀을 TX로 쓰는(설치된) UART의 설정 사전. 없으면 None"""
    for uart in _active_uarts():
        if uart._tx_pin() == gpio:
            return uart._settings()
    return None


def deliver(gpio, data, settings=None, at_ns=None):
    """부품의 TX 선(board 핀 gpio)으로 바이트를 보낸다. 그 핀을 RX로 쓰는 UART마다 받을 칸에 넣고(설정이 다르면 깨짐) 받은 UART 수를 돌려준다.
    at_ns: 보내기 시작한 가상 시각(나노초). 부품이 "사실은 조금 전에 보냈어야 할" 응답(곡이 끝난 순간의 알림 등)을 긴 sleep 뒤에 알아챘을 때 그 시각을 준다
    (없으면 지금). 입력 확인 지점(부품의 on_device_input 처리 함수·틱 훅)에서 불러도 된다 — 양보하지 않는다."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    payload = bytes(data)
    count = 0
    for uart in _active_uarts():
        if uart._rx_pin() == gpio and uart._rx_connected():
            uart._receive(payload, _normalize_settings(settings), at_ns)
            count += 1
    return count


# ───────────────────────── machine.UART ─────────────────────────


def _pin_arg(value):
    """tx·rx·rts·cts 인자: -1(바꾸지 않음) 또는 핀 번호(정수·Pin — machine_pin_find, 없는 번호는 ValueError('invalid pin'))"""
    if isinstance(value, int) and not isinstance(value, bool) and value == PIN_NO_CHANGE:
        return PIN_NO_CHANGE
    return apc_board.find_pin(value)


def _esp_fail():
    """check_esp_err(ESP_FAIL) 모양의 OSError — args == (1, 'ESP_FAIL'), 찍히는 글은 실물과 같은 `[Errno 1] EPERM: ESP_FAIL`.

    근거(v1.29.0): ports/esp32/mphalport.c check_esp_err_가 ESP_FAIL(-1)을 번호 1과 esp_err_to_name 글('ESP_FAIL' — ESP32는
    MICROPY_ERROR_REPORTING_NORMAL)로 OSError(1, 'ESP_FAIL')를 만들고, py/objexcept.c mp_obj_exception_print가 번호 1을 errno 이름표
    (MICROPY_PY_ERRNO_ERRORCODE — EPERM)로 바꿔 "[Errno 1] EPERM: ESP_FAIL"로 찍는다. Pyodide가 번호로 하위 클래스를 고르지 않게
    apc_board.board_oserror처럼 빈 OSError에 errno·strerror(찍히는 글)·args를 따로 넣는다."""
    error = OSError()
    error.errno = 1
    error.strerror = "EPERM: ESP_FAIL"
    error.args = (1, "ESP_FAIL")
    return error


def _actual_baudrate(requested):
    """ESP32 나누개 규칙(uart_ll_set_baudrate·get_baudrate)으로 실제 속도를 계산한다. 못 만들면 None"""
    clk_div = (APB_CLK_HZ << 4) // requested
    if clk_div >> 4 > CLKDIV_INT_MAX or clk_div == 0:
        return None
    return (APB_CLK_HZ << 4) // clk_div


class _UartIrq:
    """uart.irq()가 돌려주는 객체(shared/runtime/mpirq.c): flags()·trigger([값]), 부르면 처리 함수를 한 번 부른다."""

    def __init__(self, uart):
        self._uart = uart
        self.handler = None
        self.trigger_mask = 0
        self.flags_value = 0

    def flags(self):
        return self.flags_value

    def trigger(self, *args):
        if len(args) > 1:
            raise TypeError(f"function expected at most 2 arguments, got {len(args) + 1}")
        previous = self.trigger_mask
        if args:
            self.trigger_mask = apc_board.mp_int(args[0])
        return previous

    def __call__(self):
        if self.handler is not None:
            self.handler(self._uart)


class UART:
    """machine.UART(id, baudrate=115200, bits=8, parity=None, stop=1, *, tx, rx, rts, cts, txbuf, rxbuf, timeout, timeout_char, invert, flow)"""

    INV_TX = INV_TX
    INV_RX = INV_RX
    INV_RTS = INV_RTS
    INV_CTS = INV_CTS
    RTS = FLOW_RTS
    CTS = FLOW_CTS
    IRQ_RX = IRQ_RX
    IRQ_RXIDLE = IRQ_RXIDLE
    IRQ_BREAK = IRQ_BREAK

    def __new__(cls, *args, **kwargs):
        if not args:
            raise TypeError("function missing 1 required positional arguments")
        uart_num = apc_board.mp_int(args[0])
        if uart_num < 0 or uart_num >= UART_NUM_MAX:
            raise ValueError(f"UART({uart_num}) does not exist")
        existing = _uarts.get(uart_num)
        if existing is not None:
            return existing
        uart = object.__new__(cls)
        uart._num = uart_num
        uart._installed = False
        uart._baud = REPL_BAUD
        uart._bits = 8
        uart._parity = 0
        uart._stop = 1
        uart._tx = PIN_NO_CHANGE
        uart._rx = PIN_NO_CHANGE
        uart._rts = PIN_NO_CHANGE
        uart._cts = PIN_NO_CHANGE
        uart._txbuf = DEFAULT_BUFFER
        uart._rxbuf = DEFAULT_BUFFER
        uart._timeout = 0
        uart._timeout_char = 0
        uart._invert = 0
        uart._flow = 0
        uart._rx_queue = []  # [(도착 가상 시각 ns, 바이트)] — 도착 순서
        uart._rx_line_free_ns = 0
        uart._tx_free_ns = 0
        uart._claims = {}  # gpio → 핀을 잡았을 때의 모습(Pin()으로 다시 정했는지 보려고)
        uart._irq = None
        uart._irq_pending_idle = False
        uart._last_rx_ns = 0
        uart._warned = set()
        _uarts[uart_num] = uart
        return uart

    def __init__(self, *args, **kwargs):
        self._init_helper(args[1:], kwargs)

    # ── 설정 ──

    def init(self, *args, **kwargs):
        self._init_helper(args, kwargs)

    def _is_repl(self):
        return self._num == REPL_UART

    def _init_helper(self, args, kwargs):
        names = ("baudrate", "bits", "parity", "stop")
        keyword_only = ("tx", "rx", "rts", "cts", "txbuf", "rxbuf", "timeout", "timeout_char", "invert", "flow")
        if len(args) > len(names):
            raise TypeError("extra positional arguments given")
        values = dict(zip(names, args))
        for key, value in kwargs.items():
            if key not in names and key not in keyword_only:
                raise TypeError(f"unexpected keyword argument '{key}'")
            if key in values:
                raise TypeError(f"argument '{key}' given twice")
            values[key] = value
        baudrate = apc_board.mp_int(values.get("baudrate", 0))
        bits = apc_board.mp_int(values.get("bits", 0))
        stop = apc_board.mp_int(values.get("stop", 0))
        txbuf = apc_board.mp_int(values.get("txbuf", -1))
        rxbuf = apc_board.mp_int(values.get("rxbuf", -1))
        timeout = apc_board.mp_int(values.get("timeout", -1))
        timeout_char = apc_board.mp_int(values.get("timeout_char", -1))
        invert = apc_board.mp_int(values.get("invert", -1))
        flow = apc_board.mp_int(values.get("flow", -1))

        fresh = not self._installed
        if fresh:
            # 처음이거나 deinit() 뒤: 기본값으로(machine_uart.c "freshly initialised")
            self._bits = 8
            self._parity = 0
            self._stop = 1
            self._rts = PIN_NO_CHANGE
            self._cts = PIN_NO_CHANGE
            self._txbuf = DEFAULT_BUFFER
            self._rxbuf = DEFAULT_BUFFER
            self._timeout = 0
            self._timeout_char = 0
            self._invert = 0
            self._flow = 0
            self._tx, self._rx = DEFAULT_PINS[self._num]
            self._baud = REPL_BAUD
        if (txbuf >= 0 and txbuf != self._txbuf) or (rxbuf >= 0 and rxbuf != self._rxbuf):
            if self._is_repl():
                raise ValueError("REPL UART buffer size is fixed")
            if txbuf >= 0:
                self._txbuf = txbuf
            if rxbuf >= 0:
                self._rxbuf = rxbuf
            # 버퍼 크기를 바꾸려면 드라이버를 다시 설치한다 — 속도·비트·패리티·정지 비트는 그대로 둔다(machine_uart.c)
        if not self._is_repl() and (fresh or txbuf >= 0 or rxbuf >= 0):
            # uart_driver_install: rx 버퍼는 FIFO(128)보다 커야 하고, tx 버퍼는 0이거나 128보다 커야 한다(ESP-IDF uart.c "buffer length error")
            if self._rxbuf <= HW_FIFO_LEN or not (self._txbuf == 0 or self._txbuf > HW_FIFO_LEN):
                self._installed = False
                raise _esp_fail()
        self._installed = True
        if baudrate > 0:
            if _actual_baudrate(baudrate) is None:
                raise _esp_fail()
            self._baud = baudrate
            if self._is_repl() and baudrate != REPL_BAUD:
                self._warn_once(
                    "repl-baud",
                    "UART0은 USB로 컴퓨터(Thonny)와 이어진 통로예요. 실물 보드에서 속도를 바꾸면 Thonny 화면이 깨지거나 연결이 끊겨요. "
                    "부품과 주고받을 때는 UART2를 써요.",
                )
        tx = self._tx if "tx" not in values else _pin_arg(values["tx"])
        rx = self._rx if "rx" not in values else _pin_arg(values["rx"])
        rts = self._rts if "rts" not in values else _pin_arg(values["rts"])
        cts = self._cts if "cts" not in values else _pin_arg(values["cts"])
        if tx >= apc_board.FIRST_INPUT_ONLY_GPIO:
            # uart_set_pin: TX는 출력이 되는 핀이어야 한다("tx_io_num error" → ESP_FAIL)
            raise _esp_fail()
        self._tx, self._rx, self._rts, self._cts = tx, rx, rts, cts
        if bits != 0:
            if bits not in (5, 6, 7, 8):
                raise ValueError("invalid data bits")
            self._bits = bits
        if "parity" in values:
            parity = values["parity"]
            if parity is None:
                self._parity = 0
            else:
                self._parity = 1 if apc_board.mp_int(parity) & 1 else 2
        if stop != 0:
            if stop not in (1, 2):
                raise ValueError("invalid stop bits")
            self._stop = stop
        if timeout != -1:
            self._timeout = timeout & 0xFFFF
        if timeout_char != -1:
            self._timeout_char = timeout_char & 0xFFFF
        if invert != -1:
            if invert & ~_INV_MASK:
                raise ValueError("invalid inversion mask")
            self._invert = invert
        if flow != -1:
            if flow & ~(FLOW_RTS | FLOW_CTS):
                raise ValueError("invalid flow control mask")
            self._flow = flow
        if self._invert:
            self._warn_once("invert", "가상 보드는 UART 선 반전(invert)을 흉내 내지 않아요. 실물 보드에서 확인해요.")
        if self._flow:
            self._warn_once("flow", "가상 보드는 하드웨어 흐름 제어(RTS·CTS)를 흉내 내지 않아요. 실물 보드에서 확인해요.")
        # 설정을 바꾸면 전에 받은 바이트를 버린다(uart_flush_input)
        self._rx_queue = []
        self._connect_pins()

    def deinit(self):
        # uart_driver_delete(REPL UART는 지우지 않는다). 핀 연결 기록은 남는다(실물도 deinit이 핀을 되돌리지 않는다).
        if not self._is_repl():
            self._installed = False
        self._rx_queue = []

    # ── 핀 ──

    def _tx_pin(self):
        return self._tx if self._tx != PIN_NO_CHANGE else None

    def _rx_pin(self):
        return self._rx if self._rx != PIN_NO_CHANGE else None

    def _connect_pins(self):
        """UART 신호를 핀에 잇는다(uart_set_pin): TX는 GPIO 행렬로 이은 출력(쉴 때 1 — 핀 표에는 "출력(읽기 꺼짐)"), RX는 입력(풀업 없음 —
        ESP-IDF v5.5.1 uart_set_pin은 gpio_input_enable만 한다). 핀 표에 보이게 보드 상태를 고치고, 배선 안내는 UART 전용 문장으로 한다."""
        if self._is_repl() or not self._installed:
            return
        board = apc_board.BOARD
        self._claims = {}
        for gpio, output in ((self._tx_pin(), True), (self._rx_pin(), False)):
            if gpio is None:
                continue
            state = board.state(gpio)
            before = board.pad_level(gpio)
            state.pwm = None
            if output:
                # MODE_DEF_OUTPUT(2)는 Pin()이 만들 수 없는 모드라, 학생이 Pin(17, Pin.OUT)으로 다시 정하면 알아챌 수 있다
                state.mode = apc_board.MODE_DEF_OUTPUT
                state.out = 1
                board.warn_special_output(gpio)
            else:
                state.mode = apc_board.MODE_IN
            after = board.pad_level(gpio)
            if after != before:
                board.edge(gpio, before, after)
            self._claims[gpio] = "tx" if output else "rx"
            board.mark_dirty()
        self._check_wiring()
        # 선에 이어진 부품 흉내(MP3 모듈·USB-UART 변환기)를 지금 만든다 — 화면 송신 패널이 보낸 바이트를 받을 처리 함수가 이때 등록된다
        apc_board.wired_devices()

    def _pin_connected(self, gpio, role):
        """UART가 잡은 핀을 Pin()이나 PWM으로 다시 정하지 않았는지. 실물: Pin()은 핀을 GPIO 기능으로 되돌려(esp_rom_gpio_pad_select_gpio) TX 신호가
        끊기고, RX는 입력이 켜져 있는 동안은 계속 받는다. 끊겼으면 한 번 알린다."""
        if gpio is None or self._claims.get(gpio) != role:
            return False
        state = apc_board.BOARD.pins.get(gpio)
        if state is None:
            return False
        if role == "tx":
            connected = state.mode == apc_board.MODE_DEF_OUTPUT and state.pwm is None
        else:
            connected = state.mode == apc_board.MODE_IN and state.pwm is None
        if not connected:
            name = "TX(보내는 핀)" if role == "tx" else "RX(받는 핀)"
            self._warn_once(
                ("pin-taken", gpio),
                f"UART{self._num}의 {name}인 {gpio}번 핀을 Pin()이나 PWM으로 다시 정해서 그 핀의 UART 신호가 끊겼어요(실물 보드도 같아요). "
                f"UART({self._num}, …)를 다시 만들면 이어져요.",
            )
        return connected

    def _rx_connected(self):
        return self._installed and self._pin_connected(self._rx_pin(), "rx")

    def _check_wiring(self):
        """배선과 UART 핀이 맞는지(PLAN §6.1 UART2 핀 — 교차 연결: 보드 TX ↔ 부품 RX, 보드 RX ↔ 부품 TX). 부품마다 실행에 한 번 알린다."""
        board = apc_board.BOARD
        if not board.wiring_known:
            return
        tx, rx = self._tx_pin(), self._rx_pin()
        for entry in board.wiring:
            pins = entry.get("pins", {})
            module_rx = pins.get("rx")
            module_tx = pins.get("tx")
            if module_rx is None or module_tx is None:
                continue
            tx_wrong = tx is not None and tx == module_tx
            rx_wrong = rx is not None and rx == module_rx
            if not (tx_wrong or rx_wrong):
                continue
            label = entry.get("label") or entry.get("part")
            self._warn_once(
                ("crossed", entry.get("id")),
                f"UART{self._num}(tx={tx}, rx={rx})의 핀이 배선도의 {label}(부품 RX={module_rx}, 부품 TX={module_tx})과 엇갈려 있어요. "
                "보드의 TX(보내는 핀)는 부품의 RX(받는 핀)에, 보드의 RX는 부품의 TX에 이어야 글자가 오가요(교차 연결). "
                f"코드를 UART({self._num}, …, tx={module_rx}, rx={module_tx})처럼 바꿔 보세요.",
            )

    # ── 받기 ──

    def _settings(self):
        return {"baudrate": self._baud, "bits": self._bits, "parity": None if self._parity == 0 else (1 if self._parity == 1 else 0), "stop": self._stop}

    def _receive(self, data, sender_settings, at_ns=None):
        """선으로 들어온 바이트를 가상 시각에 맞춰 받을 칸에 넣는다(깨짐·넘침 포함)."""
        decoded = reframe(data, sender_settings, self._settings())
        if not decoded:
            return
        now = apc_board.BOARD.clock.now_ns()
        per_char = char_time_ns(sender_settings)
        start = max(now if at_ns is None else min(int(at_ns), now), self._rx_line_free_ns)
        capacity = self._rxbuf + HW_FIFO_LEN
        dropped = 0
        for index, value in enumerate(decoded):
            if len(self._rx_queue) >= capacity:
                dropped += 1
                continue
            self._rx_queue.append((start + (index + 1) * per_char, value))
        self._rx_line_free_ns = start + len(decoded) * per_char
        self._last_rx_ns = self._rx_line_free_ns
        if dropped:
            self._warn_once(
                "overflow",
                f"UART{self._num}의 받을 칸({self._rxbuf}바이트 + 하드웨어 {HW_FIFO_LEN}바이트)이 가득 차서 {dropped}바이트를 버렸어요. "
                "반복문에서 uart.read()로 자주 꺼내거나 UART(…, rxbuf=1024)처럼 받을 칸을 키워요.",
            )
        irq = self._irq
        if irq is not None and irq.handler is not None:
            if irq.trigger_mask & IRQ_RX:
                irq.flags_value = IRQ_RX
                apc_board.BOARD.schedule(lambda uart: irq(), self)
            if irq.trigger_mask & IRQ_RXIDLE:
                self._irq_pending_idle = True

    def _arrived(self, now=None):
        if now is None:
            now = apc_board.BOARD.clock.now_ns()
        count = 0
        for arrival, _value in self._rx_queue:
            if arrival > now:
                break
            count += 1
        return count

    def _next_arrival(self, now):
        for arrival, _value in self._rx_queue:
            if arrival > now:
                return arrival
        return None

    def _take(self, count):
        taken = bytes(value for _arrival, value in self._rx_queue[:count])
        del self._rx_queue[:count]
        return taken

    def _service_idle_irq(self):
        irq = self._irq
        if not self._irq_pending_idle or irq is None or irq.handler is None:
            return
        now = apc_board.BOARD.clock.now_ns()
        idle_ns = max(RXIDLE_MIN_NS, 2 * char_time_ns(self._settings()))
        if self._arrived(now) == len(self._rx_queue) and now >= self._last_rx_ns + idle_ns:
            self._irq_pending_idle = False
            irq.flags_value = IRQ_RXIDLE
            apc_board.BOARD.schedule(lambda uart: irq(), self)

    def _check_point(self):
        apc_board.check_point()
        self._service_idle_irq()

    def _wait_arrival(self, timeout_ms):
        """받을 칸에 바이트가 도착할 때까지 timeout_ms(가상 시계)만큼 기다린다. 도착했으면 True"""
        board = apc_board.BOARD
        if self._arrived() > 0:
            return True
        if timeout_ms <= 0:
            return False
        deadline = board.clock.now_ns() + timeout_ms * 1_000_000
        while True:
            now = board.clock.now_ns()
            if self._arrived(now) > 0:
                return True
            remaining = deadline - now
            if remaining <= 0:
                return False
            chunk = min(remaining, apc_board.IRQ_SLICE_NS)
            upcoming = self._next_arrival(now)
            if upcoming is not None:
                chunk = min(chunk, max(1, upcoming - now))
            apc_board.wait_ns(chunk)

    def _require_driver(self):
        """드라이버를 지운(deinit) 뒤의 any()·sendbreak(): ESP-IDF 함수가 ESP_FAIL → OSError(1, 'ESP_FAIL')"""
        if not self._installed:
            raise _esp_fail()

    def _read_once(self, size):
        """mp_machine_uart_read 한 번: 첫 바이트는 timeout, 나머지는 timeout_char만큼 기다린다. 받은 것이 없으면 None(EAGAIN)"""
        if size == 0:
            return b""
        if self._is_repl():
            self._warn_once(
                "repl-read",
                "UART0은 USB로 컴퓨터와 이어진 REPL 통로라 가상 보드에서는 읽기를 흉내 내지 않아요. 컴퓨터에서 글자를 받으려면 input()을 써요.",
            )
            return None
        if not self._wait_arrival(self._timeout):
            return None
        result = bytearray(self._take(1))
        while len(result) < size:
            available = self._arrived()
            if available > 0:
                result += self._take(min(available, size - len(result)))
                continue
            if self._timeout_char <= 0 or not self._wait_arrival(self._timeout_char):
                break
        return bytes(result)

    def any(self):
        self._require_driver()
        self._check_point()
        return 0 if self._is_repl() else self._arrived()

    def read(self, nbytes=_MISSING):
        self._check_point()
        if not self._installed:
            return None  # uart_read_bytes가 -1 → EAGAIN → None
        if nbytes is not _MISSING:
            size = apc_board.mp_int(nbytes)
            if size != -1:
                return self._read_once(max(0, size))
        collected = bytearray()
        while True:
            chunk = self._read_once(256)
            if chunk is None:
                return bytes(collected) if collected else None
            if not chunk:
                return bytes(collected)
            collected += chunk

    def readline(self, size=_MISSING):
        self._check_point()
        if not self._installed:
            return None
        limit = -1 if size is _MISSING else apc_board.mp_int(size)
        line = bytearray()
        while limit == -1 or len(line) < limit:
            chunk = self._read_once(1)
            if chunk is None:
                return bytes(line) if line else None
            if not chunk:
                break
            line += chunk
            if chunk == b"\n":
                break
        return bytes(line)

    def readinto(self, buf, nbytes=_MISSING):
        self._check_point()
        view = memoryview(buf)
        if view.readonly:
            raise TypeError("object with buffer protocol required")
        size = len(view) if nbytes is _MISSING else min(len(view), max(0, apc_board.mp_int(nbytes)))
        if not self._installed:
            return None
        chunk = self._read_once(size)
        if chunk is None:
            return None
        view[: len(chunk)] = chunk
        return len(chunk)

    # ── 보내기 ──

    def write(self, buf, *args):
        if isinstance(buf, str):
            data = buf.encode("utf-8")
        else:
            try:
                data = bytes(memoryview(buf))
            except TypeError:
                raise TypeError("object with buffer protocol required") from None
        if len(args) > 2:
            raise TypeError(f"function expected at most 4 arguments, got {len(args) + 2}")
        offset, limit = 0, len(data)
        if len(args) == 1:
            limit = apc_board.mp_int(args[0]) & 0xFFFFFFFF
        elif len(args) == 2:
            offset = min(apc_board.mp_int(args[0]) & 0xFFFFFFFF, len(data))
            limit = apc_board.mp_int(args[1]) & 0xFFFFFFFF
        data = data[offset : offset + limit]
        if not self._installed:
            return None  # uart_write_bytes가 -1 → EAGAIN → None
        if self._is_repl():
            sys.stdout.write(data.decode("utf-8", "replace"))
            return len(data)
        board = apc_board.BOARD
        now = board.clock.now_ns()
        self._tx_free_ns = max(now, self._tx_free_ns) + len(data) * char_time_ns(self._settings())
        gpio = self._tx_pin()
        if data and gpio is not None and self._pin_connected(gpio, "tx"):
            self._send_to_devices(gpio, data)
        return len(data)

    def _send_to_devices(self, gpio, data):
        settings = self._settings()
        reached = False
        for entry, device in apc_board.wired_devices():
            receive = getattr(device, "serial_receive", None)
            role = getattr(device, "SERIAL_RX_ROLE", "rx")
            if receive is None or entry.get("pins", {}).get(role) != gpio:
                continue
            device_settings = _normalize_settings(getattr(device, "serial_settings", lambda: SERIAL_DEFAULT)())
            decoded = reframe(data, settings, device_settings)
            info = {"uart": self._num, "pin": gpio, "settings": dict(settings), "matched": same_settings(settings, device_settings)}
            reached = True
            # 속도가 달라 한 바이트도 못 읽었어도 부른다 — 부품이 "신호가 깨졌어요"를 알릴 수 있게
            receive(decoded, info)
        if not reached and apc_board.BOARD.wiring_known:
            self._warn_once(
                ("tx-nowhere", gpio),
                f"UART{self._num}이(가) {gpio}번 핀(TX)으로 글자를 보냈지만, 이 예제의 배선도에는 {gpio}번 핀에서 글자를 받는 부품이 없어요. "
                "코드의 tx 핀 번호가 배선도(부품의 RX)와 같은지 확인해요.",
            )

    def txdone(self):
        if not self._installed:
            return False  # uart_wait_tx_done가 ESP_FAIL
        return apc_board.BOARD.clock.now_ns() >= self._tx_free_ns

    def flush(self):
        if not self._installed:
            raise apc_board.board_oserror(116)  # MP_STREAM_FLUSH: 기다리기 실패 → ETIMEDOUT
        remaining = self._tx_free_ns - apc_board.BOARD.clock.now_ns()
        if remaining > 0:
            apc_board.wait_ns(remaining)

    def sendbreak(self):
        self._require_driver()
        self.flush()
        gpio = self._tx_pin()
        if gpio is None or not self._pin_connected(gpio, "tx"):
            return
        for entry, device in apc_board.wired_devices():
            on_break = getattr(device, "serial_break", None)
            role = getattr(device, "SERIAL_RX_ROLE", "rx")
            if on_break is not None and entry.get("pins", {}).get(role) == gpio:
                on_break({"uart": self._num, "pin": gpio})

    def irq(self, *args, **kwargs):
        names = ("handler", "trigger", "hard")
        if len(args) > len(names):
            raise TypeError("extra positional arguments given")
        values = dict(zip(names, args))
        for key, value in kwargs.items():
            if key not in names:
                raise TypeError(f"unexpected keyword argument '{key}'")
            values[key] = value
        if self._is_repl():
            raise ValueError("REPL UART does not support IRQs")
        if self._irq is None:
            self._irq = _UartIrq(self)
        if values:
            handler = values.get("handler")
            if handler is not None and not callable(handler):
                raise ValueError("handler must be None or callable")
            trigger = apc_board.mp_int(values.get("trigger", 0))
            not_supported = trigger & ~_IRQ_ALLOWED
            if trigger != 0 and not_supported:
                raise ValueError(f"trigger 0x{not_supported:04x} unsupported")
            self._irq.handler = handler
            if values.get("hard", False):
                raise ValueError("hard IRQ is not supported")
            self._irq.trigger_mask = trigger
            self._irq_pending_idle = False
        return self._irq

    # ── 그 밖 ──

    def _warn_once(self, key, text):
        apc_board.BOARD.warn_once(("uart", self._num, key), text)

    def __repr__(self):
        actual = _actual_baudrate(self._baud) or self._baud
        tx = self._tx
        rx = self._rx
        text = (
            f"UART({self._num}, baudrate={actual}, bits={self._bits}, parity={_PARITY_NAME[self._parity]}, stop={self._stop}, "
            f"tx={tx}, rx={rx}, rts={self._rts}, cts={self._cts}, txbuf={self._txbuf}, rxbuf={self._rxbuf}, "
            f"timeout={self._timeout}, timeout_char={self._timeout_char}, irq={0 if self._irq is None else self._irq.trigger_mask}"
        )
        if self._invert:
            parts = [name for name, bit in (("INV_TX", INV_TX), ("INV_RX", INV_RX), ("INV_RTS", INV_RTS), ("INV_CTS", INV_CTS)) if self._invert & bit]
            text += ", invert=" + "|".join(parts)
        if self._flow:
            parts = [name for name, bit in (("RTS", FLOW_RTS), ("CTS", FLOW_CTS)) if self._flow & bit]
            text += ", flow=" + "|".join(parts)
        return text + ")"


apc_board.register_machine_export("UART", UART)
