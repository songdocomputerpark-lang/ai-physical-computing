# MQ5 가스 센서가 살아 있는지 확인하는 코드예요. (LPG와 천연가스 에 반응해요)
# 센서 S -> GPIO 32, LCD 는 I2C(SDA 21, SCL 22). 센서가 뜨거워져야 정확하니 처음 10초는 예열해요.
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
gas = ADC(Pin(32))
gas.atten(ADC.ATTN_11DB)

print('MQ5 가스 센서 테스트 시작 (S -> GPIO 32)')
print('센서 안 열선이 뜨거워지는 중이에요. 10초 예열합니다...')
for sec in range(10, 0, -1):
    print('예열 중...', sec, '초 남음')
    show(0, 'Warming up...')
    show(1, '{} sec left'.format(sec))
    sleep(1)
while True:
    value = gas.read()
    print('MQ5 값:', value, '#' * (value // 100))
    show(0, 'MQ5 Gas')
    show(1, 'Value: {}'.format(value))
    sleep(0.5)
