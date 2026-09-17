from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from machine import RTC
from time import sleep

# LCD 설정
i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
lcd = I2cLcd(i2c, 0x20, 2, 16)

# RTC 설정
rtc = RTC()
rtc.datetime((2025, 6, 21, 6, 11, 0, 0, 0))
# (년, 월, 일, 요일, 시, 분, 초, 0)

while True:
    t = rtc.datetime()
    time_str = "{:02}:{:02}:{:02}".\
               format(t[4], t[5], t[6])
    lcd.clear()
    lcd.putstr("Time: " + time_str)
    sleep(1)

