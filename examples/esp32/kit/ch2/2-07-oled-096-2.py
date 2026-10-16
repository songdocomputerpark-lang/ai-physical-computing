# 튕기는 공 애니메이션 - 벽에 부딪힌 횟수를 세어요
# 배선은 1단계와 같아요. BOOT 버튼을 누르면 횟수가 0 으로 돌아가요
from machine import Pin, SoftI2C
from ssd1306 import SSD1306_I2C
from time import sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
oled = SSD1306_I2C(128, 64, i2c, addr=0x3C)
boot = Pin(0, Pin.IN, Pin.PULL_UP)

SIZE = 6
x, y = 10, 20
dx, dy = 3, 2
bounces = 0

print('튕기는 공 시작 - BOOT 버튼으로 횟수 지우기')
while True:
    x += dx
    y += dy
    if x <= 0 or x >= 128 - SIZE:
        dx = -dx
        x = max(0, min(x, 128 - SIZE))
        bounces += 1
        print('부딪힌 횟수:', bounces)
    if y <= 12 or y >= 64 - SIZE:
        dy = -dy
        y = max(12, min(y, 64 - SIZE))
        bounces += 1
        print('부딪힌 횟수:', bounces)
    if boot.value() == 0:
        bounces = 0
        print('횟수를 0 으로 되돌렸어요')
    oled.fill(0)
    oled.text('Bounce: {}'.format(bounces), 0, 0)
    oled.fill_rect(x, y, SIZE, SIZE, 1)
    oled.show()
    sleep_ms(20)
