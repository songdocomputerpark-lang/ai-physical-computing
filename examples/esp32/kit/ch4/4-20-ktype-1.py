# 고온 센서(K형 열전대) 기본 테스트 — 증폭 모듈이 온도를 «전압»으로 내보낸다. S → GPIO 32, V → 3V3.
# 프로브 끝을 손으로 쥐거나 뜨거운 물에 넣었다 빼며 전압이 오르내리는지 보세요.
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

print('고온 센서 테스트 시작 (S → GPIO 32)')
show(0, 'High Temp')
while True:
    mv = read_mv()
    print('출력 전압:', mv, 'mV')
    show(1, 'Out: {} mV'.format(mv))
    sleep_ms(300)
