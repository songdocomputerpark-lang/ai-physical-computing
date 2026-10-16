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

# 전압 센서 모듈로 건전지 전압을 재는 코드예요. S 선은 GPIO 32.
# 모듈이 전압을 5분의 1로 줄여 주므로: 입력 전압 = ADC 전압 × 5
# ⚠️ 안전! ESP32 가 읽을 수 있는 최대는 3.3V → 입력은 16.5V 이하만 연결하세요.
#    교실에서는 건전지(1.5V, 3V)처럼 낮은 전압만 재요. 극(+/-)을 거꾸로 연결하지 마세요.
print('전압 센서 테스트 시작 (S → GPIO 32)')
show(0, 'Voltage sensor')

while True:
    raw, mv = read_mv(10)
    vin = mv * 5 / 1000
    print('원시값:', raw, '/ ADC 전압:', mv, 'mV / 입력 전압:', round(vin, 2), 'V')
    show(1, 'Vin {} V'.format(round(vin, 2)))
    sleep_ms(300)
