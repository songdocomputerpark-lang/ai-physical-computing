# 무게 센서(I2C 무게 모듈, 주소 0x63)가 살아 있는지 확인하는 코드예요.
# 센서 SDA -> GPIO 21, SCL -> GPIO 22 (실드의 3.3V I2C 칸). LCD 도 같은 I2C 선에 꽂아요.
# 모듈이 무게를 g 단위로 직접 계산해서 보내 줘요. 저울 위에 물건을 올려 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

# 무게 모듈은 100kHz 로 읽어야 안전해요. LCD 도 같은 I2C 선을 같이 써요.
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=100000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)
lcd.clear()
WEIGHT_ADDR = 0x63                  # 무게 모듈 주소 (모듈 뒷면 'I2C addr: 0x63')

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

def read_weight():
    # 모듈이 [상태 0xFF, 상위 바이트, 하위 바이트] 3바이트를 보내요. 무게(g) = 상위 x 256 + 하위
    # 대답이 없거나 모양이 틀리면 -1 을 돌려줘요.
    try:
        data = i2c.readfrom(WEIGHT_ADDR, 3)
    except OSError:
        return -1
    if data[0] != 0xFF:
        return -1
    return data[1] * 256 + data[2]

print('무게 센서 테스트 시작 (SDA -> GPIO 21, SCL -> GPIO 22, 주소 0x63)')
if WEIGHT_ADDR not in i2c.scan():
    print('무게 센서를 찾지 못했어요. 선과 전원을 확인해 보세요')
show(0, 'Weight sensor')

while True:
    w = read_weight()
    if w < 0:
        print('무게 센서가 대답하지 않아요')
        show(1, 'No response')
    else:
        print('무게:', w, 'g')
        show(1, 'Weight: {} g'.format(w))
    sleep_ms(300)
