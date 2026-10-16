# 꼬리 달린 불빛이 링을 빙글빙글 돌아요
# 배선은 1단계와 같아요 (DIN → GPIO 23). BOOT 버튼: 방향과 색깔이 바뀌어요
from machine import Pin
from neopixel import NeoPixel
from time import sleep_ms, ticks_ms, ticks_diff

N = 16
TAIL = 5
np = NeoPixel(Pin(23), N)
boot = Pin(0, Pin.IN, Pin.PULL_UP)
colors = [(40, 0, 0), (0, 40, 0), (0, 0, 40), (40, 25, 0)]
names = ['빨강', '초록', '파랑', '주황']

head = 0
direction = 1
ci = 0
last_press = 0
print('돌아가는 불빛 시작 - BOOT 버튼으로 방향·색 바꾸기')
try:
    while True:
        if boot.value() == 0 and ticks_diff(ticks_ms(), last_press) > 400:
            last_press = ticks_ms()
            direction = -direction
            ci = (ci + 1) % len(colors)
            print('방향·색 바뀜:', names[ci], '방향', direction)
        for i in range(N):
            np[i] = (0, 0, 0)
        r, g, b = colors[ci]
        for t in range(TAIL):
            idx = (head - direction * t) % N
            f = TAIL - t
            np[idx] = (r * f // TAIL, g * f // TAIL, b * f // TAIL)
        np.write()
        head = (head + direction) % N
        sleep_ms(60)
finally:
    for i in range(N):
        np[i] = (0, 0, 0)
    np.write()
