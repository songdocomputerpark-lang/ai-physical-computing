"""가상 ESP32 보드의 OLED 드라이버 ssd1306 — 교과서 코드 자료(2-1-3 출력 테스트·기본·심화)가 부르는 이름 그대로(PLAN §6.1 "OLED 이름", §6.5 "OLED 드라이버").

    from machine import Pin, SoftI2C
    from ssd1306 import SSD1306_I2C
    oled = SSD1306_I2C(128, 64, SoftI2C(scl=Pin(22), sda=Pin(21)))   # 주소를 적지 않으면 0x3C
    oled.fill(0)
    oled.text('Hello, ESP32!', 0, 0)
    oled.show()

실물 보드에는 이 파일이 펌웨어에 없어 드라이버(micropython-lib의 ssd1306 등)를 보드에 올려야 import된다(원고 오류 표 "ImportError: no module named ...").
가상 보드는 사이트가 쓴 이 흉내를 준다 — 널리 쓰는 드라이버와 같은 이름·사용법으로 사이트가 직접 썼다(코드를 옮기지 않음).

- SSD1306_I2C(width, height, i2c, addr=0x3C, external_vcc=False): framebuf.FrameBuffer(MONO_VLSB)를 물려받아 fill·pixel·text·line·rect·
  fill_rect·hline·vline·ellipse·poly·blit·scroll을 그대로 쓰고, show()로 화면에 보낸다(그리기만 하면 화면은 그대로 — 실물과 같다).
  만들 때 SSD1306 데이터시트의 초기화 순서로 명령을 보내고(화면 끔 → 설정 → 켬) 화면을 지운다. 주소에 장치가 없으면 여기서 OSError: [Errno 19] ENODEV.
- 속성·함수: width, height, pages, buffer, external_vcc, i2c, addr, init_display(), poweroff(), poweron(), contrast(c), invert(i), rotate(r),
  show(), write_cmd(cmd)(I2C [0x80, cmd]), write_data(buf)(I2C [0x40] + buf — writevto).
- SSD1306_SPI는 이름만 있다: 가상 보드는 SPI로 잇는 OLED를 흉내 내지 않아 만들면 NotImplementedError(한국어 안내).
- 가상 보드 전용: show()가 그린 글자 목록(framebuf의 _apc_texts)을 I2C 버스의 _apc_hint로 OLED 장치에 넘긴다 — 화면 낭독기가 OLED 글자를 읽게.
  실물 버스에는 없는 이름이라 getattr로 있을 때만 부른다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import framebuf
from micropython import const

__all__ = ["SSD1306", "SSD1306_I2C", "SSD1306_SPI"]

# SSD1306 데이터시트 명령표(Solomon Systech SSD1306 Rev 1.1 §9)
_DISPLAY_OFF = const(0xAE)
_DISPLAY_ON = const(0xAF)
_CONTRAST = const(0x81)
_ENTIRE_FOLLOW_RAM = const(0xA4)
_NORMAL = const(0xA6)
_SEGMENT_REMAP = const(0xA0)
_COM_SCAN = const(0xC0)
_MEMORY_MODE = const(0x20)
_COLUMN_RANGE = const(0x21)
_PAGE_RANGE = const(0x22)
_CLOCK_DIVIDE = const(0xD5)
_MULTIPLEX = const(0xA8)
_DISPLAY_OFFSET = const(0xD3)
_START_LINE = const(0x40)
_CHARGE_PUMP = const(0x8D)
_COM_PINS = const(0xDA)
_PRECHARGE = const(0xD9)
_VCOM_DESELECT = const(0xDB)


class SSD1306(framebuf.FrameBuffer):
    """SSD1306 OLED의 공통 부분(그림 버퍼와 명령). 연결 방식은 하위 클래스(SSD1306_I2C)가 write_cmd·write_data로 정한다."""

    def __init__(self, width, height, external_vcc):
        self.width = width
        self.height = height
        self.external_vcc = external_vcc
        self.pages = height // 8
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        self.init_display()

    def init_display(self):
        wide = self.width > 2 * self.height
        sequence = (
            _DISPLAY_OFF,
            _CLOCK_DIVIDE, 0x80,
            _MULTIPLEX, self.height - 1,
            _DISPLAY_OFFSET, 0x00,
            _START_LINE | 0x00,
            _CHARGE_PUMP, 0x10 if self.external_vcc else 0x14,
            _MEMORY_MODE, 0x00,  # 가로 주소 방식
            _SEGMENT_REMAP | 0x01,  # 모듈을 바로 놓았을 때 글자가 바로 보이는 방향
            _COM_SCAN | 0x08,
            _COM_PINS, 0x02 if wide else 0x12,
            _CONTRAST, 0xFF,
            _PRECHARGE, 0x22 if self.external_vcc else 0xF1,
            _VCOM_DESELECT, 0x30,
            _ENTIRE_FOLLOW_RAM,
            _NORMAL,
            _DISPLAY_ON,
        )
        for command in sequence:
            self.write_cmd(command)
        self.fill(0)
        self.show()

    def poweroff(self):
        self.write_cmd(_DISPLAY_OFF)

    def poweron(self):
        self.write_cmd(_DISPLAY_ON)

    def contrast(self, contrast):
        self.write_cmd(_CONTRAST)
        self.write_cmd(contrast)

    def invert(self, invert):
        self.write_cmd(_NORMAL | (invert & 1))

    def rotate(self, rotate):
        self.write_cmd(_COM_SCAN | ((rotate & 1) << 3))
        self.write_cmd(_SEGMENT_REMAP | (rotate & 1))

    def show(self):
        first = 0
        last = self.width - 1
        if self.width != 128:
            # 128칸보다 좁은 화면은 가운데 열을 쓴다
            offset = (128 - self.width) // 2
            first += offset
            last += offset
        self.write_cmd(_COLUMN_RANGE)
        self.write_cmd(first)
        self.write_cmd(last)
        self.write_cmd(_PAGE_RANGE)
        self.write_cmd(0)
        self.write_cmd(self.pages - 1)
        self.write_data(self.buffer)
        self._apc_send_hint()

    def _apc_send_hint(self):
        """(가상 보드 전용) 버퍼에 글자로 쓴 것을 OLED 장치에 알린다 — 화면 낭독기용. 실물 I2C에는 _apc_hint가 없어 아무 일도 하지 않는다."""
        bus = getattr(self, "i2c", None)
        hint = getattr(bus, "_apc_hint", None)
        if hint is None:
            return
        texts = [{"x": item[0], "y": item[1], "text": item[2]} for item in getattr(self, "_apc_texts", [])]
        hint(getattr(self, "addr", 0x3C), texts)

    def write_cmd(self, cmd):
        raise NotImplementedError

    def write_data(self, buf):
        raise NotImplementedError


class SSD1306_I2C(SSD1306):
    """I2C로 잇는 SSD1306 OLED(주소 기본 0x3C)"""

    def __init__(self, width, height, i2c, addr=0x3C, external_vcc=False):
        self.i2c = i2c
        self.addr = addr
        self._command = bytearray(2)
        self._data_parts = [b"\x40", None]
        super().__init__(width, height, external_vcc)

    def write_cmd(self, cmd):
        self._command[0] = 0x80  # Co=1, D/C=0: 명령 바이트 하나
        self._command[1] = cmd & 0xFF  # MicroPython의 bytearray는 넘친 값을 아래 8비트만 담는다
        self.i2c.writeto(self.addr, self._command)

    def write_data(self, buf):
        self._data_parts[1] = buf  # 0x40(Co=0, D/C=1): 뒤는 모두 그림 데이터
        self.i2c.writevto(self.addr, self._data_parts)


class SSD1306_SPI(SSD1306):
    """SPI로 잇는 SSD1306 OLED — 가상 보드는 흉내 내지 않는다(이름만)"""

    def __init__(self, width, height, spi, dc, res, cs, external_vcc=False):
        raise NotImplementedError(
            "가상 보드는 SPI로 잇는 OLED(SSD1306_SPI)를 흉내 내지 않아요. 교과서 키트의 OLED는 I2C라 SSD1306_I2C(128, 64, i2c)를 써요. SPI 연결은 실물 보드에서 확인해요."
        )
