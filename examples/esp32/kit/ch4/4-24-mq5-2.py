# 깨끗한 공기에서의 값을 기준으로 삼고, 값이 많이 올라가면 경고하는 MQ5 가스 알리미예요.
# 배선은 1단계와 같아요. 기준을 잴 때는 센서 근처에 아무것도 두지 마세요.
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep, sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
gas = ADC(Pin(32))
gas.atten(ADC.ATTN_11DB)
led = Pin(2, Pin.OUT)    # 보드 내장 LED (경고일 때 켜진다)

def read_avg(n=5):
    total = 0
    for i in range(n):
        total += gas.read()
        sleep_ms(50)
    return total // n

print('MQ5 가스 알리미: 센서를 예열하는 중 (10초)')
for sec in range(10, 0, -1):
    show(0, 'Warming up...')
    show(1, '{} sec left'.format(sec))
    sleep(1)
print('깨끗한 공기의 기준값을 재는 중...')
show(0, 'Measuring base..')
base = 0
for i in range(10):
    base += read_avg()
base = base // 10
limit = base + max(base // 2, 200)     # 기준보다 이만큼 오르면 경고
print('기준값:', base, ' 경고 기준:', limit)
top = base
while True:
    value = read_avg()
    top = max(top, value)
    if value > limit:
        led.on()
        print('경고! MQ5 값이 올랐어요:', value, '(최고', top, ')')
        show(0, 'MQ5 Base {}'.format(base))
        show(1, 'ALERT! {}'.format(value))
    else:
        led.off()
        print('괜찮아요. 값:', value, '(기준', base, ')')
        show(0, 'MQ5 Base {}'.format(base))
        show(1, 'OK {} Max {}'.format(value, top))
    sleep(0.5)
