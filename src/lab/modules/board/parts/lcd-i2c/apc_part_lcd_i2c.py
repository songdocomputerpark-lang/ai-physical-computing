"""부품 흉내: 문자 LCD 16×2 + I2C 백팩(PCF8574 → HD44780) — 바이트 수준(PLAN §6.2 "문자 LCD 16×2 + I2C 백팩(0x20)", §8.3 P3-04, CODE_MAPPING §3.8.3).

학생 코드는 교과서와 똑같이 사이트가 주는 i2c_lcd.py(examples/esp32/lib/third-party/)를 쓴다 — 이 파일은 그 라이브러리가 I2C로 보내는 바이트를
실물 부품처럼 받아 화면 글자로 바꾼다. 그래서 라이브러리 원본 로직(16칸을 넘으면 다음 줄, 마지막 줄을 넘으면 0행 — 19자 둘째 줄이 첫 줄 앞 3칸을 덮음)이
실물과 똑같이 보인다.

    from machine import Pin, SoftI2C
    from i2c_lcd import I2cLcd
    lcd = I2cLcd(SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000), 0x20, 2, 16)
    lcd.putstr('Hello LCD!')

1. PCF8574(8비트 I/O 확장 칩, 주소 0x20 — 교과서 키트 백팩 실크 "I2C Addr:0x20", 점퍼로 0x20~0x27): I2C로 받은 바이트 하나가 곧 8개 출력 핀의 값이다.
   전원을 켜면 모든 핀이 1(약한 풀업). 비트 배치는 python_lcd의 i2c_lcd.py와 같다 — bit0 RS, bit1 RW, bit2 E, bit3 백라이트, bit4~7 데이터 D4~D7.
   읽기(readfrom)는 지금 핀 값(마지막으로 쓴 바이트)을 돌려준다.
2. HD44780(문자 LCD 제어 칩): E 핀이 1 → 0으로 떨어질 때(E가 1이던 동안의 RS·RW·D4~D7 값으로) 네 비트를 받는다. RW가 1이면 읽기라 무시한다.
   전원 직후(내부 리셋 회로 — Hitachi HD44780U 데이터시트 "Initializing by Internal Reset Circuit"): 8비트 모드·1줄·화면 끔·커서 끔·AC 증가·DDRAM 모두 공백(0x20).
   8비트 모드에서는 D0~D3이 백팩에 이어지지 않아 칩 안의 풀업으로 1이 읽힌다(명령 = 네 비트 << 4 | 0x0F). 4비트 모드에서는 두 번(윗 네 비트 → 아랫 네 비트)에 한 바이트.
   초기화 순서(0x3·0x3·0x3·0x2)는 어느 상태에서 시작해도 4비트 모드로 맞춰진다(실물과 같은 상태 기계라 두 번 초기화해도 같다).
3. 명령(RS=0): 1 clear(DDRAM 공백, AC=0, 증가, 화면 이동 0) · 2 home(AC=0, 화면 이동 0) · 4 entry mode(I/D, S) · 8 display control(D 화면, C 커서, B 깜빡임) ·
   0x10 cursor/display shift · 0x20 function set(DL 8비트, N 2줄, F 5×10) · 0x40 CGRAM 주소(사용자 글자 8개) · 0x80 DDRAM 주소.
   데이터(RS=1): AC가 가리키는 DDRAM·CGRAM에 쓰고 AC를 하나 옮긴다(2줄: 0x27 → 0x40, 0x67 → 0x00). entry mode S=1이면 화면도 한 칸 이동.
   function set의 줄 수(N)는 초기화 뒤에도 받는다(데이터시트는 막지만 흔한 호환 칩과 i2c_lcd.py가 그렇게 쓰고, 교과서 키트에서 2줄이 보인다).
4. 화면에 알리기: 보이는 모습(16×2 글자 코드·백라이트·화면 켜짐·커서·CGRAM)이 바뀌면 apc_board.set_device_state(배선 id, 'lcd-i2c', 상태)
   — 16ms마다 최신 값만 'board.device' 이벤트로 나간다(src/lab/README.md 7.3). 상태 모양은 part.ts의 lcd-screen.ts 머리말과 같다.

흉내 내지 않는 것: 바쁨 신호(busy flag)와 명령 처리 시간(clear 1.52ms — 기다리지 않고 바로 보내도 가상 LCD는 받는다), 5×10 글꼴 모양,
LCD 대비(가변저항). 글자 모양은 화면이 A00(일본어 표준) 문자표로 보여 준다(실물 키트 LCD의 문자표는 확인 전 — 부록 B-2).
라이선스: 사이트 소프트웨어(MIT, PD-26). HD44780·PCF8574 동작은 데이터시트의 사실을 따라 직접 썼다.
"""

