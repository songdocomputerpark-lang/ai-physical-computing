# 전자석 심화 예제: BOOT 버튼으로 켜고 끕니다. 켜 둔 지 10초가 지나면 안전하게 자동으로 꺼져요.
# (전자석 S → GPIO 23)
from machine import Pin
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

magnet = Pin(23, Pin.OUT)
led = Pin(2, Pin.OUT)
LIMIT = 10000     # 최대 켜 두는 시간 (ms)
is_on = False
t_on = 0
last_sec = -1

print('BOOT 버튼을 누르면 전자석이 켜지고, 다시 누르면 꺼져요.')
try:
    while True:
        if pressed():
            is_on = not is_on
            magnet.value(1 if is_on else 0)
            led.value(1 if is_on else 0)
            t_on = ticks_ms()
            last_sec = -1
            print('전자석', '켜짐' if is_on else '꺼짐')
        if is_on:
            left = (LIMIT - ticks_diff(ticks_ms(), t_on)) // 1000
            if left != last_sec:
                last_sec = left
                print('자동으로 꺼질 때까지', left + 1, '초')
            if ticks_diff(ticks_ms(), t_on) >= LIMIT:
                is_on = False
                magnet.value(0)
                led.value(0)
                print('안전을 위해 자동으로 껐어요!')
        sleep_ms(20)
finally:
    magnet.value(0)
    led.value(0)
