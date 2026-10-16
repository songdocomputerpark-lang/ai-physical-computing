# 이퀄라이저 - 음악 막대처럼 16줄이 위아래로 움직여요
# 배선은 1단계와 같아요. BOOT 버튼을 누르면 멈춤/계속
from machine import Pin, SoftI2C
from ht16k33 import HT16K33Matrix16x8
from time import sleep_ms, ticks_ms, ticks_diff
import random

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
display = HT16K33Matrix16x8(i2c)
display.set_brightness(10)
display.set_angle(270)
boot = Pin(0, Pin.IN, Pin.PULL_UP)

bars = [0] * 16   # 줄마다 막대 높이 (0~8)
paused = False
last_press = 0
print('이퀄라이저 시작 - BOOT 버튼으로 멈춤/계속')
while True:
    if boot.value() == 0 and ticks_diff(ticks_ms(), last_press) > 400:
        last_press = ticks_ms()
        paused = not paused
        print('멈춤' if paused else '계속')
    if not paused:
        for x in range(16):
            delta = (-1, 0, 0, 1)[random.getrandbits(2)]
            bars[x] = max(0, min(8, bars[x] + delta))
        display.clear()
        for x in range(16):
            for y in range(bars[x]):
                display.plot(x, y)
        display.draw()
    sleep_ms(100)
