# 진동 모터 기본 동작 테스트: 0.5초 진동, 0.5초 쉬기를 반복합니다.
# 진동 모터의 S 선을 GPIO 23 에 꽂으세요. (손가락으로 살짝 만져 보세요)
from machine import Pin
from time import sleep_ms

print('진동 모터 테스트 시작 (S → GPIO 23)')
vibra = Pin(23, Pin.OUT)
try:
    while True:
        vibra.value(1)
        print('부르르~ 진동')
        sleep_ms(500)
        vibra.value(0)
        print('멈춤')
        sleep_ms(500)
finally:
    vibra.value(0)
