# 미세먼지 센서가 살아 있는지 확인하는 코드예요.
# 센서 S -> GPIO 32, LED -> GPIO 33 (전원 V 는 5V). LCD 는 I2C(SDA 21, SCL 22).
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep, sleep_us

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
dust_adc = ADC(Pin(32))
dust_adc.atten(ADC.ATTN_11DB)
dust_led = Pin(33, Pin.OUT)     # 센서 안의 적외선 LED 를 켜는 선

def read_dust():
    dust_led.on()
    sleep_us(280)              # LED 가 켜진 뒤 0.28ms 에 읽는다
    value = dust_adc.read()
    sleep_us(40)
    dust_led.off()
    sleep_us(9680)
    return value

print('미세먼지 센서 테스트 시작 (S -> GPIO 32, LED -> GPIO 33)')
while True:
    total = 0
    for i in range(20):
        total += read_dust()
    avg = total // 20
    print('미세먼지 센서 값:', avg, ' 전압:', '{:.2f}'.format(avg * 3.3 / 4095), 'V')
    show(0, 'Dust Sensor')
    show(1, 'Value: {}'.format(avg))
    sleep(0.5)
