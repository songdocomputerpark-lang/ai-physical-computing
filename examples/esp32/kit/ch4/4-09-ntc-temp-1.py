# NTC 온도 센서가 살아 있는지 확인하는 코드예요.
# 센서 S -> GPIO 32, LCD 는 I2C(SDA 21, SCL 22). 손가락으로 센서를 감싸 보세요.
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
ntc = ADC(Pin(32))
ntc.atten(ADC.ATTN_11DB)

print('NTC 온도 센서 테스트 시작 (S -> GPIO 32)')
while True:
    raw = ntc.read()
    volt = raw * 3.3 / 4095
    print('NTC 값:', raw, ' 전압:', '{:.2f}'.format(volt), 'V')
    show(0, 'NTC Raw: {}'.format(raw))
    show(1, 'Volt: {:.2f} V'.format(volt))
    sleep(0.5)
