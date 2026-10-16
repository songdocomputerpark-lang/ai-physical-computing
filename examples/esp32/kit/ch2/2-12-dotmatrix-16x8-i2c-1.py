# 16x8 도트 매트릭스(I2C) 테스트 - 글자가 왼쪽으로 흘러가요
# 배선: SDA → GPIO 21, SCL → GPIO 22
from machine import Pin, SoftI2C
from ht16k33 import HT16K33Matrix16x8
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
display = HT16K33Matrix16x8(i2c)
display.set_brightness(10)
display.set_angle(270)   # 화면 방향 맞추기

print('16x8 도트 매트릭스(I2C) 테스트 시작 (SDA → GPIO 21, SCL → GPIO 22)')
while True:
    print('글자 흘리기')
    display.clear().draw()
    display.scroll_text('    Hello Brixel    ')
    sleep(0.5)
