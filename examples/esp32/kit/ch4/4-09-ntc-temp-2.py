# 처음 값(기준)보다 많이 바뀌면 알려 주는 코드예요. (배선은 1단계와 같아요)
# 값이 커질지 작아질지는 회로에 따라 달라서, 변한 방향을 같이 보여 줘요.
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
led = Pin(2, Pin.OUT)     # 보드 내장 LED
LIMIT = 100               # 이만큼 바뀌면 알림 (숫자를 바꿔 보세요)

def read_avg(n=10):
    total = 0
    for i in range(n):
        total += ntc.read()
        sleep(0.02)
    return total // n

print('기준값을 재는 중... 센서에 손대지 마세요.')
show(0, 'Measuring base..')
base = read_avg(30)
print('기준값:', base)
while True:
    now = read_avg()
    diff = now - base
    show(0, 'Base {} Now {}'.format(base, now))
    if abs(diff) >= LIMIT:
        led.on()
        word = '값이 커졌어요' if diff > 0 else '값이 작아졌어요'
        print('온도가 바뀌었어요!', word, '(변화', diff, ')')
        show(1, 'CHANGED! {}'.format(diff))
    else:
        led.off()
        print('안정적이에요 (변화', diff, ')')
        show(1, 'Stable {}'.format(diff))
    sleep(0.5)
