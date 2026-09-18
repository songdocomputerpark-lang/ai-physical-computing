#ESP32BLE.py 파일을 ESP32에 업로드 후 실행
import ESP32BLE
import time 
from machine import Pin
from time import sleep
from machine import SoftI2C
from i2c_lcd import I2cLcd



# 블루투스 통신 시작하기
ble = ESP32BLE.init("ESP32")

# lcd값 설정하기.
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000) 
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()
count = 0


while True:
    data = ble.read()  # Bluetooth 데이터 읽기
    if data=='a':
        lcd.putstr('left')
        sleep(1)
        lcd.clear()
    elif data=='b':
        lcd.putstr('right')
        sleep(1)
        lcd.clear()
    else:
        sleep(1)
        lcd.clear()
        

    


