# 보드의 BOOT 버튼을 누르면 시작, 다시 누르면 멈추는 스톱워치예요.
# RTC 의 초 단위 시계로 시간을 재요. 배선은 1단계와 같아요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from ds3231 import DS3231
from time import sleep_ms, mktime

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
rtc = DS3231(i2c)
button = Pin(0, Pin.IN, Pin.PULL_UP)    # 눌렀을 때 0

def now_seconds():
    t = rtc.get_time()
    return mktime((t[0], t[1], t[2], t[3], t[4], t[5], 0, 0))

running = False
start = 0
shown = -1
print('BOOT 버튼을 누르면 스톱워치가 시작돼요.')
show(0, 'Stopwatch')
show(1, 'Press BOOT')
while True:
    if button.value() == 0:
        running = not running
        if running:
            start = now_seconds()
            shown = -1
            print('스톱워치 시작!')
        else:
            total = now_seconds() - start
            print('멈춤! 걸린 시간:', total, '초')
            show(1, 'Stop {} s'.format(total))
        sleep_ms(300)                       # 버튼 튀는 것 방지
        while button.value() == 0:
            sleep_ms(20)
    if running:
        elapsed = now_seconds() - start
        if elapsed != shown:
            print('경과 시간:', elapsed, '초')
            show(1, 'Run {} s'.format(elapsed))
            shown = elapsed
    sleep_ms(50)
