import ESP32BLE
from machine import Pin
from time import sleep

# 블루투스 통신 초기화
ble = ESP32BLE.init("ESP32")

# r, g, b 핀 설정
r = Pin(27, Pin.OUT)
g = Pin(32, Pin.OUT)
b = Pin(33, Pin.OUT)

# LED 핀 배열
led = [r, g, b]

while True:
    data = ble.read()  # Bluetooth 데이터 읽기
    
    if data:
        try:
            # 데이터 파싱 (쉼표로 구분된 값)
            values = data.split(',')
            finger_x = int(values[0])
            finger_y = int(values[1])

            print(f"Received finger_x: {finger_x}, finger_y: {finger_y}")

            # 조건에 따라 LED 처리
            if finger_x < 100:
                led[0].on()  # 빨간 LED 켜기
                sleep(1)
                led[0].off()
                sleep(1)
            elif finger_y < 100:
                led[1].on()  # 초록 LED 켜기
                sleep(1)
                led[1].off()
                sleep(1)
            else:
                led[2].on()  # 파란 LED 켜기
                sleep(1)
                led[2].off()
                sleep(1)

        except Exception as e:
            print(f"Error processing data: {data}, Error: {e}")
    else:
        # 블루투스 데이터를 못 받은 경우 모든 LED 끄기
        led[0].off()
        led[1].off()
        led[2].off()
        sleep(1)
