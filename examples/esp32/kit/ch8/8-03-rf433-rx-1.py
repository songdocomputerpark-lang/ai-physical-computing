# RF433 수신기 기본 동작 테스트: 0.5초 동안 신호가 몇 번 바뀌었는지 세어 보여 줍니다.
# 수신기의 S 선을 GPIO 25 에 꽂으세요. 송신기가 없으면 «잡음» 때문에 숫자가 크게 나오는 것이 정상이에요.
from machine import Pin
from time import ticks_ms, ticks_diff

print('RF433 수신기 테스트 시작 (S → GPIO 25)')
rx = Pin(25, Pin.IN)
led = Pin(2, Pin.OUT)   # 수신기 신호가 1 이면 보드 LED 가 켜져요
while True:
    last = rx.value()
    changes = 0
    t0 = ticks_ms()
    while ticks_diff(ticks_ms(), t0) < 500:
        now = rx.value()
        led.value(now)
        if now != last:
            changes += 1
            last = now
    print('0.5초 동안 신호 변화:', changes, '번', '#' * min(changes // 20, 40))
