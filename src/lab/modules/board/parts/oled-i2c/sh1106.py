"""가상 ESP32 보드의 OLED 드라이버 sh1106 — 교과서 원고(133~137쪽)가 부르는 이름 그대로(PLAN §6.1 "OLED 이름", CODE_MAPPING f054 비고).

    from machine import Pin, SoftI2C
    from sh1106 import SH1106_I2C
    oled = SH1106_I2C(128, 64, SoftI2C(scl=Pin(22), sda=Pin(21)))   # 주소를 적지 않으면 0x3C
    oled.fill(0)
    oled.text('Hello, ESP32!', 0, 0)
    oled.show()

원고의 sh1106.py(원고 134쪽 스크린숏: "Adapted for ESP32/ESP8266", class SH1106(framebuf.FrameBuffer), __init__(self, width, height, i2c,
addr=0x3C, external_vcc=False))는 자료에 파일이 없다(INVENTORY §4.1). 가상 보드는 코드 자료의 ssd1306과 같은 흉내로 두 이름을 모두 받는다
(PLAN §6.1 결정 — 실물 키트의 제어 칩이 SSD1306인지 SH1106인지는 확인 전, 부록 B-2). 그래서 이 파일은 같은 폴더의 ssd1306.py를 물려받는다.

- SH1106(width, height, i2c, addr=0x3C, external_vcc=False)와 SH1106_I2C(같은 인자): fill·pixel·text·…·show(), poweroff()·poweron()·
  contrast(c)·invert(i)·rotate(r), 그리고 흔한 SH1106 드라이버에 있는 sleep(value)(True면 화면 끔)·flip(flag=None, update=True)(위아래·좌우 뒤집기).
- SH1106_SPI는 이름만 있다(가상 보드는 SPI OLED를 흉내 내지 않음 — 만들면 NotImplementedError).
실물 보드에 올릴 sh1106.py는 사이트가 아직 주지 않는다(PROGRESS 미해결 64 — 통합 단계에서 정함). 라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import ssd1306

__all__ = ["SH1106", "SH1106_I2C", "SH1106_SPI"]


class SH1106(ssd1306.SSD1306_I2C):
    """원고 스크린숏과 같은 인자: SH1106(width, height, i2c, addr=0x3C, external_vcc=False)"""

    def __init__(self, width, height, i2c, addr=0x3C, external_vcc=False):
        self._flipped = False
        super().__init__(width, height, i2c, addr, external_vcc)

    def sleep(self, value):
        if value:
            self.poweroff()
        else:
            self.poweron()

    def flip(self, flag=None, update=True):
        """flag를 주지 않으면 지금 방향을 뒤집는다. True면 180도 돌린 방향(rotate(0)과 같은 명령). update면 화면을 다시 보낸다."""
        self._flipped = (not self._flipped) if flag is None else bool(flag)
        self.rotate(0 if self._flipped else 1)
        if update:
            self.show()


class SH1106_I2C(SH1106):
    """I2C로 잇는 SH1106 OLED — 원고 코드의 이름"""


class SH1106_SPI(SH1106):
    """SPI로 잇는 SH1106 OLED — 가상 보드는 흉내 내지 않는다(이름만)"""

    def __init__(self, width, height, spi, dc, res=None, cs=None, *args, **kwargs):
        raise NotImplementedError(
            "가상 보드는 SPI로 잇는 OLED(SH1106_SPI)를 흉내 내지 않아요. 교과서 키트의 OLED는 I2C라 SH1106_I2C(128, 64, i2c)를 써요. SPI 연결은 실물 보드에서 확인해요."
        )
