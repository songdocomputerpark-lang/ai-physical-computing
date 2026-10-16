# BLE 심화 예제: 휴대폰에서 B0 ~ B9 를 보내면 보드 LED 밝기가 0~9단계로 바뀝니다.
# BOOT 버튼을 누른 횟수는 휴대폰으로 보내 줘요. (모듈 TX → GPIO 25, RX → GPIO 26)
from machine import Pin, PWM, UART
from time import sleep_ms

boot = Pin(0, Pin.IN, Pin.PULL_UP)   # 보드의 BOOT 버튼 (누르면 0)

def pressed():
    # 버튼을 눌렀다 떼면 True (한 번만)
    if boot.value() == 0:
        sleep_ms(30)
        while boot.value() == 0:
            sleep_ms(10)
        return True
    return False

ble = UART(2, baudrate=9600, tx=26, rx=25)
led = PWM(Pin(2), freq=1000)
led.duty_u16(0)
text = ''
count = 0
print('휴대폰에서 B0 ~ B9 를 보내 보세요. (예: B5)')
try:
    while True:
        if ble.any():
            try:
                text += ble.read().decode()
            except Exception:
                text = ''
            text = text.replace('\r', '\n')
            while '\n' in text:
                line, text = text.split('\n', 1)
                line = line.strip().upper()
                if len(line) == 2 and line[0] == 'B' and line[1] in '0123456789':
                    level = int(line[1])
                    led.duty_u16(level * 7000)
                    print('밝기 단계:', level)
                    ble.write('Level ' + str(level) + '\r\n')
                elif line:
                    print('모르는 명령:', line)
        if pressed():
            count += 1
            ble.write('BOOT ' + str(count) + '\r\n')
            print('BOOT 누른 횟수:', count)
        sleep_ms(20)
finally:
    led.duty_u16(0)
    led.deinit()
