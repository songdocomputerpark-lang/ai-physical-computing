# 제스처 센서(APDS9960)가 손 움직임을 알아보는지 확인하는 코드예요.
# 센서 SDA -> GPIO 21, SCL -> GPIO 22 (LCD 도 같은 I2C 칸). 센서 위에서 손을 휙 움직여 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from apds9960 import uAPDS9960
from time import sleep_ms, ticks_ms, ticks_diff

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
apds = uAPDS9960(i2c)
apds.enableGestureSensor()

names = {1: '왼쪽', 2: '오른쪽', 3: '위', 4: '아래', 5: '가까이', 6: '멀리'}
english = {1: 'LEFT', 2: 'RIGHT', 3: 'UP', 4: 'DOWN', 5: 'NEAR', 6: 'FAR'}
last_msg = ticks_ms()
print('제스처 센서 테스트 시작 (SDA -> GPIO 21, SCL -> GPIO 22)')
print('센서 위 5~10cm 에서 손을 휙 움직여 보세요.')
show(0, 'Gesture:')
show(1, 'Waiting...')
while True:
    if apds.isGestureAvailable():
        motion = apds.readGesture()
        if motion in names:
            print('손이 움직였어요:', names[motion])
            show(1, english[motion])
        last_msg = ticks_ms()
    elif ticks_diff(ticks_ms(), last_msg) > 2000:
        print('기다리는 중... 손을 움직여 보세요')
        last_msg = ticks_ms()
    sleep_ms(100)
