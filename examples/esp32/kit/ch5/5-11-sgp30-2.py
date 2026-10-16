from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

# eCO2 와 TVOC 로 공기 상태를 판단하고, 나쁘면 보드 LED 를 켜서 환기를 알려 줘요.
# eCO2: 800 미만 Good / 1500 미만 Normal / 그 이상 Ventilate!   TVOC: 220ppb 미만 Good / 660 미만 Fair / 그 이상 Poor
# 마커펜·알코올솜 냄새를 센서 가까이 가져가면(선생님과 함께!) TVOC 가 확 올라가요.

ADDR = 0x58                          # SGP30 의 I2C 주소
if ADDR not in i2c.scan():
    print('SGP30 센서를 못 찾았어요. SDA(21)·SCL(22) 선과 전원을 확인하세요.')
    show(1, 'SGP30 not found')
    raise SystemExit
i2c.writeto(ADDR, b'\x20\x03')       # 공기질 측정 시작 명령 (init_air_quality = 0x2003)
sleep_ms(10)

def read_sgp30():
    i2c.writeto(ADDR, b'\x20\x08')   # 측정 명령 (measure_air_quality = 0x2008)
    sleep_ms(15)
    d = i2c.readfrom(ADDR, 6)        # 6바이트 = [eCO2 2바이트 + 검사값] + [TVOC 2바이트 + 검사값]
    eco2 = (d[0] << 8) | d[1]        # d[2], d[5] 는 검사값(CRC) — 여기서는 확인을 생략했어요
    tvoc = (d[3] << 8) | d[4]
    return eco2, tvoc

led = Pin(2, Pin.OUT)
recent = []
max_eco2 = 0
print('공기질 판단 시작! 켠 뒤 15초는 준비 중이에요.')
show(0, 'Air quality')

while True:
    eco2, tvoc = read_sgp30()
    recent.append(eco2)
    recent = recent[-10:]
    avg = sum(recent) // len(recent)
    if eco2 > max_eco2:
        max_eco2 = eco2
    if eco2 < 800:
        c_state, c_text = '좋음', 'Good'
    elif eco2 < 1500:
        c_state, c_text = '보통', 'Normal'
    else:
        c_state, c_text = '환기하세요!', 'Ventilate!'
    if tvoc < 220:
        v_state = '좋음'
    elif tvoc < 660:
        v_state = '보통'
    else:
        v_state = '나쁨'
    led.value(1 if (eco2 >= 1500 or tvoc >= 660) else 0)
    print('eCO2:', eco2, c_state, '/ TVOC:', tvoc, v_state, '/ 최근 평균 eCO2:', avg, '/ 최고:', max_eco2)
    show(0, 'CO2 {} {}'.format(eco2, c_text))
    show(1, 'TVOC {} Avg {}'.format(tvoc, avg))
    sleep_ms(1000)
