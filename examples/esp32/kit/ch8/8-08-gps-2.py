# GPS 심화 예제: 걸어 다닌 거리(m)와 가장 빠른 속도를 기록합니다.
# BOOT 버튼을 누르면 기록을 0부터 다시 시작해요. (모듈 TX → GPIO 25, RX → GPIO 26)
from machine import Pin, UART
from time import sleep_ms, ticks_ms, ticks_diff
from math import sin, cos, sqrt, atan2, radians
from micropygps import MicropyGPS

def distance_m(lat1, lon1, lat2, lon2):
    # 두 위치 사이의 거리(m) - 지구를 둥근 공으로 보고 계산
    p1, p2 = radians(lat1), radians(lat2)
    dp, dl = p2 - p1, radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a))

uart = UART(2, baudrate=9600, tx=26, rx=25)
gps = MicropyGPS(location_formatting='dd')
boot = Pin(0, Pin.IN, Pin.PULL_UP)
total = 0.0
max_speed = 0.0
last = None
t_last = ticks_ms()
print('걸어 보세요! 하늘이 보이는 곳에서 시작하세요.')
while True:
    data = uart.read()
    if data:
        for b in data:
            gps.update(chr(b))
    if boot.value() == 0:
        total = 0.0
        max_speed = 0.0
        last = None
        print('기록을 0부터 다시 시작해요')
        while boot.value() == 0:
            sleep_ms(10)
    if ticks_diff(ticks_ms(), t_last) >= 2000:
        t_last = ticks_ms()
        if gps.valid:
            lat = gps.latitude[0] * (1 if gps.latitude[1] == 'N' else -1)
            lon = gps.longitude[0] * (1 if gps.longitude[1] == 'E' else -1)
            if last is not None:
                d = distance_m(last[0], last[1], lat, lon)
                if d > 3:                 # GPS 흔들림(3m 이하)은 무시
                    total += d
            last = (lat, lon)
            if gps.speed[2] > max_speed:
                max_speed = gps.speed[2]
            print('거리: {:.0f} m / 가장 빠른 속도: {:.1f} km/h'.format(total, max_speed))
        else:
            print('위치를 찾는 중... (위성', gps.satellites_in_use, '개)')
    sleep_ms(20)
