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

# TDS 값으로 물이 '정수 / 수돗물 / 소금물' 중 어느 쪽에 가까운지 알려 줘요.
# 정수는 아주 낮고(약 50 미만), 수돗물은 중간, 소금물은 높아요. (기준값은 대략이에요)
# 컵 세 개에 정수·수돗물·소금물을 담아 차례로 재 보세요. (소금물은 선생님과 함께 만들기)
# 물 온도에 따라서도 값이 달라지는데 여기서는 보정을 생략했어요(25도 기준).
print('물 종류 판정 시작! 컵을 바꿀 땐 프로브를 헹궈 주세요.')

while True:
    raw, mv = read_mv(20)            # 20번 평균으로 안정적으로
    v = mv / 1000
    tds = (133.42 * v * v * v - 255.86 * v * v + 857.39 * v) * 0.5
    if tds < 50:
        kind, text = '정수', 'Pure water'
    elif tds < 500:
        kind, text = '수돗물', 'Tap water'
    else:
        kind, text = '소금물', 'Salty water'
    print('TDS:', int(tds), 'ppm →', kind)
    show(0, 'TDS {} ppm'.format(int(tds)))
    show(1, text)
    sleep_ms(500)
