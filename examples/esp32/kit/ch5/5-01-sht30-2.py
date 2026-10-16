# 온도와 습도로 '불쾌지수'를 계산해서 쾌적한지 알려 줘요. 불쾌지수가 75 이상이면 내장 LED 가 켜져요.
# 불쾌지수 = 0.81 x 온도 + 0.01 x 습도 x (0.99 x 온도 - 14.3) + 46.3   (LCD 에도 보여 줘요)
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from sht30 import SHT30
from time import sleep

sensor = SHT30(scl_pin=22, sda_pin=21)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20)는 센서와 같은 I2C 선(SDA 21, SCL 22)을 함께 써요
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
sensor.i2c = i2c                     # 센서도 같은 버스를 쓰게 맞춰요
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('불쾌지수 계산기 시작')

while True:
    try:
        t, h = sensor.measure()
    except Exception:
        print('센서를 읽지 못했어요')
        show(0, 'Read error')
        sleep(1)
        continue
    di = 0.81 * t + 0.01 * h * (0.99 * t - 14.3) + 46.3
    if di < 68:
        word, eng = '쾌적해요', 'Comfy'
    elif di < 75:
        word, eng = '보통이에요', 'Normal'
    elif di < 80:
        word, eng = '불쾌해요', 'Uneasy'
    else:
        word, eng = '매우 불쾌해요!', 'VERY BAD!'
    led.value(1 if di >= 75 else 0)
    print('온도', round(t, 1), '도, 습도', round(h, 1), '% -> 불쾌지수', round(di, 1), word)
    show(0, '{}C {}%'.format(round(t, 1), int(h)))
    show(1, 'DI {} {}'.format(round(di, 1), eng))
    sleep(2)
