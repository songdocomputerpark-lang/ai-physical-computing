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

# 전기전도도(TDS) 센서의 값을 읽어 ppm 으로 바꿔 보여 줘요. S 선은 GPIO 32.
# TDS ppm 근사식(DFRobot): tds = (133.42*v^3 - 255.86*v^2 + 857.39*v) * 0.5   (v = 전압, 단위 V)
# 원래는 물 온도(25도)로 보정해야 하지만 여기서는 생략했어요.
print('TDS 센서 테스트 시작 (S → GPIO 32)')
show(0, 'TDS sensor')

while True:
    raw, mv = read_mv(10)
    v = mv / 1000
    tds = (133.42 * v * v * v - 255.86 * v * v + 857.39 * v) * 0.5
    print('전압:', mv, 'mV / TDS:', int(tds), 'ppm')
    show(1, 'TDS {} ppm'.format(int(tds)))
    sleep_ms(500)
