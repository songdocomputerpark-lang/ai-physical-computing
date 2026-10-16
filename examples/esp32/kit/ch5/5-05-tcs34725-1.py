# RGB 컬러 센서(TCS34725)가 색을 읽는지 확인하는 코드예요.
# 센서 SDA -> GPIO 21, SCL -> GPIO 22 (LCD 도 같은 I2C 칸). 색종이를 센서 가까이 대 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from tcs34725 import TCS34725
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
sensor = TCS34725(i2c)

print('컬러 센서 테스트 시작 (SDA -> GPIO 21, SCL -> GPIO 22)')
while True:
    r, g, b, c = sensor.read(True)    # True: 가공하지 않은 값
    print('빨강:', r, '초록:', g, '파랑:', b, '전체 밝기:', c)
    show(0, 'R{} G{}'.format(r, g))
    show(1, 'B{} C{}'.format(b, c))
    sleep(0.5)
