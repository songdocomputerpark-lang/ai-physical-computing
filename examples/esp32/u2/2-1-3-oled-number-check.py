from machine import Pin
from machine import SoftI2C
from ssd1306 import SSD1306_I2C
from time import sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))

# OLED 초기화 (128x64 기준)
oled = SSD1306_I2C(128, 64, i2c)

oled.fill(0)
x = 123
oled.text("number: " + str(x), 0, 0)
oled.show()


