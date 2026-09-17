"""부품 흉내: OLED 128×64(I2C, 주소 0x3C) — SSD1306 호환 제어 칩을 바이트 수준으로 흉내(PLAN §6.2 "OLED 128×64", §6.1 "OLED 이름", §8.3 P3-04).

학생 코드는 교과서와 같게 드라이버 이름 두 가지 가운데 하나를 쓴다(같은 부품 폴더의 드라이버 흉내 ssd1306.py·sh1106.py — 코드 자료는 ssd1306, 원고는 sh1106):

    from machine import Pin, SoftI2C
    from ssd1306 import SSD1306_I2C        # 또는 from sh1106 import SH1106_I2C
    oled = SSD1306_I2C(128, 64, SoftI2C(scl=Pin(22), sda=Pin(21)))
    oled.fill(0); oled.text('Hello, ESP32!', 0, 0); oled.show()

드라이버 흉내는 실물 드라이버처럼 I2C로 명령·그림 바이트를 보내고, 이 파일의 장치가 그 바이트를 받아 화면 기억 장치(GDDRAM 128×8쪽)에 적는다.
그래서 주소가 틀리면 실물처럼 OSError ENODEV가 나고, poweroff·invert·contrast·rotate도 받은 명령대로 보인다.

1. I2C 한 번의 전송은 제어 바이트로 시작한다: 비트 7(Co)이 1이면 바이트 하나 뒤에 다시 제어 바이트, 0이면 끝까지 이어짐. 비트 6(D/C)이 0이면 명령, 1이면 그림 데이터.
2. 명령(SSD1306 데이터시트 명령표): AE/AF 화면 끄기·켜기 · 81 xx 밝기(대비) · A4/A5 RAM대로/모두 켜기 · A6/A7 보통/반전 · A0/A1 좌우(열 순서) ·
   C0/C8 위아래(COM 순서) · 20 xx 주소 방식(0 가로·1 세로·2 쪽) · 21 시작 끝 열 범위 · 22 시작 끝 쪽 범위 · 00~0F·10~1F·B0~B7 쪽 방식의 열·쪽 ·
   8D xx 충전 펌프 · A8·D3·D5·D9·DA·DB·AD xx(값만 받음) · 26/27(6바이트)·29/2A(5바이트)·A3(2바이트) 스크롤 설정(받기만 하고 움직이지 않음) ·
   2E/2F 스크롤 끄기·켜기 · 40~7F 시작 줄 · 30~33(SH1106 펌프 전압) · E3 아무 일 없음. 명령의 값 바이트는 전송이 나뉘어도 이어서 받는다(드라이버가 바이트마다 따로 보냄).
3. 그림 데이터: 지금 주소 칸에 쓰고 주소 방식에 따라 다음 칸으로 간다(가로 방식: 열 → 끝 열 뒤 다음 쪽).
4. 전원 직후(데이터시트 reset 값): 화면 꺼짐, 대비 0x7F, 좌우 A0, 위아래 C0, 쪽 주소 방식, 범위 열 0~127·쪽 0~7. RAM은 0(실물은 정해지지 않음).
5. 화면에 알리기: RAM·켜짐·반전·모두 켜기·대비·좌우·위아래가 바뀌면 전송(i2c_write) 한 번에 한 번 apc_board.set_device_state(배선 id, 'oled-i2c', 상태)
   — 모양은 part.ts의 oled-screen.ts 머리말. 드라이버 흉내가 _apc_hint로 넘긴 글자(text로 쓴 것)도 화면 낭독기 설명으로 싣는다.

흉내 내지 않는 것: 시작 줄·화면 옮김(D3)·다중화 비율에 따른 화면 이동, 하드웨어 스크롤 움직임, 충전 펌프를 켜지 않았을 때 어두운 화면, SH1106 칩만의
쪽 주소 명령 차이(가상 OLED는 두 드라이버 이름의 명령을 모두 받는다 — 실물 키트의 칩이 SSD1306인지 SH1106인지는 확인 전, 부록 B-2).
라이선스: 사이트 소프트웨어(MIT, PD-26). 명령 값은 데이터시트의 사실을 따라 직접 썼다.
"""

