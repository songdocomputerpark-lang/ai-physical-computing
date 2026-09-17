"""neopixel — 네오픽셀(WS2812) 드라이버, 가상 ESP32 보드판(PLAN §6.2 "네오픽셀 16구 링", CODE_MAPPING §3.8.2·§3.10, 원고 148~153쪽).

학생 코드는 교과서 그대로다(실물 ESP32 펌웨어에는 이 모듈이 들어 있다 — 가상 보드는 ESP32 실습실에서만 이 파일을 준다):

    from machine import Pin
    from neopixel import NeoPixel
    np = NeoPixel(Pin(23), 16)
    np[0] = (255, 0, 0)     # 색은 버퍼에만 적힌다
    np.write()              # 이때 링의 LED가 바뀐다(원고 149쪽 "np[i]=(R,G,B)로 설정한 색상 정보를 LED에 전송")

동작 기준: MicroPython v1.29.0 ESP32 펌웨어가 넣는 micropython-lib micropython/drivers/led/neopixel/neopixel.py(0.1.0, 커밋 ee4bb8f —
ports/esp32/boards/manifest.py의 require("neopixel"), 2026-09-18 원문 확인). 코드는 옮기지 않고 같은 동작으로 다시 썼다.
- NeoPixel(pin, n, bpp=3, timing=1): 버퍼 bytearray(n × bpp), pin.init(pin.OUT)(그래서 핀은 Pin이어야 한다 — 정수면 AttributeError),
  timing 1은 800kHz(400, 850, 800, 450)ns, 0은 400kHz(800, 1700, 1600, 900)ns, 튜플이면 그대로.
- 선에 나가는 차례는 G·R·B(·W): ORDER = (1, 0, 2, 3). np[i] = (r, g, b)는 buf[i×bpp + ORDER[k]] = v[k]를 k = 0, 1, 2 차례로 적는다.
  그래서 (r, g) 두 개만 주면 앞 두 칸을 적은 뒤 IndexError('tuple index out of range'), i가 n 이상이면 IndexError('bytearray index out of range'),
  음수 i는 버퍼 뒤쪽 LED를 가리킨다(실물과 같음). 원고 149쪽 오류표의 "ValueError: tuple length must be 3"은 v1.29.0의 실제 문구가 아니다.
- 색 값: MicroPython의 bytearray는 0~255 밖 정수를 아래 8비트만 남긴다(py/binary.c — OVERFLOW_CHECKS 꺼짐: 256 → 0, -1 → 255).
  소수는 TypeError("can't convert float to int"). CPython의 bytearray는 ValueError라 이 파일의 버퍼(_MicroPythonBytearray)가 실물처럼 맞춘다.
- np[i] → (r, g, b) 튜플, len(np) → n, fill((r, g, b)) → 모든 LED, write() → machine.bitstream(pin, 0, timing, buf).
가상 보드와 다른 점: 신호 시간(ns)을 흉내 내지 않고 바이트를 링 흉내(apc_part_neopixel.py)에 바로 준다.
라이선스: 사이트 소프트웨어(MIT, PD-26). 동작 기준 파일은 MIT(Copyright (c) 2016 Damien P. George, 2021 Jim Mussared) — 코드는 옮기지 않았다.
"""

from machine import bitstream

__all__ = ["NeoPixel"]


class _MicroPythonBytearray(bytearray):
    """MicroPython의 bytearray 한 칸 쓰기 규칙: 정수는 아래 8비트만, 정수가 아니면 TypeError("can't convert <형> to int")."""

    def __setitem__(self, index, value):
        if isinstance(index, slice):
            bytearray.__setitem__(self, index, value)
            return
        if isinstance(value, bool):
            value = int(value)
        elif not isinstance(value, int):
            convert = getattr(type(value), "__int__", None)
            if convert is None or isinstance(value, float):
                raise TypeError(f"can't convert {type(value).__name__} to int")
            value = int(value)
        bytearray.__setitem__(self, index, value & 0xFF)


class NeoPixel:
    # 선에 나가는 차례 G R B W
    ORDER = (1, 0, 2, 3)

    def __init__(self, pin, n, bpp=3, timing=1):
        self.pin = pin
        self.n = n
        self.bpp = bpp
        self.buf = _MicroPythonBytearray(n * bpp)
        self.pin.init(pin.OUT)
        if isinstance(timing, int):
            self.timing = (400, 850, 800, 450) if timing else (800, 1700, 1600, 900)
        else:
            self.timing = timing

    def __len__(self):
        return self.n

    def __setitem__(self, index, value):
        offset = index * self.bpp
        order = self.ORDER
        buf = self.buf
        for k in range(self.bpp):
            channel = value[k]
            buf[offset + order[k]] = channel

    def __getitem__(self, index):
        offset = index * self.bpp
        return tuple(self.buf[offset + self.ORDER[k]] for k in range(self.bpp))

    def fill(self, value):
        buf = self.buf
        size = len(buf)
        bpp = self.bpp
        for k in range(bpp):
            channel = value[k]
            position = self.ORDER[k]
            while position < size:
                buf[position] = channel
                position += bpp

    def write(self):
        # BITSTREAM_TYPE_HIGH_LOW = 0
        bitstream(self.pin, 0, self.timing, self.buf)
