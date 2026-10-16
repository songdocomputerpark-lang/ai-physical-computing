# 보행자 버튼 신호등 - 초록불일 때 BOOT 버튼을 누르면 곧 빨간불로 바뀌어요
# 배선은 1단계와 같아요 (Green → 23, Yellow → 25, Red → 26)
from machine import Pin
from time import sleep_ms, ticks_ms, ticks_diff

g = Pin(23, Pin.OUT)
y = Pin(25, Pin.OUT)
r = Pin(26, Pin.OUT)
button = Pin(0, Pin.IN, Pin.PULL_UP)

def all_off():
    g.off()
    y.off()
    r.off()

def wait(ms):
    # ms 동안 기다리다가 버튼이 눌리면 True 를 돌려줘요
    start = ticks_ms()
    while ticks_diff(ticks_ms(), start) < ms:
        if button.value() == 0:
            return True
        sleep_ms(20)
    return False

print('신호등 시작 - 초록불일 때 BOOT 버튼을 눌러 보세요')
try:
    while True:
        all_off()
        g.on()
        print('초록불 (최대 8초)')
        if wait(8000):
            print('보행자 버튼 눌림! 곧 빨간불로 바뀝니다')
        for i in range(4):
            g.off()
            sleep_ms(300)
            g.on()
            sleep_ms(300)
        all_off()
        y.on()
        print('노란불')
        sleep_ms(1500)
        all_off()
        r.on()
        print('빨간불 (5초) - 지금 건너세요')
        sleep_ms(5000)
finally:
    all_off()
