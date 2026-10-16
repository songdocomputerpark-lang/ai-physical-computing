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

# CO2 가 1000ppm 을 넘으면 '환기하세요!' 로 알려 주는 환기 판단기예요. (교실 CO2 권고 기준 1000ppm)
# 800 미만 Good / 1000 미만 Normal / 1000 이상 OPEN WINDOW (보드 LED 켜짐 + 횟수 기록)
# 입김을 불어 1000 을 넘겨 보고, 창문을 열었을 때 얼마나 빨리 내려가는지 관찰해 보세요.

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

led = Pin(2, Pin.OUT)
LIMIT = 1000
recent = []                          # 최근 5번 값
max_co2 = 0
alerts = 0                           # 1000 을 넘은 횟수
too_high = False
print('환기 판단기 시작! 켠 뒤 1~3분은 예열이에요.')
show(0, 'Vent monitor')

while True:
    co2 = read_co2()
    if co2 is None:
        print('대답이 없어요. 선(TX/RX)과 전원을 확인하세요.')
        show(1, 'No data')
    else:
        recent.append(co2)
        recent = recent[-5:]
        avg = sum(recent) // len(recent)
        if co2 > max_co2:
            max_co2 = co2
        if co2 >= LIMIT and not too_high:        # 처음 넘는 순간만 센다
            alerts += 1
        too_high = co2 >= LIMIT
        if co2 < 800:
            state, text = '좋음', 'Good'
        elif co2 < LIMIT:
            state, text = '보통', 'Normal'
        else:
            state, text = '환기하세요!', 'OPEN WINDOW'
        led.value(1 if too_high else 0)
        print('CO2:', co2, 'ppm /', state, '/ 최근 평균:', avg, '/ 최고:', max_co2, '/ 경고 횟수:', alerts)
        show(0, 'CO2 {} {}'.format(co2, 'Good' if co2 < LIMIT else '!'))
        show(1, text if too_high else '{} Max {}'.format(text, max_co2))
    sleep_ms(1000)
