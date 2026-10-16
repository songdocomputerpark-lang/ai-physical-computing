# BLE 모듈 기본 동작 테스트: 1초마다 'Hello BLE' 를 보내고, 받은 글자를 화면에 보여 줍니다.
# 모듈 TX → GPIO 25, RX → GPIO 26. 휴대폰 BLE 터미널 앱(nRF Connect 등)으로 연결해 보세요.
from machine import UART
from time import sleep_ms, ticks_ms, ticks_diff

print('BLE 테스트 시작 (모듈 TX → GPIO 25, 모듈 RX → GPIO 26)')
ble = UART(2, baudrate=9600, tx=26, rx=25)
t_last = ticks_ms()
count = 0
while True:
    if ble.any():
        data = ble.read()
        try:
            print('받은 글:', data.decode().strip())
        except Exception:
            print('받은 데이터:', data)
    if ticks_diff(ticks_ms(), t_last) >= 1000:
        t_last = ticks_ms()
        count += 1
        ble.write('Hello BLE ' + str(count) + '\r\n')
        print('보냄:', count)
    sleep_ms(20)
