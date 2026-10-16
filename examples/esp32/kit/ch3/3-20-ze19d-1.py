from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms
from machine import UART

# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

# CO2 센서(ZE19D)의 이산화탄소 농도(ppm)를 읽는 코드예요. 센서에 'CO2 값을 알려 줘' 명령(9바이트)을 보내요.
# 모듈 TX → GPIO 25, 모듈 RX → GPIO 26, 전원 5V. 켠 뒤 1~3분은 값이 불안정해요(예열).
# 입김을 센서에 후~ 불어 보세요. CO2 가 순간 확 올라가요. (바깥 공기는 약 400~500ppm)

uart = UART(2, baudrate=9600, rx=25, tx=26)     # 모듈 TX → GPIO 25(보드 RX), 모듈 RX → GPIO 26(보드 TX)
CMD = bytes([0xFF, 0x01, 0x86, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79])    # '지금 CO2 값 알려 줘' 명령

def read_co2():
    uart.read()                      # 지난 데이터를 비우고
    uart.write(CMD)                  # 명령을 보내면
    sleep_ms(150)
    data = uart.read()               # 센서가 9바이트로 대답해요
    if not data:
        return None
    i = data.find(b'\xff\x86')
    if i < 0 or len(data) < i + 9:
        return None
    frame = data[i:i + 9]
    if (0x100 - sum(frame[1:8])) & 0xFF != frame[8]:     # 검사값(체크섬) 확인
        return None
    return frame[2] * 256 + frame[3]                      # CO2 = 위쪽 바이트 × 256 + 아래쪽 바이트 (ppm)

print('CO2 센서(ZE19D) 테스트 시작 (모듈 TX → GPIO 25, RX → GPIO 26)')
show(0, 'CO2 sensor')

while True:
    co2 = read_co2()
    if co2 is None:
        print('대답이 없어요. 선(TX/RX)과 전원 5V 를 확인하세요.')
        show(1, 'No data')
    else:
        print('CO2 농도:', co2, 'ppm')
        show(0, 'CO2 {} ppm'.format(co2))
        show(1, 'Warming up...' if co2 < 300 else 'Reading OK')
    sleep_ms(1000)                   # 센서가 1초마다 갱신돼요
