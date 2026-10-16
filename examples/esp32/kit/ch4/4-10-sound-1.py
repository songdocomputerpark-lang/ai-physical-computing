# 사운드 센서(마이크)가 소리를 듣는지 확인하는 코드예요.
# 센서 S(AOUT) -> GPIO 32, LCD 는 I2C(SDA 21, SCL 22). 박수를 치거나 말을 해 보세요.
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep, sleep_us

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
mic = ADC(Pin(32))
mic.atten(ADC.ATTN_11DB)

def loudness():
    low = 4095
    high = 0
    for i in range(200):          # 아주 짧은 시간에 200번 읽어 가장 큰 흔들림을 찾는다
        v = mic.read()
        if v < low:
            low = v
        if v > high:
            high = v
        sleep_us(100)
    return high - low

print('사운드 센서 테스트 시작 (S -> GPIO 32)')
show(0, 'Sound Level')
while True:
    level = loudness()
    print('소리 크기:', level, '#' * (level // 40))
    show(1, '{} {}'.format(level, '#' * min(10, level // 100)))
    sleep(0.2)
