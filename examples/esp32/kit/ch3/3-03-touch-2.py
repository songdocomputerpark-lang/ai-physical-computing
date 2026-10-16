# 한 번 터치할 때마다 내장 LED(GPIO 2)가 켜졌다 꺼졌다 해요. (터치 전등 스위치)
# 터치한 횟수와 LED 상태는 LCD 에도 보여요. 배선은 1단계와 같아요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

touch = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
count = 0
was_touched = False
print('터치하면 LED 가 켜지고, 또 터치하면 꺼져요')
show(0, 'Touch: 0')
show(1, 'LED OFF')

while True:
    touched = (touch.value() == 1)
    if touched and not was_touched:      # 막 만졌을 때만
        count += 1
        led.value(not led.value())
        if led.value():
            print('터치', count, '번째: LED 켜짐')
            show(1, 'LED ON')
        else:
            print('터치', count, '번째: LED 꺼짐')
            show(1, 'LED OFF')
        show(0, 'Touch: {}'.format(count))
    was_touched = touched
    sleep_ms(30)
