# RGB 매트릭스(NeoPixel) 테스트 - 불빛이 하나씩 켜지고, 전체 색이 바뀌어요
# 배선: DIN → GPIO 23 (GND → GND, VCC → 5V). 밝기는 낮게(20) 해 두었어요
from machine import Pin
from neopixel import NeoPixel
from time import sleep, sleep_ms

NUM_OF_LED = 18   # 브릭셀 네오픽셀 모듈은 18개(6x3). 64개짜리 8x8 판이면 64 로 바꾸세요
LEVEL = 20        # 밝기 (0~255, 너무 높이면 눈부시고 전류가 많이 흘러요)
np = NeoPixel(Pin(23), NUM_OF_LED)

def fill(color):
    for i in range(NUM_OF_LED):
        np[i] = color
    np.write()

print('NeoPixel 매트릭스 테스트 시작 (DIN → GPIO 23)')
try:
    while True:
        print('한 개씩 켜기')
        fill((0, 0, 0))
        for i in range(NUM_OF_LED):
            np[i] = (LEVEL, 0, 0)
            np.write()
            sleep_ms(40)
        for name, color in (('초록', (0, LEVEL, 0)), ('파랑', (0, 0, LEVEL)), ('하양', (LEVEL, LEVEL, LEVEL))):
            print('전체', name)
            fill(color)
            sleep(0.8)
finally:
    fill((0, 0, 0))
