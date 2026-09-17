from machine import Pin
from time import sleep

# 터치 센서 입력 핀
touch = Pin(17, Pin.IN)

# 부저 출력 핀
buzzer = Pin(15, Pin.OUT)
buzzer.off()

prev_touch = 0

while True:
    touch_state = touch.value()
    if touch_state == 1 and\
    prev_touch == 0:
        buzzer.on()
        print('buzzer on')
        sleep(0.5) # 짧게 소리
        buzzer.off()
        print('buzzer off')
    prev_touch = touch_state
    sleep(0.05)

