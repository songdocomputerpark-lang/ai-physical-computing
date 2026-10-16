# 블루투스 기본 동작 테스트: 1초마다 'Hello Bluetooth' 를 보내고, 받은 글자를 화면에 보여 줍니다.
# 모듈 TX → GPIO 25, RX → GPIO 26. 휴대폰 «시리얼 블루투스 터미널» 앱으로 모듈에 연결해 보세요.
from machine import UART
from time import sleep_ms, ticks_ms, ticks_diff

print('블루투스 테스트 시작 (모듈 TX → GPIO 25, 모듈 RX → GPIO 26)')
bt = UART(2, baudrate=9600, tx=26, rx=25)
t_last = ticks_ms()
count = 0
while True:
    if bt.any():
        data = bt.read()
        try:
            print('받은 글:', data.decode().strip())
        except Exception:
            print('받은 데이터:', data)
    if ticks_diff(ticks_ms(), t_last) >= 1000:
        t_last = ticks_ms()
        count += 1
        bt.write('Hello Bluetooth ' + str(count) + '\r\n')
        print('보냄:', count)
    sleep_ms(20)
