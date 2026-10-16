# RF433 송신기 기본 동작 테스트: 1초 동안 신호를 보내고 1초 쉬기를 반복합니다.
# 송신기의 S 선을 GPIO 23 에 꽂으세요. (수신기 5.03 의 LED/숫자 변화로 확인할 수 있어요)
from machine import Pin
from time import sleep_ms, sleep_us

print('RF433 송신기 테스트 시작 (S → GPIO 23)')
tx = Pin(23, Pin.OUT, value=0)
led = Pin(2, Pin.OUT)
try:
    while True:
        print('신호 보내는 중 (1초)')
        led.value(1)
        for _ in range(1000):      # 0.5ms 켜고 0.5ms 끄기를 1000번 = 1초
            tx.value(1)
            sleep_us(500)
            tx.value(0)
            sleep_us(500)
        led.value(0)
        print('쉬는 중 (1초)')
        sleep_ms(1000)
finally:
    tx.value(0)
    led.value(0)
