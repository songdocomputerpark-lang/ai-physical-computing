from machine import Pin
from machine import SoftI2C
from ssd1306 import SSD1306_I2C
from time import sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))

# OLED 초기화 (128x64 기준)
oled = SSD1306_I2C(128, 64, i2c)

# 화면 지우기
oled.fill(0)

# 삼각형 점 찍기 함수
def draw_triangle(x, y, size):
    if size <= 1:
        oled.pixel(x, y, 1)
    else:
        half = size // 2
        draw_triangle(x, y, half)  # 위
        draw_triangle(x - half, y + half, half)  # 좌하
        draw_triangle(x + half, y + half, half)  # 우하

# 호출 (중앙에 시작)
draw_triangle(64, 0, 64)

oled.show()
