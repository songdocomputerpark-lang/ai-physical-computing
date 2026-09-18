#ESP32BLE.py 파일을 ESP32에 업로드 후 실행
import ESP32BLE
import time 
from machine import Pin
from time import sleep


# 블루투스 통신 시작하기
ble = ESP32BLE.init("ESP32")

# r,g,b 값 나타내기
r=Pin(12, Pin.OUT)
g=Pin(5, Pin.OUT)
b=Pin(4, Pin.OUT)

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
        

    

