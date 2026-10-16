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

# PMS7003 미세먼지 센서의 값을 읽는 코드예요. UART 9600 으로 센서가 1초마다 보내 주는 묶음을 해석해요.
# 모듈 TX → GPIO 25, 모듈 RX → GPIO 26, 전원은 5V 예요. 켠 뒤 30초쯤 지나야 값이 안정돼요.
# ⚠️ 센서 안의 팬이 돌아요. 공기 구멍을 막지 말고, 선생님 허락 없이 분해하지 마세요.

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

print('PMS7003 테스트 시작 (모듈 TX → GPIO 25, RX → GPIO 26)')
show(0, 'PMS7003')
last_ok = ticks_ms()

while True:
    r = read_pms()
    if r:
        pm1, pm25, pm10 = r
        last_ok = ticks_ms()
        print('미세먼지 PM1.0:', pm1, '/ PM2.5:', pm25, '/ PM10:', pm10, '(ug/m3)')
        show(0, 'PM2.5 {} ug/m3'.format(pm25))
        show(1, 'PM1.0 {} PM10 {}'.format(pm1, pm10))
    elif ticks_diff(ticks_ms(), last_ok) > 5000:
        print('데이터가 안 와요. 선(TX/RX)과 전원 5V 를 확인하세요.')
        show(1, 'No data')
        last_ok = ticks_ms()
    sleep_ms(300)
