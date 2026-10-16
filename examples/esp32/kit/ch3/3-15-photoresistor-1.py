# 포토레지스터 | 속도 센서(디지털)가 빛을 가렸는지 알려 주는 코드예요.
# 센서 S -> GPIO 23, LCD 는 I2C(SDA 21, SCL 22). 센서 홈 사이에 손가락을 넣어 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
sensor = Pin(23, Pin.IN)

print('빛 센서 테스트 시작 (S -> GPIO 23)')
while True:
    value = sensor.value()
    if value == 1:
        print('빛이 가려졌어요 (값 1)')
        show(1, 'BLOCKED (1)')
    else:
        print('빛이 들어와요 (값 0)')
        show(1, 'LIGHT (0)')
    show(0, 'Photo Sensor')
    sleep(0.3)
