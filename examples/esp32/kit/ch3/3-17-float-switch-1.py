from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

# 수위 센서(플로트 스위치)가 물에 떠올랐는지 읽는 코드예요. S 선은 GPIO 23 에 꽂았어요.
# 센서 막대의 부력체(둥근 고리)를 손으로 위/아래로 움직이거나, 컵에 물을 채워 보세요.
# WET 은 '물이 찼을 때' 센서가 주는 값이에요. 반대로 나오면 0 으로 바꾸세요.
sensor = Pin(23, Pin.IN)
WET = 1
print('수위 센서(플로트) 테스트 시작 (S → GPIO 23)')
show(0, 'Float switch')

while True:
    v = sensor.value()
    if v == WET:
        state, text = '물이 찼어요', 'FULL'
    else:
        state, text = '물이 낮아요', 'LOW'
    print('센서 값:', v, '→', state)
    show(1, '{} (val {})'.format(text, v))
    sleep_ms(300)
