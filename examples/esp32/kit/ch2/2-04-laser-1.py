# 레이저 테스트 - 1초 켜고 1초 끄기를 반복해요
# 배선: S → GPIO 4 (G → GND, V → 3V3)
# ⚠ 레이저는 절대 사람이나 동물의 눈에 비추지 마세요!
from machine import Pin
from time import sleep

laser = Pin(4, Pin.OUT)
print('레이저 테스트 시작 (S → GPIO 4)')
try:
    while True:
        laser.on()
        print('레이저 켜짐')
        sleep(1)
        laser.off()
        print('레이저 꺼짐')
        sleep(1)
finally:
    laser.off()
