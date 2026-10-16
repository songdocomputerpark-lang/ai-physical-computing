from machine import Pin
from time import sleep

led = Pin(2, Pin.OUT)

# LED 깜빡이기 (1초 간격)
while True:
    led.on()        # LED 켜기
    print("LED ON")
    sleep(1)        # 1초 대기
    led.off()       # LED 끄기
    print("LED OFF")
    sleep(1)        # 1초 대기
