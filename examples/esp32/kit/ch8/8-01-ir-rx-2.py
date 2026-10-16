# IR 수신기 심화 예제: 리모컨의 0·1·2 번 키로 보드 LED 를 끄기·켜기·깜빡이기 합니다.
# (IR 수신기 S → GPIO 25) 키 코드는 아래 표에서 내 리모컨에 맞게 바꿔 쓰세요.
from machine import Pin
from time import sleep_ms, ticks_ms, ticks_diff
from ir_rx import NEC_16

KEY_OFF, KEY_ON, KEY_BLINK = 0x16, 0x0C, 0x18   # 0번, 1번, 2번 키 코드
led = Pin(2, Pin.OUT)
got = []

def callback(data, addr, ctrl):
    if data >= 0:
        got.append(data)

ir = NEC_16(Pin(25, Pin.IN), callback)
blink = False
t_blink = ticks_ms()
print('리모컨 0 = 끄기, 1 = 켜기, 2 = 깜빡이기')
while True:
    while got:
        code = got.pop(0)
        if code == KEY_OFF:
            blink = False
            led.value(0)
            print('LED 꺼짐')
        elif code == KEY_ON:
            blink = False
            led.value(1)
            print('LED 켜짐')
        elif code == KEY_BLINK:
            blink = True
            print('LED 깜빡임')
        else:
            print('알 수 없는 키:', hex(code))
    if blink and ticks_diff(ticks_ms(), t_blink) >= 300:
        t_blink = ticks_ms()
        led.value(not led.value())
    sleep_ms(20)
