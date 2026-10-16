# 신호등 LED 테스트 - 초록 → 노랑 → 빨강 순서로 하나씩 켜져요
# 배선: Green → GPIO 23, Yellow → GPIO 25, Red → GPIO 26
from machine import Pin
from time import sleep

g = Pin(23, Pin.OUT)
y = Pin(25, Pin.OUT)
r = Pin(26, Pin.OUT)
lights = [(g, '초록'), (y, '노랑'), (r, '빨강')]

print('신호등 테스트 시작 (Green → 23, Yellow → 25, Red → 26)')
try:
    while True:
        for led, name in lights:
            led.on()
            print(name, '불 켜짐')
            sleep(0.7)
            led.off()
finally:
    g.off()
    y.off()
    r.off()