import apc_board

__all__ = ["DEFAULT_ADDRESS", "Hd44780", "LcdI2cDevice", "PART_ID"]

PART_ID = "lcd-i2c"
#: 교과서 키트 백팩의 주소(원고 127쪽 코드·BT 교안 p49 백팩 실크 "I2C Addr:0x20")
DEFAULT_ADDRESS = 0x20
COLUMNS = 16
ROWS = 2

# PCF8574 비트(python_lcd i2c_lcd.py와 같은 배치)
MASK_RS = 0x01
MASK_RW = 0x02
MASK_E = 0x04
MASK_BACKLIGHT = 0x08
SHIFT_DATA = 4


class Hd44780:
    """HD44780 제어 칩의 상태 기계(순수 논리 — I2C와 상관없이 latch(rs, rw, 네 비트)로 먹인다)"""

    def __init__(self):
        self.ddram = bytearray(b" " * 0x80)
        self.cgram = bytearray(64)
        self.address = 0
        self.cgram_selected = False
        self.eight_bit = True
        self.two_lines = False
        self.tall_font = False
        self.display_on = False
        self.cursor_on = False
        self.blink_on = False
        self.increment = True
        self.auto_shift = False
        self.shift = 0
        self.pending = None
        self.commands = 0
        self.characters = 0
        self.revision = 0

    # ── 받기 ──

    def latch(self, rs, rw, nibble):
        """E가 떨어질 때 한 번. rw가 1이면 읽기라 무시한다."""
        if rw:
            return
        nibble &= 0x0F
        if self.eight_bit:
            self.pending = None
            self.execute(rs, (nibble << 4) | 0x0F)
            return
        if self.pending is None:
            self.pending = nibble
            return
        value = (self.pending << 4) | nibble
        self.pending = None
        self.execute(rs, value)

    def execute(self, rs, value):
        value &= 0xFF
        if rs:
            self._write_data(value)
            return
        self.commands += 1
        if value & 0x80:
            self.address = value & 0x7F
            self.cgram_selected = False
        elif value & 0x40:
            self.address = value & 0x3F
            self.cgram_selected = True
        elif value & 0x20:
            self.eight_bit = bool(value & 0x10)
            self.two_lines = bool(value & 0x08)
            self.tall_font = bool(value & 0x04)
            self.pending = None
            self.shift %= self._line_width()
        elif value & 0x10:
            if value & 0x08:
                self._shift_display(left=not (value & 0x04))
            else:
                self._step(1 if value & 0x04 else -1)
        elif value & 0x08:
            self.display_on = bool(value & 0x04)
            self.cursor_on = bool(value & 0x02)
            self.blink_on = bool(value & 0x01)
        elif value & 0x04:
            self.increment = bool(value & 0x02)
            self.auto_shift = bool(value & 0x01)
        elif value & 0x02:
            self.address = 0
            self.cgram_selected = False
            self.shift = 0
        elif value & 0x01:
            self.ddram[:] = b" " * len(self.ddram)
            self.address = 0
            self.cgram_selected = False
            self.shift = 0
            self.increment = True
        self.revision += 1

    def _write_data(self, value):
        self.characters += 1
        if self.cgram_selected:
            self.cgram[self.address & 0x3F] = value
        else:
            self.ddram[self.address & 0x7F] = value
        self._step(1 if self.increment else -1)
        if self.auto_shift and not self.cgram_selected:
            self._shift_display(left=self.increment)
        self.revision += 1

    def _line_width(self):
        return 40 if self.two_lines else 80

    def _step(self, delta):
        """AC를 한 칸 옮긴다: CGRAM은 0~63을 돌고, DDRAM 2줄은 0x00~0x27 ↔ 0x40~0x67, 1줄은 0x00~0x4F를 돈다."""
        if self.cgram_selected:
            self.address = (self.address + delta) & 0x3F
            return
        address = self.address
        if self.two_lines:
            if delta > 0:
                address = 0x40 if address == 0x27 else 0x00 if address == 0x67 else (address + 1) & 0x7F
            else:
                address = 0x27 if address == 0x40 else 0x67 if address == 0x00 else (address - 1) & 0x7F
        elif delta > 0:
            address = 0 if address >= 0x4F else address + 1
        else:
            address = 0x4F if address == 0 or address > 0x4F else address - 1
        self.address = address

    def _shift_display(self, left):
        width = self._line_width()
        self.shift = (self.shift + (1 if left else -1)) % width

    # ── 보이는 모습 ──

    def visible_codes(self):
        """16×2 칸의 글자 코드(행 우선 32바이트). 화면이 꺼졌거나 1줄 모드의 둘째 줄은 공백."""
        codes = bytearray(b" " * (COLUMNS * ROWS))
        if not self.display_on:
            return bytes(codes)
        width = self._line_width()
        for row in range(ROWS):
            if not self.two_lines and row > 0:
                continue
            base = 0x40 * row if self.two_lines else 0
            for column in range(COLUMNS):
                codes[row * COLUMNS + column] = self.ddram[base + (column + self.shift) % width]
        return bytes(codes)

    def cursor_cell(self):
        """커서가 보이는 칸 (행, 열) 또는 None(화면 꺼짐·커서 끔·CGRAM을 가리킴·보이는 16칸 밖)"""
        if not self.display_on or not (self.cursor_on or self.blink_on) or self.cgram_selected:
            return None
        address = self.address
        width = self._line_width()
        if self.two_lines:
            if address <= 0x27:
                row, raw = 0, address
            elif 0x40 <= address <= 0x67:
                row, raw = 1, address - 0x40
            else:
                return None
        elif address <= 0x4F:
            row, raw = 0, address
        else:
            return None
        column = (raw - self.shift) % width
        return (row, column) if column < COLUMNS else None


