#ESP32BLE.py 파일을 ESP32에 업로드 후 실행
import ESP32BLE
import time 
from machine import Pin
from time import sleep


# 블루투스 통신 시작하기
ble = ESP32BLE.init("ESP32")

