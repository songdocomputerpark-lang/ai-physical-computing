# 지문 센서(AS608)가 말을 알아듣는지, 손가락을 올리면 알아보는지 확인하는 코드예요.
# 센서 선은 GPIO 25, 26, LCD 는 I2C(SDA 21, SCL 22). 선 순서가 반대여도 코드가 알아서 찾아봐요.
from machine import Pin, UART, SoftI2C
from i2c_lcd import I2cLcd
from pyfingerprint import PyFingerprint
from time import sleep, sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
# 센서에게 보내는 '암호 확인' 메시지(센서가 대답하면 연결이 맞는 거예요)
PACKET = bytes([0xEF, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0x01, 0x00, 0x07, 0x13,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x1B])

def try_pins(tx, rx):
    uart = UART(2, baudrate=57600, tx=tx, rx=rx)
    uart.read()
    uart.write(PACKET)
    sleep_ms(300)
    data = uart.read()
    if data and data[0] == 0xEF and data[1] == 0x01:
        return uart
    return None

print('지문 센서 테스트 시작 (TX/RX -> GPIO 25, 26)')
show(0, 'Fingerprint')
show(1, 'Checking...')
uart = try_pins(25, 26)
if uart:
    print('연결 성공! TX_PIN=25, RX_PIN=26')
else:
    uart = try_pins(26, 25)
    if uart:
        print('연결 성공! 선이 반대였어요. TX_PIN=26, RX_PIN=25')
if not uart:
    print('센서가 대답하지 않아요. 전원(5V)과 선 연결을 확인하세요.')
    show(1, 'No response')
else:
    uart.read()
    f = PyFingerprint(uart)
    count = f.getTemplateCount()
    print('저장된 지문 개수:', count, '/', f.getStorageCapacity())
    show(0, 'Saved: {}'.format(count))
    while True:
        if f.readImage():
            print('손가락이 보여요!')
            show(1, 'Finger!')
        else:
            print('손가락을 올려 주세요')
            show(1, 'Place finger')
        sleep(0.5)
