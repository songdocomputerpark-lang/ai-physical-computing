# 거리 센서(VL53L0X)가 거리를 재는지 확인하는 코드예요.
# 센서 SDA -> GPIO 21, SCL -> GPIO 22 (LCD 도 같은 I2C 칸). 센서 앞에 손을 가까이/멀리 해 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from vl53l0x import VL53L0X
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
tof = VL53L0X(i2c)

print('거리 센서 테스트 시작 (SDA -> GPIO 21, SCL -> GPIO 22)')
show(0, 'Distance')
while True:
    try:
        d = tof.read()
        if d >= 8000:
            print('너무 멀어서 잴 수 없어요')
            show(1, 'Out of range')
        else:
            print('거리:', d, 'mm (', '{:.1f}'.format(d / 10), 'cm )')
            show(1, '{} mm'.format(d))
    except Exception:
        print('측정에 실패했어요. 다시 시도해요')
    sleep(0.3)
