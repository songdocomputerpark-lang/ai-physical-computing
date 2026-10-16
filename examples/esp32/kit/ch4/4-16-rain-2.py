# 빗물 감지 센서 2단계 — 시작할 때 «마른 상태» 값을 기준으로 잡고, 비의 세기를 4단계로 판정해 비가 오기 시작하면 알린다.
# (창문 자동 닫기·빨래 걷기 알림에 쓰는 방법) 시작할 때 3초 동안 센서 판을 말려 두세요.
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

adc = ADC(Pin(32))
adc.atten(ADC.ATTN_11DB)             # 0 ~ 3.3V 를 0 ~ 4095 로 읽는다
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD 주소 = 0x20
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

def read_avg(n=10):
    total = 0
    for i in range(n):
        total += adc.read()
        sleep_ms(2)
    return total // n

LEVELS = [(150, 'Dry', '맑음'), (600, 'Drizzle', '이슬비'), (1500, 'Rain', '비'), (99999, 'Heavy', '폭우')]
led = Pin(2, Pin.OUT)

print('마른 상태 기준값 재는 중… 판을 말려 두세요')
show(0, 'Calibrating...')
dry = sum(read_avg() for i in range(30)) // 30
print('기준값:', dry)

was_dry = True
wet_ms = 0
while True:
    d = max(0, read_avg() - dry)
    for limit, en, ko in LEVELS:
        if d < limit:
            break
    raining = en != 'Dry'
    if raining and was_dry:
        print('☔ 비가 오기 시작했어요! 창문을 닫으세요')
    if not raining and not was_dry:
        print('🌤 비가 그쳤어요 (젖어 있던 시간', wet_ms // 1000, '초)')
        wet_ms = 0
    if raining:
        wet_ms += 300
    was_dry = not raining
    led.value(1 if raining else 0)
    print('상태:', ko, '· 기준보다', d)
    show(0, '{}  +{}'.format(en, d))
    show(1, 'Wet {} s'.format(wet_ms // 1000))
    sleep_ms(300)
