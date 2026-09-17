from machine import Pin
from time import sleep

r = Pin(27, Pin.OUT)
b = Pin(33, Pin.OUT)

# 레이저 출력 핀
laser = Pin(21, Pin.OUT)

# 색상 설정 함수
def set_color(r_on, b_on):
    r.value(r_on)
    b.value(b_on)

# 메인 루프
while True:
    laser.on()          # 레이저 ON
    set_color(1, 0, 0)  # 빨간색 LED
    sleep(1)

    laser.off()         # 레이저 OFF
    set_color(0, 0, 1)  # 파란색 LED
    sleep(1)

