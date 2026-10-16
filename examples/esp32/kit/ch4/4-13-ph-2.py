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

# 전압을 pH 숫자로 바꾸고 '산성/중성/염기성' 을 알려 줘요.
# 식: pH = 7 + (PH7_MV - 지금전압) / SLOPE_MV
# 🔧 보정 방법 (처음 한 번 꼭 하세요!)
#  1) 1단계 코드로 프로브를 중성(pH 7) 표준용액에 담그고 안정된 전압(mV)을 적어요 → PH7_MV
#  2) 가능하면 pH 4 표준용액의 전압도 적고  SLOPE_MV = (PH7_MV - 4용액전압) / 3  으로 계산해요.
#  3) 아래 두 숫자를 내 값으로 바꾸세요. (지금 값은 예시라 pH 가 정확하지 않아요)
PH7_MV = 1650        # pH 7 용액에서 잰 전압 (mV)  ← 내 값으로 바꾸기
SLOPE_MV = 170       # pH 1 이 바뀔 때 변하는 전압 (mV)  ← 내 값으로 바꾸기
print('pH 측정 시작! 먼저 PH7_MV 를 보정했는지 확인하세요.')

while True:
    raw, mv = read_mv(10)            # 10번 평균
    ph = 7 + (PH7_MV - mv) / SLOPE_MV
    if ph < 6.5:
        kind, text = '산성', 'Acid'
    elif ph <= 7.5:
        kind, text = '중성', 'Neutral'
    else:
        kind, text = '염기성', 'Base'
    print('pH:', round(ph, 1), '/', kind, '/ 전압:', mv, 'mV')
    show(0, 'pH {}  {}mV'.format(round(ph, 1), mv))
    show(1, text)
    sleep_ms(500)
