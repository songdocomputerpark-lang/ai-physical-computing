# 처음 공기(기준)보다 값이 얼마나 올랐는지로 공기 상태를 알려 주는 코드예요.
# 배선은 1단계와 같아요.
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
dust_led = Pin(33, Pin.OUT)
alarm = Pin(2, Pin.OUT)       # 보드 내장 LED (나쁨일 때 켜진다)

def read_dust(n=20):
    total = 0
    for i in range(n):
        dust_led.on()
        sleep_us(280)
        total += dust_adc.read()
        sleep_us(40)
        dust_led.off()
        sleep_us(9680)
    return total // n

print('깨끗한 공기 기준을 재는 중... 센서 근처에서 먼지를 일으키지 마세요.')
show(0, 'Measuring base..')
base = read_dust(200)
print('기준값:', base)
while True:
    value = read_dust()
    rise = value - base
    if rise < 50:
        state = '좋음'
        text = 'GOOD'
        alarm.off()
    elif rise < 200:
        state = '보통'
        text = 'NORMAL'
        alarm.off()
    else:
        state = '나쁨'
        text = 'BAD!'
        alarm.on()
    print('값', value, ' 기준보다', rise, '높음 ->', state)
    show(0, 'Dust {} (+{})'.format(value, rise))
    show(1, text)
    sleep(0.5)
