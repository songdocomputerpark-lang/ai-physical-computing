from machine import UART, Pin
from time import sleep

uart = UART(2, baudrate=9600,\
            tx=Pin(17), rx=Pin(16))

def send_cmd(cmd, p1=0, p2=0):
    uart.write(bytearray(\
        [0x7E, 0xFF, 0x06,\
         cmd, 0x00, p1, p2, 0xEF]))

while True:
    # 볼륨 설정
    send_cmd(0x06, 0x00, 10)  
    sleep(1)
    # 001.mp3 재생
    send_cmd(0x03, 0x00, 0x01) 
    print("안내 방송 출력")
    sleep(10)  # 10초마다 반복
