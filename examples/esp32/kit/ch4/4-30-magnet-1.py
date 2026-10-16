# 자석 감지 센서 기본 테스트 — 자석을 가까이 대면 값이 바뀐다. S → GPIO 32, V → 3V3.
# 자석의 N극·S극을 바꿔 대 보고, 가까이·멀리 움직이며 값을 보세요.
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

adc = ADC(Pin(32))
adc.atten(ADC.ATTN_11DB)             # 0 ~ 3.3V 를 0 ~ 4095 로 읽는다
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD 주소 = 0x20
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

def read_avg(n=10):
    total = 0
    for i in range(n):
        total += adc.read()
        sleep_ms(2)
    return total // n

print('자석 감지 센서 테스트 시작 (S → GPIO 32)')
show(0, 'Magnet Sensor')
while True:
    v = read_avg()
    print('자기장 값:', v)
    show(1, 'Value: {}'.format(v))
    sleep_ms(200)
