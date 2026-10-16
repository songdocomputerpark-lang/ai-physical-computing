# 1.3 OLED(SH1106) 테스트 - 글자 화면, 도형 화면, 색 반전을 보여 줘요
# 배선: SDA → GPIO 21, SCL → GPIO 22 (OLED 주소 0x3C)
from machine import Pin, SoftI2C
from sh1106 import SH1106_I2C
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
oled = SH1106_I2C(128, 64, i2c, None, addr=0x3C)

print('1.3 OLED 테스트 시작 (SDA → GPIO 21, SCL → GPIO 22)')
while True:
    print('글자 화면')
    oled.fill(0)
    oled.text('Hello Brixel!', 0, 0)
    oled.text('OLED 1.3 inch', 0, 16)
    oled.text('SH1106 driver', 0, 32)
    oled.show()
    sleep(2)
    print('도형 화면')
    oled.fill(0)
    oled.rect(0, 0, 128, 64, 1)
    oled.line(0, 0, 127, 63, 1)
    oled.fill_rect(10, 40, 30, 15, 1)
    oled.show()
    sleep(2)
    print('색 반전')
    oled.invert(1)
    sleep(1)
    oled.invert(0)
