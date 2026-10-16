# 아날로그 터치 센서의 1~4번 버튼을 눌러 보세요. S 선은 GPIO 32 에 꽂았어요.
# 버튼마다 서로 다른 값이 나와요. 값과 눌린 번호가 LCD 에도 나와요.
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

ats = ADC(Pin(32))
ats.atten(ADC.ATTN_11DB)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('아날로그 터치 테스트 시작 (S → GPIO 32)')
show(0, 'Analog touch')

while True:
    v = ats.read()
    if 608 < v < 728:
        key = '1번'
        eng = '1'
    elif 1453 < v < 1573:
        key = '2번'
        eng = '2'
    elif 2273 < v < 2393:
        key = '3번'
        eng = '3'
    elif 3139 < v < 3259:
        key = '4번'
        eng = '4'
    else:
        key = '없음'
        eng = '-'
    print('값:', v, ' 눌린 버튼:', key)
    show(1, 'Key {} Val {}'.format(eng, v))
    sleep_ms(300)
