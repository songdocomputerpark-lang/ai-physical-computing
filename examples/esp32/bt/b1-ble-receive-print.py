#ESP32BLE.py 파일을 ESP32에 업로드 후 실행
import ESP32BLE
import time

# 블루투스 통신 시작하기
ble = ESP32BLE.init("ESP32")

while True:
    data = ble.read()  # Bluetooth 데이터 읽기
    if data:
        print("수신 데이터:", data)
    time.sleep(0.1)