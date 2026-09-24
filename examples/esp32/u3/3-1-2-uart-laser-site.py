from machine import Pin, UART
from time import sleep  # [사이트판] 원고 190쪽처럼 sleep을 불러와요(원본 파일은 import time이라 12번 줄에서 NameError)

laser = Pin(18, Pin.OUT)
uart = UART(2, baudrate=115200, tx=17, rx=16)  # [사이트판] 원고 배선 그림(변환기 TX → GPIO16)과 같은 교차 결선

while True:
    if uart.any():
        data = uart.readline().decode().strip()
        if data == 'a':
            laser.on()
            sleep(1)
        elif data == 'b':
            laser.off()
            sleep(1)
