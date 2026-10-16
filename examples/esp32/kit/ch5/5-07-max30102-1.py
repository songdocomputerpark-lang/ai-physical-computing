# 심박 센서(MAX30102)가 손가락을 알아보는지 확인하는 코드예요.
# 센서 SDA -> GPIO 21, SCL -> GPIO 22 (LCD 도 같은 I2C 칸). 손가락을 센서 위에 살짝 올려 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from max30105 import MAX30105
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=100000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
sensor = MAX30105(i2c, 0x57)
sensor.setup_sensor()
sensor.setPulseAmplitudeRed(0x0A)
sensor.setPulseAmplitudeGreen(0x00)

print('심박 센서 테스트 시작 (SDA -> GPIO 21, SCL -> GPIO 22)')
while True:
    red, ir, green = sensor.read_sensor_multiLED(0)
    if red >= 40000:
        print('손가락이 있어요! 적색:', red, '적외선:', ir)
        show(0, 'Finger OK')
    else:
        print('손가락을 올려 주세요. 적색:', red)
        show(0, 'No finger')
    show(1, 'Red {}'.format(red))
    sleep(0.3)
