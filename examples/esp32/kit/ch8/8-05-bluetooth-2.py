# 블루투스 심화 예제: 휴대폰에서 ON / OFF / BLINK 를 보내면 보드 LED 가 켜지고, 꺼지고, 깜빡여요.
# BOOT 버튼을 누르면 휴대폰으로 'BOOT' 가 전달돼요. (모듈 TX → GPIO 25, RX → GPIO 26)
from machine import Pin, UART
from time import sleep_ms, ticks_ms, ticks_diff

boot = Pin(0, Pin.IN, Pin.PULL_UP)   # 보드의 BOOT 버튼 (누르면 0)

def pressed():
    # 버튼을 눌렀다 떼면 True (한 번만)
    if boot.value() == 0:
        sleep_ms(30)
        while boot.value() == 0:
            sleep_ms(10)
        return True
    return False

bt = UART(2, baudrate=9600, tx=26, rx=25)
led = Pin(2, Pin.OUT)
blink = False
t_blink = ticks_ms()
text = ''
print('휴대폰에서 ON, OFF, BLINK 를 보내 보세요.')
while True:
    if bt.any():
        try:
            text += bt.read().decode()
        except Exception:
            text = ''
        text = text.replace('\r', '\n')
        while '\n' in text:
            line, text = text.split('\n', 1)
            cmd = line.strip().upper()
            if 'BLINK' in cmd:
                blink = True
                print('LED 깜빡임')
            elif 'OFF' in cmd:
                blink = False
                led.value(0)
                print('LED 꺼짐')
            elif 'ON' in cmd:
                blink = False
                led.value(1)
                print('LED 켜짐')
            elif cmd:
                print('모르는 명령:', cmd)
    if blink and ticks_diff(ticks_ms(), t_blink) >= 300:
        t_blink = ticks_ms()
        led.value(not led.value())
    if pressed():
        bt.write('BOOT\r\n')
        print('BOOT 버튼 → 휴대폰으로 보냄')
    sleep_ms(20)
