# 비접촉 온도 센서(MLX90614)가 살아 있는지 확인하는 코드예요.
# 센서 SDA -> GPIO 21, SCL -> GPIO 22 (LCD 도 같은 I2C 칸). 센서를 손이나 컵 쪽으로 향해 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from mlx90614 import MLX90614
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=100000)   # MLX90614 는 100kHz 까지만 돼요
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
sensor = MLX90614(i2c)

print('비접촉 온도 센서 테스트 시작 (SDA -> GPIO 21, SCL -> GPIO 22)')
while True:
    ambient = sensor.read_ambient_temp()
    target = sensor.read_object_temp()
    print('센서 주변:', '{:.1f}'.format(ambient), '°C  바라보는 물체:', '{:.1f}'.format(target), '°C')
    show(0, 'Amb {:.1f} C'.format(ambient))
    show(1, 'Obj {:.1f} C'.format(target))
    sleep(0.5)