import apc_board

__all__ = ["DEFAULT_ADDRESS", "OledI2cDevice", "PART_ID", "Ssd1306"]

PART_ID = "oled-i2c"
#: 원고 134쪽 "기본 I2C 주소 0x3C"
DEFAULT_ADDRESS = 0x3C
COLUMNS = 128
PAGES = 8

#: 값 바이트를 더 받는 명령 → 받을 수
_PARAMETER_COUNTS = {
    0x20: 1,
    0x21: 2,
    0x22: 2,
    0x23: 1,
    0x26: 6,
    0x27: 6,
    0x29: 5,
    0x2A: 5,
    0x81: 1,
    0x8D: 1,
    0xA3: 2,
    0xA8: 1,
    0xAD: 1,
    0xD3: 1,
    0xD5: 1,
    0xD6: 1,
    0xD9: 1,
    0xDA: 1,
    0xDB: 1,
}


class Ssd1306:
    """SSD1306 호환 제어 칩(순수 논리 — begin()으로 전송을 시작하고 feed(바이트들)로 먹인다)"""

    def __init__(self):
        self.ram = bytearray(COLUMNS * PAGES)
        self.display_on = False
        self.contrast = 0x7F
        self.inverse = False
        self.entire_on = False
        self.seg_remap = False
        self.com_reverse = False
        self.addressing = 2
        self.col_start = 0
        self.col_end = COLUMNS - 1
        self.page_start = 0
        self.page_end = PAGES - 1
        self.column = 0
        self.page = 0
        self.charge_pump = False
        self.scrolling = False
        self.pending = None
        self.control = None
        self.revision = 0
        self.data_bytes = 0

    def begin(self):
        """새 I2C 전송(주소 바이트 다음은 제어 바이트)"""
        self.control = None

    def feed(self, data):
        index = 0
        size = len(data)
        while index < size:
            if self.control is None:
                byte = data[index]
                index += 1
                self.control = ("data" if byte & 0x40 else "command", bool(byte & 0x80))
                continue
            kind, single = self.control
            if kind == "data":
                if single:
                    self._write_ram(data[index : index + 1])
                    index += 1
                    self.control = None
                else:
                    self._write_ram(data[index:])
                    index = size
            else:
                self._command(data[index])
                index += 1
                if single:
                    self.control = None

    # ── 명령 ──

    def _command(self, byte):
        if self.pending is not None:
            command, values, needed = self.pending
            values.append(byte)
            if len(values) < needed:
                return
            self.pending = None
            self._execute(command, values)
            return
        needed = _PARAMETER_COUNTS.get(byte, 0)
        if needed:
            self.pending = (byte, [], needed)
            return
        self._execute(byte, [])

    def _execute(self, command, values):
        changed = True
        if command == 0xAE or command == 0xAF:
            self.display_on = command == 0xAF
        elif command == 0x81:
            self.contrast = values[0]
        elif command == 0xA4 or command == 0xA5:
            self.entire_on = command == 0xA5
        elif command == 0xA6 or command == 0xA7:
            self.inverse = command == 0xA7
        elif command == 0xA0 or command == 0xA1:
            self.seg_remap = command == 0xA1
        elif command == 0xC0 or command == 0xC8:
            self.com_reverse = command == 0xC8
        elif command == 0x20:
            self.addressing = values[0] & 0x03 if (values[0] & 0x03) != 3 else self.addressing
            changed = False
        elif command == 0x21:
            self.col_start = values[0] & 0x7F
            self.col_end = values[1] & 0x7F
            self.column = self.col_start
            changed = False
        elif command == 0x22:
            self.page_start = values[0] & 0x07
            self.page_end = values[1] & 0x07
            self.page = self.page_start
            changed = False
        elif command <= 0x0F:
            self.column = (self.column & 0x70) | command
            changed = False
        elif command <= 0x1F:
            self.column = ((command & 0x07) << 4) | (self.column & 0x0F)
            changed = False
        elif 0xB0 <= command <= 0xB7:
            self.page = command & 0x07
            changed = False
        elif command == 0x8D:
            self.charge_pump = bool(values[0] & 0x04)
            changed = False
        elif command == 0x2E or command == 0x2F:
            self.scrolling = command == 0x2F
            changed = False
        else:
            changed = False
        if changed:
            self.revision += 1

    # ── 그림 데이터 ──

    def _write_ram(self, data):
        if not data:
            return
        self.data_bytes += len(data)
        ram = self.ram
        if self.addressing == 0 and self.col_start == 0 and self.col_end == COLUMNS - 1 and self.column == 0 and self.page == self.page_start:
            # 흔한 경우(드라이버의 show): 쪽 시작부터 줄줄이 — 한 번에 복사하고 남은 것만 한 바이트씩
            span = (self.page_end - self.page_start + 1) * COLUMNS if self.page_end >= self.page_start else 0
            count = min(len(data), span)
            start = self.page_start * COLUMNS
            ram[start : start + count] = bytes(data[:count])
            pages, rest = divmod(count, COLUMNS)
            self.page = self.page_start + pages
            self.column = rest
            if self.page > self.page_end:
                self.page = self.page_start
            data = data[count:]
        for byte in data:
            ram[(self.page & 0x07) * COLUMNS + (self.column & 0x7F)] = byte
            self._advance()
        self.revision += 1

    def _advance(self):
        if self.addressing == 0:
            self.column += 1
            if self.column > self.col_end:
                self.column = self.col_start
                self.page += 1
                if self.page > self.page_end:
                    self.page = self.page_start
        elif self.addressing == 1:
            self.page += 1
            if self.page > self.page_end:
                self.page = self.page_start
                self.column += 1
                if self.column > self.col_end:
                    self.column = self.col_start
        else:
            self.column += 1
            if self.column > COLUMNS - 1:
                self.column = 0

    def status(self):
        """읽기 바이트: 비트 6 = 화면 꺼짐(데이터시트 상태 레지스터)"""
        return 0x40 if not self.display_on else 0x00


