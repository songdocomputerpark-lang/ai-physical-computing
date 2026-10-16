from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=100000, timeout=100000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

# 공기질 센서(CCS811)의 eCO2(ppm)와 TVOC(ppb)를 읽는 코드예요. LCD 와 같은 I2C 선(SDA=21, SCL=22)을 써요.
# 주소: LCD 0x20, CCS811 0x5A(또는 0x5B). 센서는 처음 20분쯤 길들이는 시간이 필요하고, 첫 값은 400ppm / 0ppb 예요.

# CCS811 는 I2C 로 값을 줄 때 잠깐 신호를 붙잡고 있어서(클록 스트레칭) 속도를 100kHz 로 낮췄어요.
if 0x5A in i2c.scan():
    ADDR = 0x5A                      # 보통 주소
elif 0x5B in i2c.scan():
    ADDR = 0x5B                      # 주소 핀을 바꾼 모듈
else:
    print('CCS811 센서를 못 찾았어요. SDA(21)·SCL(22) 선과 전원을 확인하세요.')
    show(1, 'CCS811 not found')
    raise SystemExit
if i2c.readfrom_mem(ADDR, 0x20, 1)[0] != 0x81:      # 칩 번호(HW_ID)는 항상 0x81
    print('CCS811 칩이 아닌 것 같아요. 주소와 연결을 확인하세요.')
i2c.writeto(ADDR, b'\xf4')           # 측정 프로그램 시작 (APP_START = 0xF4)
sleep_ms(100)
i2c.writeto_mem(ADDR, 0x01, b'\x10') # 측정 방식 설정 (MEAS_MODE: 1초마다 측정)

def read_ccs811():
    status = i2c.readfrom_mem(ADDR, 0x00, 1)[0]
    if not (status & 0x08):          # 비트3 = 새 데이터가 준비됐는지
        return None
    d = i2c.readfrom_mem(ADDR, 0x02, 8)     # ALG_RESULT_DATA: eCO2 2바이트 + TVOC 2바이트 + ...
    return (d[0] << 8) | d[1], (d[2] << 8) | d[3]

print('공기질 센서(CCS811) 테스트 시작 (SDA → 21, SCL → 22)')
show(0, 'CCS811 sensor')
eco2 = tvoc = 0

while True:
    r = read_ccs811()
    if r:
        eco2, tvoc = r
        print('eCO2:', eco2, 'ppm / TVOC:', tvoc, 'ppb')
    show(0, 'eCO2 {} ppm'.format(eco2))
    show(1, 'TVOC {} ppb'.format(tvoc))
    sleep_ms(500)
