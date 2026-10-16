# 스위치를 ON 으로 켠 횟수와, 한 번 켜 두었던 시간을 알려 줘요. (LCD 에도 보여 줘요)
# ON 인 동안에는 내장 LED(GPIO 2)가 깜빡여요. 배선은 1단계와 같아요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

sw = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
count = 0
was_on = False
start = 0
last_blink = ticks_ms()
print('스위치를 ON / OFF 로 바꿔 보세요')
show(0, 'ON count: 0')
show(1, 'OFF')

while True:
    now_on = (sw.value() == 1)
    if now_on and not was_on:
        count += 1
        start = ticks_ms()
        print('ON! 지금까지', count, '번 켰어요')
        show(0, 'ON count: {}'.format(count))
    if was_on and not now_on:
        sec = ticks_diff(ticks_ms(), start) // 1000
        print('OFF. 이번에 켜 둔 시간:', sec, '초')
        show(1, 'OFF last {}s'.format(sec))
        led.value(0)
    if now_on:
        show(1, 'ON {}s'.format(ticks_diff(ticks_ms(), start) // 1000))
        if ticks_diff(ticks_ms(), last_blink) > 250:
            led.value(not led.value())
            last_blink = ticks_ms()
    was_on = now_on
    sleep_ms(50)
