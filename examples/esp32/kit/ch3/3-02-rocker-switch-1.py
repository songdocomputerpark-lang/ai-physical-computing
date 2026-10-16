# 로커 스위치가 ON 인지 OFF 인지 확인해요. S 선은 GPIO 23 에 꽂았어요.
# 스위치를 ON(I 쪽)으로 누르면 내장 LED(GPIO 2)도 켜지고, LCD 에도 ON 이 나와요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

sw = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('로커 스위치 테스트 시작 (S → GPIO 23)')
show(0, 'Rocker switch')

while True:
    if sw.value() == 1:
        print('스위치: ON (켜짐)')
        led.value(1)
        show(1, 'State: ON')
    else:
        print('스위치: OFF (꺼짐)')
        led.value(0)
        show(1, 'State: OFF')
    sleep_ms(300)
