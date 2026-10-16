# 전자 주사위 - BOOT 버튼을 누르면 주사위가 굴러가요
# 배선은 1단계와 같아요 (DIN → 23, CLK → 25, CS → 26)
from machine import Pin, SPI
from max7219 import Max7219
from time import sleep_ms
import random

spi = SPI(1, baudrate=10000000, polarity=1, phase=0,
          sck=Pin(25), mosi=Pin(23))
cs = Pin(26, Pin.OUT)
display = Max7219(8, 8, spi, cs, True)
display.brightness(8)
boot = Pin(0, Pin.IN, Pin.PULL_UP)

# 주사위 눈(점) 위치 (x, y) - 점 하나는 2x2 칸
PIPS = {
    1: [(3, 3)],
    2: [(1, 1), (5, 5)],
    3: [(1, 1), (3, 3), (5, 5)],
    4: [(1, 1), (5, 1), (1, 5), (5, 5)],
    5: [(1, 1), (5, 1), (3, 3), (1, 5), (5, 5)],
    6: [(1, 0), (5, 0), (1, 3), (5, 3), (1, 6), (5, 6)],
}

def show_dice(n):
    display.fill(0)
    for x, y in PIPS[n]:
        display.fill_rect(x, y, 2, 2, 1)
    display.show()

show_dice(1)
print('BOOT 버튼을 누르면 주사위를 굴려요')
while True:
    if boot.value() == 0:
        for i in range(10):
            show_dice(random.randint(1, 6))
            sleep_ms(80)
        result = random.randint(1, 6)
        show_dice(result)
        print('주사위 결과:', result)
        sleep_ms(500)
    sleep_ms(20)
