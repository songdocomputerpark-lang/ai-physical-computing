from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff
from machine import UART

# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

# 초미세먼지(PM2.5) 단계를 '좋음/보통/나쁨/매우 나쁨' 으로 알려 주고, 최근 10번 평균도 보여 줘요.
# 기준(우리나라 PM2.5): 15 이하 좋음 / 35 이하 보통 / 75 이하 나쁨 / 그 이상 매우 나쁨 (나쁨부터 보드 LED 켜짐)
# 향초·향 연기를 센서 가까이 두거나(선생님과 함께!) 창문을 열고 닫으며 값이 어떻게 변하는지 비교해 보세요.

uart = UART(2, baudrate=9600, rx=25, tx=26)     # 모듈 TX → GPIO 25(보드 RX), 모듈 RX → GPIO 26(보드 TX)
buf = b''                                        # 받은 글자를 모아 두는 상자

def read_pms():
    # 받은 데이터에서 완전한 한 묶음(32바이트)을 찾아 (PM1.0, PM2.5, PM10) 을 돌려줘요. 없으면 None.
    global buf
    n = uart.any()
    if n:
        buf += uart.read(n)
    result = None
    while len(buf) >= 32:
        i = buf.find(b'\x42\x4d')                # 묶음은 항상 0x42 0x4D 로 시작해요
        if i < 0:
            buf = buf[-1:]
            break
        buf = buf[i:]
        if len(buf) < 32:
            break
        frame = buf[:32]
        if sum(frame[:30]) == frame[30] * 256 + frame[31]:    # 검사값(체크섬) 확인
            result = ((frame[10] << 8) | frame[11],      # PM1.0  (ug/m3)
                      (frame[12] << 8) | frame[13],      # PM2.5
                      (frame[14] << 8) | frame[15])      # PM10
            buf = buf[32:]
        else:
            buf = buf[2:]
    return result

led = Pin(2, Pin.OUT)
recent = []                                      # 최근 PM2.5 값 10개

def grade(v):
    if v <= 15:
        return '좋음', 'Good'
    if v <= 35:
        return '보통', 'Norm'
    if v <= 75:
        return '나쁨', 'Bad'
    return '매우 나쁨', 'VBad'

print('미세먼지 단계 측정 시작! (켠 뒤 30초쯤 기다려 주세요)')
show(0, 'Dust monitor')

while True:
    r = read_pms()
    if r:
        pm1, pm25, pm10 = r
        recent.append(pm25)
        recent = recent[-10:]
        avg = sum(recent) // len(recent)
        kor, eng = grade(pm25)
        led.value(1 if pm25 > 35 else 0)
        print('PM2.5:', pm25, kor, '/ 최근 평균:', avg, '/ PM10:', pm10)
        show(0, 'PM2.5 {} {}'.format(pm25, eng))
        show(1, 'Avg {} PM10 {}'.format(avg, pm10))
    sleep_ms(300)
