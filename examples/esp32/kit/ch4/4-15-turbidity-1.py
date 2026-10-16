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

# 탁도 센서(TSW-30)의 값을 읽는 코드예요. S 선은 GPIO 32 에 꽂았어요.
# 맑은 물에서는 값이 높고, 흐려질수록 값이 낮아져요.
# ⚠️ 이 센서는 원래 5V 용이에요. 여기서는 3V3 로 연결해서 값의 범위가 줄어들어요(그래도 변화는 보여요).
print('탁도 센서 테스트 시작 (S → GPIO 32)')
show(0, 'Turbidity')

while True:
    raw, mv = read_mv(10)
    print('원시값:', raw, '/ 전압:', mv, 'mV')
    show(1, 'R{} {}mV'.format(raw, mv))
    sleep_ms(300)
