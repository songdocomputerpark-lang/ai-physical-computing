# 센서가 어느 쪽으로 기울었는지 알려 주고, 흔들면 횟수를 세는 코드예요. (배선은 1단계와 같아요)
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from mpu6050 import MPU6050
from time import sleep_ms, ticks_ms, ticks_diff

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
mpu = MPU6050(i2c)
led = Pin(2, Pin.OUT)    # 보드 내장 LED

shakes = 0
last_shake = ticks_ms()
last_state = ''
print('기울여 보고, 흔들어 보세요!')
while True:
    v = mpu.get_values()
    x = v['AcX'] / 16384
    y = v['AcY'] / 16384
    z = v['AcZ'] / 16384
    strength = (x * x + y * y + z * z) ** 0.5     # 전체 힘의 크기(가만히 있으면 약 1)
    if abs(strength - 1) > 0.6 and ticks_diff(ticks_ms(), last_shake) > 500:
        shakes += 1
        last_shake = ticks_ms()
        print('흔들렸어요!', shakes, '번째')
    if x > 0.4:
        state = 'X 방향(+)으로 기울었어요'
        text = 'Tilt X+'
    elif x < -0.4:
        state = 'X 방향(-)으로 기울었어요'
        text = 'Tilt X-'
    elif y > 0.4:
        state = 'Y 방향(+)으로 기울었어요'
        text = 'Tilt Y+'
    elif y < -0.4:
        state = 'Y 방향(-)으로 기울었어요'
        text = 'Tilt Y-'
    else:
        state = '수평이에요'
        text = 'Level'
    led.value(0 if text == 'Level' else 1)
    if state != last_state:
        print(state)
        last_state = state
    show(0, text)
    show(1, 'Shakes: {}'.format(shakes))
    sleep_ms(100)
