# BOOT 버튼을 누르면 새 지문을 등록하고, 그냥 손가락을 올리면 누구인지 찾아요.
# 1단계에서 알려 준 TX_PIN, RX_PIN 숫자를 아래에 적으세요. 배선은 1단계와 같아요.
from machine import Pin, UART, SoftI2C
from i2c_lcd import I2cLcd
from pyfingerprint import PyFingerprint, FINGERPRINT_CHARBUFFER1, FINGERPRINT_CHARBUFFER2
from time import sleep, sleep_ms

TX_PIN = 25
RX_PIN = 26

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
uart = UART(2, baudrate=57600, tx=TX_PIN, rx=RX_PIN)
f = PyFingerprint(uart)
button = Pin(0, Pin.IN, Pin.PULL_UP)    # BOOT 버튼 (누르면 0)
led = Pin(2, Pin.OUT)

def wait_finger():
    while not f.readImage():
        sleep_ms(100)

def enroll():
    print('등록해요! 손가락을 올려 주세요')
    show(1, 'Enroll: place')
    wait_finger()
    f.convertImage(FINGERPRINT_CHARBUFFER1)
    print('손가락을 떼세요')
    show(1, 'Remove finger')
    sleep(2)
    print('같은 손가락을 한 번 더 올려 주세요')
    show(1, 'Place again')
    wait_finger()
    f.convertImage(FINGERPRINT_CHARBUFFER2)
    if f.compareCharacteristics() == 0:
        print('두 번이 서로 달라요. 다시 해 보세요')
        show(1, 'Not matching')
        return
    f.createTemplate()
    number = f.storeTemplate()
    print('등록 완료! 번호:', number)
    show(1, 'Saved ID {}'.format(number))

def check():
    f.convertImage(FINGERPRINT_CHARBUFFER1)
    number, score = f.searchTemplate()
    if number == -1:
        print('등록되지 않은 지문이에요')
        show(1, 'Unknown')
    else:
        print('반가워요! 지문 번호', number, '(일치 점수', score, ')')
        show(1, 'Hello! ID {}'.format(number))
        led.on()
        sleep(1)
        led.off()

print('저장된 지문 개수:', f.getTemplateCount())
print('BOOT 버튼 = 등록, 손가락 올리기 = 확인')
show(0, 'BOOT=enroll')
show(1, 'Place finger')
while True:
    if button.value() == 0:
        while button.value() == 0:
            sleep_ms(20)
        enroll()
        sleep(1)
        show(1, 'Place finger')
    elif f.readImage():
        check()
        sleep(1)
        show(1, 'Place finger')
    sleep_ms(200)
