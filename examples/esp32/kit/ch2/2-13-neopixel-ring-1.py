# RGB 링(NeoPixel 16) 테스트 - 빨강·초록·파랑으로 켜고, 한 칸씩 돌아요
# 배선: DIN → GPIO 23 (GND → GND, VCC → 5V)
from machine import Pin
from neopixel import NeoPixel
from time import sleep, sleep_ms

N = 16
np = NeoPixel(Pin(23), N)

def fill(color):
    for i in range(N):
        np[i] = color
    np.write()

print('NeoPixel 링 테스트 시작 (DIN → GPIO 23)')
try:
    while True:
        for name, color in (('빨강', (40, 0, 0)), ('초록', (0, 40, 0)), ('파랑', (0, 0, 40))):
            print('전체', name)
            fill(color)
            sleep(0.8)
        print('한 칸씩 돌기')
        for i in range(N):
            fill((0, 0, 0))
            np[i] = (40, 40, 40)
            np.write()
            sleep_ms(80)
finally:
    fill((0, 0, 0))
