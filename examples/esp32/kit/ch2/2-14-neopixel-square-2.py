# 무지개 물결 - 매트릭스 위에 무지개 색이 흘러가요
# 배선은 1단계와 같아요 (DIN → GPIO 23). BOOT 버튼: 빠르게 ↔ 느리게
from machine import Pin
from neopixel import NeoPixel
from time import sleep_ms, ticks_ms, ticks_diff

NUM_OF_LED = 18   # 브릭셀 네오픽셀 모듈은 18개(6x3). 64개짜리 8x8 판이면 64 로 바꾸세요
LEVEL = 25        # 밝기 (0~255)
np = NeoPixel(Pin(23), NUM_OF_LED)
boot = Pin(0, Pin.IN, Pin.PULL_UP)

def wheel(pos):
    # 0~255 → 무지개 색
    pos = pos % 256
    if pos < 85:
        return (255 - pos * 3, pos * 3, 0)
    if pos < 170:
        pos -= 85
        return (0, 255 - pos * 3, pos * 3)
    pos -= 170
    return (pos * 3, 0, 255 - pos * 3)

delay = 40
shift = 0
last_press = 0
print('무지개 물결 시작 - BOOT 버튼으로 속도 바꾸기')
try:
    while True:
        if boot.value() == 0 and ticks_diff(ticks_ms(), last_press) > 400:
            last_press = ticks_ms()
            delay = 10 if delay == 40 else 40
            print('속도 바뀜 (한 번에', delay, 'ms)')
        for i in range(NUM_OF_LED):
            r, g, b = wheel(i * 256 // NUM_OF_LED + shift)
            np[i] = (r * LEVEL // 255, g * LEVEL // 255, b * LEVEL // 255)
        np.write()
        shift = (shift + 4) % 256
        sleep_ms(delay)
finally:
    for i in range(NUM_OF_LED):
        np[i] = (0, 0, 0)
    np.write()
