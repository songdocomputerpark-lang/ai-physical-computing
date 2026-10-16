# GPS 기본 동작 테스트: 위성 신호를 받아 1초마다 상태를 보여 줍니다.
# 모듈 TX → GPIO 25, RX → GPIO 26. 안테나를 창가나 야외에 두세요. (처음엔 몇 분 걸려요)
from machine import UART
from time import sleep_ms, ticks_ms, ticks_diff
from micropygps import MicropyGPS

print('GPS 테스트 시작 (모듈 TX → GPIO 25, RX → GPIO 26)')
uart = UART(2, baudrate=9600, tx=26, rx=25)
gps = MicropyGPS(location_formatting='dd')
t_last = ticks_ms()
received = 0
while True:
    data = uart.read()
    if data:
        received += len(data)
        for b in data:
            gps.update(chr(b))
    if ticks_diff(ticks_ms(), t_last) >= 1000:
        t_last = ticks_ms()
        print('받은 글자 수:', received, '/ 위성 수:', gps.satellites_in_use)
        if gps.valid:
            print('  위도:', gps.latitude, ' 경도:', gps.longitude)
        else:
            print('  아직 위치를 못 찾았어요 (하늘이 보이는 곳으로!)')
    sleep_ms(20)
