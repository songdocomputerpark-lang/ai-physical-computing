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

- SH1106(width, height, i2c, addr=0x3C, external_vcc=False)와 SH1106_I2C(같은 인자 — 판 1.5.0부터 robert-hh 판의 넷째 자리 res도, 아래 클래스 설명): fill·pixel·text·…·show(), poweroff()·poweron()·
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
    """I2C로 잇는 SH1106 OLED — 원고 코드의 이름. 두 드라이버의 인자 차례를 모두 받는다(판 1.5.0):

    - 교과서 원고(134쪽 스크린숏) 판: SH1106_I2C(width, height, i2c, addr=0x3C, external_vcc=False) — 넷째 자리가 주소(정수)
    - robert-hh/SH1106 판(키트 장치 도감 2.08이 쓰는 브릭셀 배포 sh1106.py — 그 파일 머리말 "Original from: …robert-hh/SH1106"):
      SH1106_I2C(width, height, i2c, res=None, addr=0x3c, external_vcc=False) — 넷째 자리가 리셋 핀(Pin 또는 None)
    넷째 자리에 정수가 오면 교과서 판(주소, 다섯째 자리는 external_vcc)으로, None이나 핀이 오면 robert-hh 판으로 읽는다.
    """

    def __init__(self, width, height, i2c, res=None, addr=0x3C, external_vcc=False):
        if isinstance(res, int) and not isinstance(res, bool):
            # 교과서 판: SH1106_I2C(128, 64, i2c, 0x3D) / SH1106_I2C(128, 64, i2c, 0x3C, True)
            if isinstance(addr, bool):
                external_vcc = addr
            res, addr = None, res
        self.res = res
        if res is not None:
            # robert-hh 판과 같이 리셋 핀을 출력 1로 둔다(가상 OLED 장치는 리셋 핀을 보지 않는다 — 핀 상태 표에만 보인다)
            res.init(res.OUT, value=1)
        super().__init__(width, height, i2c, addr, external_vcc)

    def reset(self):
        """robert-hh 판의 reset(): 리셋 핀이 있으면 1 → 0 → 1로 짧게 누른다(1ms·20ms·20ms). 가상 OLED의 화면은 그대로다."""
        res = self.res
        if res is None:
            return
        import apc_board_time

        res(1)
        apc_board_time.sleep_ms(1)
        res(0)
        apc_board_time.sleep_ms(20)
        res(1)
        apc_board_time.sleep_ms(20)


class SH1106_SPI(SH1106):
    """SPI로 잇는 SH1106 OLED — 가상 보드는 흉내 내지 않는다(이름만)"""

    def __init__(self, width, height, spi, dc, res=None, cs=None, *args, **kwargs):
        raise NotImplementedError(
            "가상 보드에는 SPI로 잇는 OLED(SH1106_SPI)가 아직 없어요. 교과서 키트의 OLED는 I2C라 SH1106_I2C(128, 64, i2c)를 써요. SPI 연결은 실물 보드에서 확인해요."
        )
