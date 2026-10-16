# 센서가 2초 넘게 기울어져 있으면 '쓰러졌어요!' 경보를 울려요. (내장 LED 깜빡임 + LCD)
# 잠깐 흔들리는 것은 무시해요. 배선은 1단계와 같아요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

tilt = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
tilted_since = None
alarm = False
last_blink = ticks_ms()
print('센서를 2초 이상 기울여 보세요')
show(0, 'Fall alarm')
show(1, 'OK')

while True:
    if tilt.value() == 1:
        if tilted_since is None:
            tilted_since = ticks_ms()
        sec = ticks_diff(ticks_ms(), tilted_since) // 100 / 10
        if ticks_diff(ticks_ms(), tilted_since) > 2000 and not alarm:
            alarm = True
            print('쓰러졌어요! 경보!')
        if alarm:
            show(1, 'FALL ALERT!')
        else:
            show(1, 'Tilted {}s'.format(sec))
    else:
        if alarm:
            print('다시 세워졌어요. 경보 끝')
        tilted_since = None
        alarm = False
        led.value(0)
        show(1, 'OK')

    if alarm and ticks_diff(ticks_ms(), last_blink) > 150:
        led.value(not led.value())
        last_blink = ticks_ms()
    sleep_ms(50)
