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

# 전류 센서(ACS712 계열)의 출력을 읽는 코드예요. S 선은 GPIO 32.
# 전류가 0일 때 출력은 전원 전압(VCC)의 절반쯤이에요. 전류가 흐르면 그 위/아래로 바뀌어요.
# ⚠️ 안전! 측정 회로(IP+ / IP- 단자)에는 큰 전류·높은 전압을 절대 흘리지 마세요.
#    처음에는 아무것도 연결하지 않은 채 값만 확인해요. 실험은 선생님과 함께 해요.
print('전류 센서 테스트 시작 (S → GPIO 32)')
show(0, 'Current sensor')

while True:
    raw, mv = read_mv(10)
    print('원시값:', raw, '/ 전압:', mv, 'mV')
    show(1, 'R{} {}mV'.format(raw, mv))
    sleep_ms(300)
