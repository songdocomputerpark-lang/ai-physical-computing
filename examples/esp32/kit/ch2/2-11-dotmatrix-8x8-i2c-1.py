# 8x8 도트 매트릭스(I2C) 테스트 - 알파벳이 한 글자씩 나와요
# 배선: SDA → GPIO 21, SCL → GPIO 22
from machine import Pin, SoftI2C
from ht16k33 import HT16K33Matrix8x8
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
display = HT16K33Matrix8x8(i2c)
display.set_brightness(10)
display.set_angle(270)   # 화면 방향 맞추기

print('8x8 도트 매트릭스(I2C) 테스트 시작 (SDA → GPIO 21, SCL → GPIO 22)')
while True:
    for ch in 'ABCDEFGH':
        display.clear()
        display.set_character(ord(ch), 0)
        display.draw()
        print('글자:', ch)
        sleep(0.6)
