# 빗물 감지 센서 기본 테스트 — 센서 판의 무늬(트레이스)에 물방울이 닿으면 값이 올라간다. S → GPIO 32, V → 3V3.
# 손가락에 물을 묻혀 판을 톡톡 건드리거나 분무기로 뿌려 보세요. 마르면 값이 다시 내려가요.
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

print('빗물 감지 센서 테스트 시작 (S → GPIO 32)')
show(0, 'Rain Sensor')
while True:
    v = read_avg()
    print('빗물 값:', v, '(마른 상태에 가까우면 작고, 젖을수록 커져요)')
    show(1, 'Value: {}'.format(v))
    sleep_ms(300)
