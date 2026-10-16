# 연속으로 몇 번 터치했는지 알아내요. 0.6초 안에 이어서 터치하면 한 묶음이에요.
# 묶음이 끝나면 횟수를 LCD 와 출력 창에 알려 주고, 내장 LED(GPIO 2)가 그 횟수만큼 깜빡여요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

touch = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
taps = 0
last_tap = 0
was_touched = False
print('빠르게 한 번, 두 번, 세 번 터치해 보세요')
show(0, 'Tap count')
show(1, 'Waiting...')

while True:
    touched = (touch.value() == 1)
    if touched and not was_touched:
        taps += 1
        last_tap = ticks_ms()
        show(1, 'Taps: {}...'.format(taps))
    was_touched = touched

    if taps > 0 and ticks_diff(ticks_ms(), last_tap) > 600:
        print('연속 터치:', taps, '번')
        show(0, 'Result: {} taps'.format(taps))
        for i in range(taps):
            led.value(1)
            sleep_ms(200)
            led.value(0)
            sleep_ms(200)
        taps = 0
        show(1, 'Waiting...')
    sleep_ms(20)
