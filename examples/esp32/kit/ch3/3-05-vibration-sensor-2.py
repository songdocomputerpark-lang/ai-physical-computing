# 2초 동안 센서가 몇 번 흔들림을 느꼈는지 세어서 세기를 알려 줘요. (LCD 에도 보여 줘요)
# 흔들림이 느껴지는 동안 내장 LED(GPIO 2)가 켜져요. 배선은 1단계와 같아요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

vib = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
count = 0
last = 0
window_start = ticks_ms()
print('센서를 흔들어 보세요 (2초마다 세기를 알려 줘요)')
show(0, 'Vibration level')

while True:
    v = vib.value()
    if v == 1 and last == 0:
        count += 1
    last = v
    led.value(v)

    if ticks_diff(ticks_ms(), window_start) >= 2000:
        if count == 0:
            level, eng = '조용함', 'Quiet'
        elif count < 5:
            level, eng = '약한 흔들림', 'Weak'
        elif count < 20:
            level, eng = '보통 흔들림', 'Medium'
        else:
            level, eng = '강한 흔들림!', 'STRONG!'
        print('2초 동안', count, '번 ->', level)
        show(1, '{} ({})'.format(eng, count))
        count = 0
        window_start = ticks_ms()
    sleep_ms(2)