class OledI2cDevice:
    """I2C 장치(apc_board_i2c의 장치 약속): SSD1306 호환 OLED"""

    def __init__(self, entry):
        self.entry = entry
        self.device_id = entry["id"]
        self.i2c_address = DEFAULT_ADDRESS
        self.oled = Ssd1306()
        self.texts = []
        self._texts_revision = 0
        self._published = None

    def i2c_start(self, read):
        self.oled.begin()
        return True

    def i2c_write(self, data):
        self.oled.feed(bytes(data))
        self._publish()
        return len(data)

    def i2c_read(self, count):
        return bytes((self.oled.status(),)) * count

    def i2c_stop(self):
        self.oled.begin()

    def i2c_hint(self, data):
        texts = []
        if isinstance(data, (list, tuple)):
            for item in data:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    texts.append({"x": int(item.get("x", 0)), "y": int(item.get("y", 0)), "text": item["text"]})
        texts.sort(key=lambda item: (item["y"], item["x"]))
        if texts != self.texts:
            self.texts = texts
            self._texts_revision += 1
            self._publish()

    def state(self):
        oled = self.oled
        return {
            "v": 1,
            "width": COLUMNS,
            "height": PAGES * 8,
            "ram": bytes(oled.ram),
            "on": oled.display_on,
            "invert": oled.inverse,
            "entire": oled.entire_on,
            "contrast": oled.contrast,
            "remap": oled.seg_remap,
            "flip": oled.com_reverse,
            "texts": [dict(item) for item in self.texts],
        }

    def _publish(self):
        key = (self.oled.revision, self._texts_revision)
        if key == self._published:
            return
        self._published = key
        apc_board.set_device_state(self.device_id, PART_ID, self.state())


apc_board.register_part(PART_ID, OledI2cDevice)
