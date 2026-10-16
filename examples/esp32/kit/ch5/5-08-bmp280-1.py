# 기압 센서(BMP280)가 살아 있는지 확인하는 코드예요.
# 센서 SDA -> GPIO 21, SCL -> GPIO 22 (LCD 도 같은 I2C 칸). 센서를 손으로 감싸거나 입김을 불어 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from bmp280 import BMP280
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
bmp = BMP280(i2c)

print('기압 센서 테스트 시작 (SDA -> GPIO 21, SCL -> GPIO 22)')
while True:
    temp = bmp.getTemp()
    press = bmp.getPress()
    alt = bmp.getAlti()
    print('온도:', '{:.1f}'.format(temp), '°C  기압:', '{:.1f}'.format(press / 100), 'hPa  고도:', '{:.1f}'.format(alt), 'm')
    show(0, 'T{:.1f}C P{:.0f}hPa'.format(temp, press / 100))
    show(1, 'Alt {:.1f} m'.format(alt))
    sleep(0.5)
