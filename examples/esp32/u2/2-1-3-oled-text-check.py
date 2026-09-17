from machine import Pin
from machine import SoftI2C
from ssd1306 import SSD1306_I2C
from time import sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))

# OLED 초기화 (128x64 기준)
oled = SSD1306_I2C(128, 64, i2c)

# 화면 지우기
oled.fill(0)

# 텍스트 출력 (x=0, y=0 위치에)
oled.text("Hello, ESP32!", 0, 0)
oled.text("OLED Display!", 0, 16)

# 화면에 출력 적용
oled.show()
