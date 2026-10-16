# RGB LED 테스트 - 일곱 가지 색이 차례로 나와요
# 배선: Red → GPIO 23, Green → GPIO 25, Blue → GPIO 26
from machine import Pin
from time import sleep

r = Pin(23, Pin.OUT)
g = Pin(25, Pin.OUT)
b = Pin(26, Pin.OUT)

colors = [
    ('빨강', 1, 0, 0), ('초록', 0, 1, 0), ('파랑', 0, 0, 1),
    ('노랑', 1, 1, 0), ('하늘', 0, 1, 1), ('보라', 1, 0, 1),
    ('하양', 1, 1, 1),
]

print('RGB LED 테스트 시작 (R → 23, G → 25, B → 26)')
try:
    while True:
        for name, rv, gv, bv in colors:
            r.value(rv)
            g.value(gv)
            b.value(bv)
            print('지금 색:', name)
            sleep(0.8)
finally:
    r.off()
    g.off()
    b.off()
