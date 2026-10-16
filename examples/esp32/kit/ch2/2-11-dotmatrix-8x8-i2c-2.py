# 비 내리는 화면 - 점이 위에서 아래로 떨어져요
# 배선은 1단계와 같아요. BOOT 버튼을 누르면 밝기가 바뀌어요
from machine import Pin, SoftI2C
from ht16k33 import HT16K33Matrix8x8
from time import sleep_ms, ticks_ms, ticks_diff
import random

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
display = HT16K33Matrix8x8(i2c)
display.set_angle(270)
boot = Pin(0, Pin.IN, Pin.PULL_UP)
brights = [2, 8, 15]
bi = 1
display.set_brightness(brights[bi])

drops = [-1] * 8   # 칸마다 빗방울의 높이 (-1 = 없음)
last_press = 0
print('비 내리는 화면 시작 - BOOT 버튼으로 밝기 바꾸기')
while True:
    x = random.getrandbits(3)
    if drops[x] < 0 and random.getrandbits(2) == 0:
        drops[x] = 7
    display.clear()
    for col in range(8):
        if drops[col] >= 0:
            display.plot(col, drops[col])
            drops[col] -= 1
    display.draw()
    if boot.value() == 0 and ticks_diff(ticks_ms(), last_press) > 400:
        last_press = ticks_ms()
        bi = (bi + 1) % 3
        display.set_brightness(brights[bi])
        print('밝기 단계:', bi + 1)
    sleep_ms(120)
