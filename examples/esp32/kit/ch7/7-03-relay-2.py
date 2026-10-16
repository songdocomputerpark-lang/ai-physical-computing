# 릴레이 심화 예제: BOOT 버튼을 누르면 릴레이가 5초 동안 켜졌다가 저절로 꺼집니다.
# 켜진 동안 다시 누르면 5초가 처음부터 다시 시작돼요. (릴레이 S → GPIO 23)
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

relay = Pin(23, Pin.OUT)
ON_TIME = 5000   # 켜 두는 시간 (ms)
is_on = False
t_start = 0
last_sec = -1
count = 0

print('BOOT 버튼을 누르세요 → 5초 타이머')
try:
    while True:
        if pressed():
            count += 1
            t_start = ticks_ms()
            if not is_on:
                is_on = True
                relay.value(1)
                print(count, '번째 누름: 릴레이 켜짐')
            else:
                print(count, '번째 누름: 시간이 다시 5초!')
            last_sec = -1
        if is_on:
            left = (ON_TIME - ticks_diff(ticks_ms(), t_start)) // 1000
            if left != last_sec and left >= 0:
                last_sec = left
                print('남은 시간:', left + 1, '초')
            if ticks_diff(ticks_ms(), t_start) >= ON_TIME:
                is_on = False
                relay.value(0)
                print('시간이 끝났어요 → 릴레이 꺼짐')
        sleep_ms(20)
finally:
    relay.value(0)
