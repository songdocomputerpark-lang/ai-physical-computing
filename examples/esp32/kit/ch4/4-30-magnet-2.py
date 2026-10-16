# 자석 감지 센서 2단계 — 처음 값을 «자석 없음» 기준으로 잡고, 극(N/S)과 세기를 판정해 자석이 지나간 횟수를 센다.
# (문 열림 감지·바퀴 회전 세기에 쓰는 방법) 시작할 때 3초 동안 자석을 멀리 두세요.
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

THRESH = 150       # 기준에서 이만큼 넘게 바뀌면 «자석 있음» (센서마다 조절)
led = Pin(2, Pin.OUT)

print('기준값 재는 중… 자석을 멀리 두세요')
show(0, 'Calibrating...')
base = sum(read_avg() for i in range(30)) // 30
print('기준값:', base)

count = 0
near = False
while True:
    d = read_avg() - base
    pole = 'N' if d > THRESH else ('S' if d < -THRESH else '-')
    now = pole != '-'
    if now and not near:
        count += 1
        print('자석 감지!', pole, '극 · 세기', abs(d), '· 지나간 횟수', count)
    near = now
    led.value(1 if now else 0)
    show(0, 'Pole {}  d={}'.format(pole, d))
    show(1, 'Count: {}'.format(count))
    sleep_ms(100)