class LcdI2cDevice:
    """I2C 장치(apc_board_i2c의 장치 약속): PCF8574 백팩 + HD44780 LCD"""

    def __init__(self, entry):
        self.entry = entry
        self.device_id = entry["id"]
        self.i2c_address = DEFAULT_ADDRESS
        self.port = 0xFF
        self.lcd = Hd44780()
        self._published = None

    # ── I2C ──

    def i2c_start(self, read):
        return True

    def i2c_write(self, data):
        for value in data:
            self._port_write(value)
        self._publish()
        return len(data)

    def i2c_read(self, count):
        return bytes((self.port,)) * count

    def i2c_stop(self):
        pass

    # ── PCF8574 ──

    def _port_write(self, value):
        previous = self.port
        self.port = value & 0xFF
        if previous & MASK_E and not self.port & MASK_E:
            self.lcd.latch(previous & MASK_RS, previous & MASK_RW, previous >> SHIFT_DATA)

    @property
    def backlight(self):
        return bool(self.port & MASK_BACKLIGHT)

    # ── 화면에 알리기 ──

    def state(self):
        lcd = self.lcd
        cursor = lcd.cursor_cell()
        state = {
            "v": 1,
            "cols": COLUMNS,
            "rows": ROWS,
            "codes": lcd.visible_codes(),
            "backlight": self.backlight,
            "display": lcd.display_on,
            "underline": lcd.cursor_on,
            "blink": lcd.blink_on,
            "lines": 2 if lcd.two_lines else 1,
            "bits": 8 if lcd.eight_bit else 4,
            "cgram": bytes(lcd.cgram),
        }
        if cursor is not None:
            state["cursor"] = [cursor[0], cursor[1]]
        return state

    def _publish(self):
        key = (self.lcd.revision, self.port & MASK_BACKLIGHT)
        if key == self._published:
            return
        self._published = key
        apc_board.set_device_state(self.device_id, PART_ID, self.state())


apc_board.register_part(PART_ID, LcdI2cDevice)
