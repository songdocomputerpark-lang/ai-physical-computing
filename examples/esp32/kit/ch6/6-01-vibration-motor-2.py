# 진동 모터 심화 예제: 여러 가지 진동 패턴을 BOOT 버튼으로 골라 느껴 봅니다.
# (진동 모터 S → GPIO 23) 패턴: 알림 · 심장박동 · SOS
from machine import Pin
from time import sleep_ms

boot = Pin(0, Pin.IN, Pin.PULL_UP)   # 보드의 BOOT 버튼 (누르면 0)

def pressed():
    # 버튼을 눌렀다 떼면 True (한 번만)
    if boot.value() == 0:
        sleep_ms(30)
        while boot.value() == 0:
            sleep_ms(10)
        return True
    return False

vibra = Pin(23, Pin.OUT)
# 숫자는 (진동 ms, 쉬는 ms) 순서예요
patterns = [
    ('알림', [(200, 200), (200, 800)]),
    ('심장박동', [(120, 120), (120, 700)]),
    ('SOS', [(150, 150)] * 3 + [(450, 150)] * 3 + [(150, 150)] * 3 + [(0, 900)]),
]
index = 0

def wait(ms):
    # ms 동안 기다리다가 버튼이 눌리면 True
    for _ in range(ms // 10):
        if pressed():
            return True
        sleep_ms(10)
    return False

print('BOOT 버튼을 누르면 패턴이 바뀌어요.')
try:
    while True:
        name, steps = patterns[index]
        print('패턴:', name)
        changed = False
        for on_ms, off_ms in steps:
            if on_ms > 0:
                vibra.value(1)
                changed = wait(on_ms)
                vibra.value(0)
            if not changed:
                changed = wait(off_ms)
            if changed:
                break
        if changed:
            index = (index + 1) % len(patterns)
finally:
    vibra.value(0)
