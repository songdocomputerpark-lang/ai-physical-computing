# LED 켜고 끄기 테스트 - 켜졌다 꺼졌다 하면 성공!
# 배선: LED 의 S 선 → GPIO 4 (G → GND, V → 3V3)
from machine import Pin
from time import sleep

led = Pin(4, Pin.OUT)
print('LED 테스트 시작 (S → GPIO 4)')
try:
    while True:
        led.on()
        print('LED 켜짐')
        sleep(1)
        led.off()
        print('LED 꺼짐')
        sleep(1)
finally:
    led.off()
