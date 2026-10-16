# 두 자리 숫자 카운터 - 1초마다 올라가요, BOOT 버튼으로 멈춤/계속
# 배선은 1단계와 같아요 (DIN → 23, CLK → 25, CS → 26)
from machine import Pin, SPI
from max7219 import Max7219
from time import sleep_ms, ticks_ms, ticks_diff

spi = SPI(1, baudrate=10000000, polarity=1, phase=0,
          sck=Pin(25), mosi=Pin(23))
cs = Pin(26, Pin.OUT)
display = Max7219(16, 8, spi, cs, False)
display.brightness(8)
boot = Pin(0, Pin.IN, Pin.PULL_UP)

def draw(n):
    display.fill(0)
    display.text('{:02d}'.format(n), 0, 0, 1)
    display.show()

n = 0
paused = False
last_btn = 1
last_tick = ticks_ms()
draw(n)
print('카운터 시작 - BOOT 버튼으로 멈춤/계속')
while True:
    btn = boot.value()
    if last_btn == 1 and btn == 0:
        paused = not paused
        print('멈춤' if paused else '계속', '- 지금 숫자:', n)
    last_btn = btn
    if not paused and ticks_diff(ticks_ms(), last_tick) >= 1000:
        last_tick = ticks_ms()
        n = (n + 1) % 100
        draw(n)
    sleep_ms(20)
