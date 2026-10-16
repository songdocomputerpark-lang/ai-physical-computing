# SHT30 온습도 센서로 지금 온도와 습도를 읽어요. SDA → GPIO 21, SCL → GPIO 22 (I2C 단자)
# LCD 도 같은 I2C 단자에 꽂아요. 센서에 입김을 불면 습도가 확 올라가요!
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from sht30 import SHT30
from time import sleep

sensor = SHT30(scl_pin=22, sda_pin=21)
# LCD(I2C 주소 0x20)는 센서와 같은 I2C 선(SDA 21, SCL 22)을 함께 써요
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
sensor.i2c = i2c                     # 센서도 같은 버스를 쓰게 맞춰요
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('SHT30 테스트 시작 (SDA → GPIO 21, SCL → GPIO 22)')

while True:
    try:
        t, h = sensor.measure()
        print('온도:', round(t, 1), '도, 습도:', round(h, 1), '%')
        show(0, 'Temp: {} C'.format(round(t, 1)))
        show(1, 'Humi: {} %'.format(round(h, 1)))
    except Exception:
        print('센서를 읽지 못했어요. 선을 확인해 보세요')
        show(0, 'Read error')
    sleep(1)
