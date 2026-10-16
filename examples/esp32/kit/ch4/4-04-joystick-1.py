# 조이스틱의 X, Y 값을 읽어요. X → GPIO 32, Y → GPIO 33 에 꽂았어요.
# 가운데에 두면 약 2000 근처, 끝까지 밀면 0 또는 4095 근처가 돼요. (LCD 에도 나와요)
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

x = ADC(Pin(32))
y = ADC(Pin(33))
x.atten(ADC.ATTN_11DB)
y.atten(ADC.ATTN_11DB)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('조이스틱 테스트 시작 (X → GPIO 32, Y → GPIO 33)')
show(0, 'Joystick')

while True:
    vx = x.read()
    vy = y.read()
    print('X:', vx, ' Y:', vy)
    show(1, 'X{} Y{}'.format(vx, vy))
    sleep_ms(300)
