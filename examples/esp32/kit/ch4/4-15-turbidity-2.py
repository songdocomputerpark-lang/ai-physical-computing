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

# 처음 물의 값을 기준으로 얼마나 탁해졌는지 %로 보여 주고 3단계로 알려 줘요.
# 시작할 때 맑은 물에 센서를 담근 상태로 켜 주세요. (그때 값이 '기준')
# ⚠️ 5V 센서를 3V3 로 쓰므로 값의 범위가 작아요. 그래서 처음 값과 비교하는 방식으로 만들었어요.
print('기준값 재는 중... 센서를 맑은 물에 담가 주세요.')
show(0, 'Turbidity')
show(1, 'Calibrating...')
raw, base = read_mv(50)
if base < 1:
    base = 1
print('기준 전압:', base, 'mV')

while True:
    raw, mv = read_mv(10)
    ratio = mv * 100 // base               # 처음 값의 몇 % 인가
    change = ratio - 100                   # 처음보다 변한 정도(%)
    if ratio >= 90:
        kind, text = '맑음', 'Clear'
    elif ratio >= 60:
        kind, text = '약간 탁함', 'Cloudy'
    else:
        kind, text = '탁함', 'Turbid'
    print(kind, '/ 전압:', mv, 'mV / 처음 대비:', change, '%')
    show(0, '{} {}%'.format(text, change))
    show(1, 'Now {} Base {}'.format(mv, base))
    sleep_ms(300)
