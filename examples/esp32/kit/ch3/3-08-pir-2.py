# 사람이 센서 앞을 지나갈 때마다 방문자 수를 세어요. (LCD 에도 보여 줘요)
# 감지되면 내장 LED(GPIO 2)가 5초 동안 켜져요. 배선은 1단계와 같아요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

pir = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
visitors = 0
last = 0
led_until = 0
last_time = None
print('방문자 카운터 시작 (센서 앞을 지나가 보세요)')
show(0, 'Visitor counter')
show(1, 'Visitors: 0')

while True:
    v = pir.value()
    if v == 1 and last == 0:
        visitors += 1
        led.value(1)
        led_until = ticks_ms() + 5000
        if last_time is not None:
            gap = ticks_diff(ticks_ms(), last_time) // 1000
            print('방문자', visitors, '번째! 앞 사람과', gap, '초 차이')
        else:
            print('방문자', visitors, '번째!')
        last_time = ticks_ms()
        show(1, 'Visitors: {}'.format(visitors))
    last = v
    if led.value() and ticks_diff(ticks_ms(), led_until) > 0:
        led.value(0)
    sleep_ms(50)
