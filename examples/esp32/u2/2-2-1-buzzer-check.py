from machine import Pin
from time import sleep

buzzer = Pin(15, Pin.OUT)

# 1초 간격으로 소리 울리기
while True:
    buzzer.on()   # 소리 ON
    sleep(1)
    buzzer.off()  # 소리 OFF
    sleep(1)
