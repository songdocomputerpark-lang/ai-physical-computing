# 물체가 가까워질수록 LED 가 빨리 깜빡이고, 아주 가까우면 계속 켜지는 코드예요.
# 배선은 1단계와 같아요. 손바닥을 센서 앞에서 천천히 가까이 가져가 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from vl53l0x import VL53L0X
from time import ticks_ms, ticks_diff

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
tof = VL53L0X(i2c)
led = Pin(2, Pin.OUT)    # 보드 내장 LED

last_toggle = ticks_ms()
last_print = ticks_ms()
d = 1000
print('주차 도우미 시작! 100mm 아래면 "멈춰!"')
tof.start()
try:
    while True:
        try:
            d = tof.read()
        except Exception:
            continue
        now = ticks_ms()
        if d < 100:
            led.on()                           # 아주 가까우면 계속 켜짐
        else:
            gap = min(max(d, 100), 1000)       # 멀수록 천천히 깜빡
            if ticks_diff(now, last_toggle) >= gap:
                led.value(not led.value())
                last_toggle = now
        if ticks_diff(now, last_print) >= 300:
            last_print = now
            if d < 100:
                print('거리', d, 'mm  멈춰!')
                text = 'STOP!'
            elif d < 300:
                print('거리', d, 'mm  조심조심')
                text = 'CAREFUL'
            else:
                print('거리', d, 'mm  안전해요')
                text = 'SAFE'
            show(0, 'Dist {} mm'.format(d))
            show(1, text)
finally:
    tof.stop()
    led.off()
