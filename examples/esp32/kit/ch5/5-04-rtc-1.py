# RTC(실시간 시계)가 시각을 알려 주는지 확인하는 코드예요.
# 센서 SDA -> GPIO 21, SCL -> GPIO 22 (LCD 도 같은 I2C 칸).
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from ds3231 import DS3231
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
rtc = DS3231(i2c)

# 시각이 틀렸으면 아래 줄 맨 앞의 # 을 지우고, 지금 시각으로 고쳐서 딱 한 번만 실행하세요.
# (년, 월, 일, 시, 분, 초, 요일(0=월 ~ 6=일), 0)
# rtc.set_time(2026, 10, 16, 14, 30, 0, 4, 0)

print('RTC 시계 테스트 시작 (SDA -> GPIO 21, SCL -> GPIO 22)')
while True:
    year, month, day, hour, minute, second, weekday, _ = rtc.get_time()
    print('{}-{:02d}-{:02d} {:02d}:{:02d}:{:02d}'.format(year, month, day, hour, minute, second))
    show(0, '{}-{:02d}-{:02d}'.format(year, month, day))
    show(1, '{:02d}:{:02d}:{:02d}'.format(hour, minute, second))
    sleep(1)
