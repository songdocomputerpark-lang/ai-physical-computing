# 60초 카운트다운 타이머 - BOOT 버튼을 누르면 다시 시작해요
# 배선은 1단계와 같아요 (DIO → GPIO 21, CLK → GPIO 22)
from machine import Pin
from tm1637 import TM1637
from time import sleep_ms, ticks_ms, ticks_diff

tm = TM1637(clk=Pin(22), dio=Pin(21))
boot = Pin(0, Pin.IN, Pin.PULL_UP)
TOTAL = 60   # 카운트다운 시간 (초)

print('카운트다운 시작 - BOOT 버튼을 누르면 처음부터')
while True:
    start = ticks_ms()
    last_half = -1
    left = TOTAL
    while True:
        elapsed = ticks_diff(ticks_ms(), start)
        left = TOTAL - elapsed // 1000
        if left <= 0:
            break
        half = elapsed // 500
        if half != last_half:
            last_half = half
            tm.numbers(left // 60, left % 60, half % 2 == 0)
            if half % 2 == 0:
                print('남은 시간:', left, '초')
        if boot.value() == 0:
            print('BOOT 버튼: 다시 시작')
            sleep_ms(400)
            break
        sleep_ms(50)
    if left <= 0:
        print('시간 끝!')
        for i in range(5):
            tm.show('0000')
            sleep_ms(300)
            tm.show('    ')
            sleep_ms(300)
