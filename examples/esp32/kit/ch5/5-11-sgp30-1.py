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

# 공기질 센서(SGP30)가 알려 주는 eCO2(등가 이산화탄소, ppm)와 TVOC(휘발성 유기화합물, ppb)를 읽는 코드예요.
# SGP30 은 I2C 센서라 LCD 와 같은 선(SDA=21, SCL=22)을 같이 써요. (주소: LCD 0x20, SGP30 0x58)
# 켠 뒤 약 15초는 항상 400ppm / 0ppb 로 나와요(준비 중). 1초에 한 번씩 읽어야 정확해요.

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

print('공기질 센서(SGP30) 테스트 시작 (SDA → 21, SCL → 22)')
show(0, 'SGP30 sensor')

while True:
    eco2, tvoc = read_sgp30()
    print('eCO2:', eco2, 'ppm / TVOC:', tvoc, 'ppb')
    show(0, 'eCO2 {} ppm'.format(eco2))
    show(1, 'TVOC {} ppb'.format(tvoc))
    sleep_ms(1000)
