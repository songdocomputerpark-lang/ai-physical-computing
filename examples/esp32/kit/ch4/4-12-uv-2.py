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

# 전압을 UV 지수로 바꿔 '낮음/보통/높음/매우 높음' 단계를 알려 줘요.
# UV 지수 ≈ 출력 전압(V) ÷ 0.1  (GUVA-S12SD 는 0.1V 마다 UV 지수 1 정도로 근사)
# 햇빛 아래(창가, 야외)에서 해 보고, 실내 형광등 아래와 비교해 보세요.
max_uvi = 0
print('UV 지수 측정 시작! 가장 센 값(최댓값)도 기억해요.')
while True:
    raw, mv = read_mv(10)            # 10번 평균으로 흔들림 줄이기
    uvi = mv / 100
    if uvi < 3:
        level, text = '낮음', 'Low'
    elif uvi < 6:
        level, text = '보통', 'Mid'
    elif uvi < 8:
        level, text = '높음', 'High'
    else:
        level, text = '매우 높음', 'VHigh'
    if uvi > max_uvi:
        max_uvi = uvi
    print('UV 지수:', round(uvi, 1), '/', level, '/ 최댓값:', round(max_uvi, 1))
    show(0, 'UVI {} {}'.format(round(uvi, 1), text))
    show(1, 'Max UVI {}'.format(round(max_uvi, 1)))
    sleep_ms(300)
