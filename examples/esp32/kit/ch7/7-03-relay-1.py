# 릴레이 기본 동작 테스트: 2초마다 딸깍 소리를 내며 켜고 끕니다.
# 릴레이의 S 선을 GPIO 23 에 꽂으세요. (모듈의 LED 도 같이 켜졌다 꺼져요)
from machine import Pin
from time import sleep

print('릴레이 테스트 시작 (S → GPIO 23)')
relay = Pin(23, Pin.OUT)
try:
    while True:
        relay.value(1)
        print('릴레이 켜짐 (COM 과 NO 가 연결돼요)')
        sleep(2)
        relay.value(0)
        print('릴레이 꺼짐 (COM 과 NC 가 연결돼요)')
        sleep(2)
finally:
    relay.value(0)
