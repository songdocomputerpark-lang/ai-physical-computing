# 토양 수분 센서가 살아 있는지 확인하는 코드예요. 값이 클수록 건조, 작을수록 젖어 있어요.
# 센서 AOUT -> GPIO 32, LCD 는 I2C(SDA 21, SCL 22). 값은 출력 창과 LCD 에 같이 나와요.
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
soil = ADC(Pin(32))
soil.atten(ADC.ATTN_11DB)

print('토양 수분 센서 테스트 시작 (AOUT -> GPIO 32)')
print('센서를 공기 중, 젖은 휴지, 흙에 차례로 꽂고 값을 비교해 보세요.')
while True:
    raw = soil.read()
    print('수분 센서 값:', raw)
    show(0, 'Soil Moisture')
    show(1, 'Value: {}'.format(raw))
    sleep(0.5)
