# 무지개 색으로 변하는 RGB LED - PWM 으로 색을 섞어요
# 배선은 1단계와 같아요. BOOT 버튼을 누르면 밝기가 바뀌어요 (약 → 중 → 강)
from machine import Pin, PWM
from time import sleep_ms, ticks_ms, ticks_diff

r = PWM(Pin(23), freq=1000)
g = PWM(Pin(25), freq=1000)
b = PWM(Pin(26), freq=1000)
boot = Pin(0, Pin.IN, Pin.PULL_UP)
levels = [64, 128, 255]
names = ['약', '중', '강']
li = 1

def wheel(pos):
    # 0~255 → 무지개 색 (빨강 → 초록 → 파랑 → 빨강)
    pos = pos % 256
    if pos < 85:
        return (255 - pos * 3, pos * 3, 0)
    if pos < 170:
        pos -= 85
        return (0, 255 - pos * 3, pos * 3)
    pos -= 170
    return (pos * 3, 0, 255 - pos * 3)

print('무지개 LED 시작 - BOOT 버튼으로 밝기 바꾸기')
last_press = 0
pos = 0
try:
    while True:
        if boot.value() == 0 and ticks_diff(ticks_ms(), last_press) > 400:
            last_press = ticks_ms()
            li = (li + 1) % 3
            print('밝기:', names[li])
        rv, gv, bv = wheel(pos)
        lv = levels[li]
        r.duty_u16(rv * lv * 257 // 255)
        g.duty_u16(gv * lv * 257 // 255)
        b.duty_u16(bv * lv * 257 // 255)
        pos += 1
        sleep_ms(20)
finally:
    r.duty_u16(0)
    g.duty_u16(0)
    b.duty_u16(0)
    r.deinit()
    g.deinit()
    b.deinit()
