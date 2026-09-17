from machine import Pin
from time import sleep

laser = Pin(21, Pin.OUT)

while True:
    laser.on()    # 레이저 ON
    sleep(1)
    laser.off()   # 레이저 OFF
    sleep(1)
