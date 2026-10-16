from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

adc = ADC(Pin(32))
adc.atten(ADC.ATTN_11DB)     # 0~3.3V 까지 읽기 (값 0~4095)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

def read_mv(n=1):                    # n번 읽은 평균을 mV(밀리볼트)로 돌려줌
    total = 0
    for i in range(n):
        total += adc.read()
        sleep_ms(5)
    raw = total // n
    return raw, raw * 3300 // 4095

# 시작할 때 영점(전류 0일 때 전압)을 100번 평균으로 잡고, 전류(mA)와 최대 전류를 보여 줘요.
# 영점은 전원이 3V3 이면 VCC/2 에서 조금 달라서, 계산이 아닌 '실제 측정'으로 잡아요.
# ⚠️ 시작할 때 측정 단자에 전류가 흐르지 않게 하세요. (영점 잡는 약 1초 동안)
# SENS = 감도(1A 당 몇 mV 변하는지). 모듈마다 달라요 → 모듈 설명서를 확인하고 바꾸세요.
#  (5A 모듈 185, 20A 모듈 100, 30A 모듈 66 mV/A 가 대표적. 1A 모듈은 더 커요.)
# ⚠️ 안전: 센서 정격(1A)을 넘는 전류를 흘리지 마세요. 건전지 1~2개와 작은 전구 정도로만!
SENS = 1000         # mV/A  ← 내 모듈에 맞게 바꾸기
print('영점 잡는 중... 전류를 흘리지 마세요.')
show(0, 'Current sensor')
show(1, 'Zeroing...')
raw, zero = read_mv(100)
print('영점 전압:', zero, 'mV')
max_ma = 0

while True:
    raw, mv = read_mv(10)
    ma = abs(mv - zero) * 1000 // SENS
    if ma > max_ma:
        max_ma = ma
    print('전류:', ma, 'mA / 최대:', max_ma, 'mA')
    show(0, 'I: {} mA'.format(ma))
    show(1, 'Max {} mA'.format(max_ma))
    sleep_ms(300)
