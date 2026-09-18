#ESP32BLE.py 파일을 ESP32에 업로드 후 실행
import ESP32BLE
import time 
from machine import Pin
from time import sleep
from machine import SoftI2C
from i2c_lcd import I2cLcd
from mg90s_servo import MG90S_SERVO


# 블루투스 통신 시작하기
ble = ESP32BLE.init("ESP32")

# servo값 설정하기.
se=MG90S_SERVO(signal_pin=32)


while True:
    data = ble.read()  # Bluetooth 데이터 읽기
    if data=='a':
        se.rotate(0)
        sleep(1)
    elif data=='b':
        se.rotate(180)
        sleep(1)
    else:
        sleep(1)
        

    



