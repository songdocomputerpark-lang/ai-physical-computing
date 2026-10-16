# 숨쉬는 LED - PWM 으로 밝기를 천천히 바꿔요
# 배선은 1단계와 같아요 (S → GPIO 4). BOOT 버튼을 누르면 '숨쉬기 ↔ 깜빡이' 가 바뀌어요
from machine import Pin, PWM
from time import sleep_ms, ticks_ms, ticks_diff

led = PWM(Pin(4), freq=1000)
boot = Pin(0, Pin.IN, Pin.PULL_UP)
modes = ['숨쉬기', '깜빡이']
mode = 0
level = 0
step = 1024
last_press = 0
print('숨쉬는 LED 시작 - BOOT 버튼으로 모드 바꾸기')
try:
    while True:
        if boot.value() == 0 and ticks_diff(ticks_ms(), last_press) > 400:
            last_press = ticks_ms()
            mode = 1 - mode
            print('모드 바뀜:', modes[mode])
        if mode == 0:
            level += step
            if level >= 65535:
                level = 65535
                step = -abs(step)
            elif level <= 0:
                level = 0
                step = abs(step)
            led.duty_u16(level)
            sleep_ms(15)
        else:
            led.duty_u16(65535)
            sleep_ms(200)
            led.duty_u16(0)
            sleep_ms(200)
finally:
    led.duty_u16(0)
    led.deinit()
