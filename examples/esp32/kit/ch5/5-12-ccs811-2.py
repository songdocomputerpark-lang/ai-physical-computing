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

# eCO2 와 TVOC 의 변화(올랐나/내렸나)와 최고값을 알려 주고, 나빠지면 보드 LED 를 켜는 환기 알리미예요.
# eCO2: 800 미만 Good / 1500 미만 Normal / 그 이상 Ventilate!   TVOC: 220ppb 이상이면 LED 켜짐(CCS811 은 최대 1187ppb 까지 측정)
# 숨을 불거나 마커펜 냄새를 센서 가까이 가져가면(선생님과 함께!) 값이 올라가요.

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

led = Pin(2, Pin.OUT)
eco2 = tvoc = 0
prev = 0
max_eco2 = 0
print('공기질 알리미 시작! (센서가 길들여지는 동안은 값이 흔들릴 수 있어요)')
show(0, 'Air monitor')

while True:
    r = read_ccs811()
    if r:
        eco2, tvoc = r
        if eco2 > max_eco2:
            max_eco2 = eco2
        if eco2 > prev + 20:
            arrow = '↑ 올라가요'
            sign = 'Up'
        elif eco2 < prev - 20:
            arrow = '↓ 내려가요'
            sign = 'Down'
        else:
            arrow = '→ 비슷해요'
            sign = 'Same'
        prev = eco2
        if eco2 < 800:
            text = 'Good'
        elif eco2 < 1500:
            text = 'Normal'
        else:
            text = 'Ventilate!'
        led.value(1 if (eco2 >= 1500 or tvoc >= 220) else 0)
        print('eCO2:', eco2, 'ppm', arrow, '/ TVOC:', tvoc, 'ppb / 최고 eCO2:', max_eco2)
        show(0, 'CO2 {} {}'.format(eco2, sign))
        show(1, '{} Max {}'.format(text, max_eco2))
    sleep_ms(500)
