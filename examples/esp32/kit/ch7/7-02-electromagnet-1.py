# 전자석 기본 동작 테스트: 2초 켜고 2초 끄기를 반복합니다.
# 전자석의 S 선을 GPIO 23 에 꽂으세요. (켜졌을 때 클립이 붙는지 확인!)
from machine import Pin
from time import sleep

print('전자석 테스트 시작 (S → GPIO 23)')
magnet = Pin(23, Pin.OUT)
led = Pin(2, Pin.OUT)   # 보드 내장 LED (전자석과 같이 켜져요)
try:
    while True:
        magnet.value(1)
        led.value(1)
        print('전자석 켜짐 → 클립이 붙어요')
        sleep(2)
        magnet.value(0)
        led.value(0)
        print('전자석 꺼짐 → 클립이 떨어져요')
        sleep(2)
finally:
    magnet.value(0)
    led.value(0)
