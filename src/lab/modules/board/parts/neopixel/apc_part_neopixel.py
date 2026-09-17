"""부품 흉내: 네오픽셀 링(WS2812 16구) — machine.bitstream이 DIN 핀으로 보낸 바이트를 LED 색으로 바꾼다(PLAN §6.2 "네오픽셀 16구 링",
원고 148~149쪽 "np[0]~np[15]", 회로 "GND·VCC·DIN(23번 핀)"). 화면 쪽은 같은 폴더의 part.ts(링 그림).

실물과 같게 맞춘 것
- WS2812는 LED마다 24비트(G·R·B 8비트씩, 높은 비트부터)를 받고 나머지를 다음 LED로 넘긴다. 한 번의 write(bitstream)은 0번 LED부터 차례로 채우고,
  신호가 끝나면(reset — 50µs 넘게 0) 색이 한꺼번에 바뀐다. 그래서 링은 write() 때만 바뀐다(원고 149쪽 첫 반복문에 write()가 없어 불이 차례로 켜지지 않는 까닭).
- 16개보다 적게 보내면 뒤쪽 LED는 전의 색을 그대로 가진다. 16개보다 많이 보내면 넘친 바이트는 링 밖으로 나간다(이을 곳 없음). 3바이트가 안 되는 끝 조각은 버린다.
- bpp=4(RGBW 순서로 4바이트씩)로 보내면 링은 3바이트씩 잘라 읽어 색이 밀린다(실물과 같음).
- 링은 [실행]마다 보드와 함께 새로 켜진 것으로 본다(모두 꺼짐). WS2812는 전원을 켜면 꺼져 있다.

화면에 보내는 상태('board.device' state): {v, count: 16, colors: 'rrggbb' × 16(16진 글자), writes: write 횟수, bytes: 마지막으로 받은 바이트 수, timing: [ns 네 개]}
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import apc_board

__all__ = ["LED_COUNT", "PART_ID", "NeoPixelRing", "decode_grb"]

PART_ID = "neopixel"
#: 키트의 네오픽셀 링 LED 수(원고 148쪽)
LED_COUNT = 16


def decode_grb(data, previous):
    """받은 바이트(G·R·B 차례)를 LED 색 목록 [(r, g, b)]로 바꾼다. 모자란 LED는 previous의 색을 그대로 둔다."""
    colors = list(previous)
    whole = min(len(colors), len(data) // 3)
    for index in range(whole):
        green, red, blue = data[index * 3], data[index * 3 + 1], data[index * 3 + 2]
        colors[index] = (red, green, blue)
    return colors


class NeoPixelRing:
    """배선의 네오픽셀 링 하나(실행마다 새로 — apc_board.register_part factory)"""

    BITSTREAM_ROLE = "din"

    def __init__(self, entry):
        self.entry = entry
        self.id = entry["id"]
        self.colors = [(0, 0, 0)] * LED_COUNT
        self.writes = 0
        self.last_bytes = 0
        self.timing = (400, 850, 800, 450)
        self.publish()

    def receive_bitstream(self, data, timing):
        self.colors = decode_grb(bytes(data), self.colors)
        self.writes += 1
        self.last_bytes = len(data)
        self.timing = tuple(timing)
        if len(data) > LED_COUNT * 3:
            apc_board.BOARD.warn_once(
                ("neopixel-extra", self.id),
                f"네오픽셀 링은 LED가 {LED_COUNT}개인데 {len(data) // 3}개만큼의 색을 보냈어요. 넘친 색은 링 밖으로 나가요 — NeoPixel(핀, {LED_COUNT})로 적어요.",
            )
        self.publish()

    def publish(self):
        apc_board.set_device_state(
            self.id,
            PART_ID,
            {
                "v": 1,
                "count": LED_COUNT,
                "colors": "".join(f"{r:02x}{g:02x}{b:02x}" for r, g, b in self.colors),
                "writes": self.writes,
                "bytes": self.last_bytes,
                "timing": list(self.timing),
            },
        )


apc_board.register_part(PART_ID, NeoPixelRing)
