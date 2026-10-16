# 고온 센서 2단계 — 두 점 보정으로 전압을 «섭씨 온도»로 바꾸고 과열 경보를 울린다.
# 보정: ① 얼음물(0°C)에 프로브를 넣고 1단계의 mV 를 MV_0C 에 ② 끓는 물(100°C)에서 잰 mV 를 MV_100C 에 적는다.
# ⚠️ 끓는 물·불꽃 근처는 반드시 어른과 함께. 모듈 보드는 뜨거운 곳에 두지 말고 «프로브 끝»만 넣는다.
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

adc = ADC(Pin(32))
adc.atten(ADC.ATTN_11DB)             # 0 ~ 3.3V 를 읽는다
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD 주소 = 0x20
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

def read_mv(n=20):                   # 여러 번 읽어 평균(mV)
    total = 0
    for i in range(n):
        total += adc.read_uv() // 1000
        sleep_ms(2)
    return total // n

MV_0C = 600        # ← 얼음물에서 잰 값으로 바꾸세요 (예시값)
MV_100C = 1100     # ← 끓는 물에서 잰 값으로 바꾸세요 (예시값)
ALARM_C = 80       # 이 온도를 넘으면 경보
led = Pin(2, Pin.OUT)

def to_c(mv):
    return (mv - MV_0C) * 100 / (MV_100C - MV_0C)

top = -999
print('온도 측정 시작 — 경보 기준', ALARM_C, '°C')
while True:
    c = to_c(read_mv())
    if c > top:
        top = c
    hot = c >= ALARM_C
    led.value(1 if hot else 0)
    print('온도: {:.1f} °C  (최고 {:.1f})'.format(c, top), '← 과열!' if hot else '')
    show(0, 'Temp {:.1f} C'.format(c))
    show(1, 'HOT!' if hot else 'Max {:.1f} C'.format(top))
    sleep_ms(500)
