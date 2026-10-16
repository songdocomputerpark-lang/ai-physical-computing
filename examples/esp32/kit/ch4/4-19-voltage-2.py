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

# 1.5V 건전지가 새것인지, 쓸만한지, 바꿔야 하는지 알려 줘요. (한 개짜리 1.5V 건전지 기준)
# 입력 전압 = ADC 전압 × 5.  ⚠️ 입력은 16.5V 이하만! (ESP32 ADC 한계 3.3V)
# 아주 낮은 전압(약 0.1V 이하)은 ESP32 ADC 가 정확하지 않아요.
NEW_V = 1.3         # 이 이상이면 새것
OK_V = 1.1          # 이 이상이면 쓸만함, 그 아래면 교체
print('건전지 잔량 측정 시작! 1.5V 건전지를 연결하세요.')

while True:
    raw, mv = read_mv(20)            # 20번 평균
    vin = mv * 5 / 1000
    if vin >= NEW_V:
        state, text = '새것', 'New'
    elif vin >= OK_V:
        state, text = '쓸만함', 'OK'
    else:
        state, text = '교체하세요', 'Replace'
    print('전압:', round(vin, 2), 'V →', state)
    show(0, 'Vin {} V'.format(round(vin, 2)))
    show(1, text)
    sleep_ms(500)
