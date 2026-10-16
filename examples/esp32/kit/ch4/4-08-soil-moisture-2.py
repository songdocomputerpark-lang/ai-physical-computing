# 흙 속 수분을 %로 바꿔서 '물을 주세요' 알림을 주는 코드예요. (배선은 1단계와 같아요)
# 먼저 1단계로 공기 중 값(AIR)과 물속 값(WATER)을 재서 아래 두 숫자를 바꿔 주세요.
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep

AIR = 3000     # 공기 중에서 잰 값 (0%)
WATER = 1300   # 물에 담갔을 때 값 (100%)

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
soil = ADC(Pin(32))
soil.atten(ADC.ATTN_11DB)
led = Pin(2, Pin.OUT)    # 보드 내장 LED

def read_avg(n=10):
    total = 0
    for i in range(n):
        total += soil.read()
        sleep(0.02)
    return total // n

print('화분 도우미 시작! 30% 아래면 LED 가 켜져요.')
while True:
    raw = read_avg()
    percent = (AIR - raw) * 100 // (AIR - WATER)
    percent = max(0, min(100, percent))
    if percent < 30:
        state = '건조해요! 물을 주세요'
        text = 'DRY! Water me'
        led.on()
    elif percent < 70:
        state = '촉촉해요'
        text = 'Moist OK'
        led.off()
    else:
        state = '물이 아주 많아요'
        text = 'Very wet'
        led.off()
    print('수분', percent, '% (값', raw, ')', state)
    show(0, 'Soil {}% ({})'.format(percent, raw))
    show(1, text)
    sleep(1)
