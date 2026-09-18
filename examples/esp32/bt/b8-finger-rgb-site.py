#ESP32BLE.py 파일을 ESP32에 업로드 후 실행
import ESP32BLE
import time 
from machine import Pin
from time import sleep


# 블루투스 통신 시작하기
ble = ESP32BLE.init("ESP32")

# r,g,b 값 나타내기
r=Pin(27, Pin.OUT)  # [사이트판] 빨강 12 -> 27: 12는 ESP32BLE.py가 쓰는 상태 LED와 같은 핀이라 겹쳐요(PD-23)
g=Pin(32, Pin.OUT)  # [사이트판] 초록 5 -> 32: 5도 부팅에 쓰는 스트래핑 핀이라 함께 옮겨요(PD-23)
b=Pin(33, Pin.OUT)  # [사이트판] 파랑 4 -> 33: 블루투스 교안 83쪽 화면과 같은 핀 묶음(27/32/33)이에요

led=[r,g,b]

while True:
    data = ble.read()  # Bluetooth 데이터 읽기
    if data=='a':
        led[0].on()
        sleep(1)
        led[0].off()
        sleep(1)
    elif data=='c':
        led[1].on()
        sleep(1)
        led[1].off()
        sleep(1)
    else:
        led[0].off()
        led[1].off()
        led[2].off()
        sleep(1) 
        

    

