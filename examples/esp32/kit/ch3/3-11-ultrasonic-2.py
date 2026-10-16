# 10cm 안으로 무언가 가까이 오면 '침입자 감지!' 경보를 울려요. (내장 LED 깜빡임 + LCD)
# 3번 재어서 평균을 쓰므로 값이 덜 흔들려요. 배선은 1단계와 같아요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from hcsr04 import HCSR04
from time import sleep_ms

sensor = HCSR04(trigger_pin=25, echo_pin=23, echo_timeout_us=30000)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
LIMIT = 10          # 이 거리(cm)보다 가까우면 경보
alerts = 0
print('침입자 감지기 시작 (', LIMIT, 'cm 안으로 들어오면 경보)')
show(0, 'Intruder alarm')

def read_avg():
    total = 0
    n = 0
    for i in range(3):
        try:
            total += sensor.distance_cm()
            n += 1
        except OSError:
            pass
        sleep_ms(20)
    if n == 0:
        return None
    return total / n

while True:
    d = read_avg()
    if d is None:
        show(1, 'Nothing seen')
        led.value(0)
    elif d < LIMIT:
        alerts += 1
        print('침입자 감지! 거리', int(d), 'cm (경보', alerts, '번째)')
        show(1, 'ALERT! {}cm'.format(int(d)))
        led.value(not led.value())
    else:
        show(1, 'Safe {}cm'.format(int(d)))
        led.value(0)
    sleep_ms(300)
