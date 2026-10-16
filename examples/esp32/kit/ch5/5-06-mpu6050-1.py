# 6축 자이로(MPU6050)가 움직임을 느끼는지 확인하는 코드예요.
# 센서 SDA -> GPIO 21, SCL -> GPIO 22 (LCD 도 같은 I2C 칸). 센서를 기울이거나 흔들어 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from mpu6050 import MPU6050
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
mpu = MPU6050(i2c)

print('MPU6050 테스트 시작 (SDA -> GPIO 21, SCL -> GPIO 22)')
while True:
    v = mpu.get_values()
    ax = v['AcX'] / 16384     # 가속도를 g(중력) 단위로
    ay = v['AcY'] / 16384
    az = v['AcZ'] / 16384
    gx = v['GyX'] / 131       # 도/초 단위
    print('가속도(g) X:', '{:.2f}'.format(ax), 'Y:', '{:.2f}'.format(ay), 'Z:', '{:.2f}'.format(az),
          ' 도는 속도 X:', '{:.0f}'.format(gx))
    show(0, 'X{:.2f} Y{:.2f}'.format(ax, ay))
    show(1, 'Z{:.2f} Gx{:.0f}'.format(az, gx))
    sleep(0.3)
