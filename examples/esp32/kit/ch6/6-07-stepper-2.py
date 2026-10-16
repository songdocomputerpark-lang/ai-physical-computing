# 스텝 모터 심화 예제: 1초마다 9도씩 돌아 40번이면 한 바퀴! 시계의 초침처럼 움직여요.
# BOOT 버튼을 누르면 돌아가는 방향이 바뀌어요. (DIR → GPIO 25, STEP → GPIO 26)
from machine import Pin
from time import sleep_ms, ticks_ms, ticks_diff
from gorillacell_stepper import GORILLACELL_STEPMOTOR

boot = Pin(0, Pin.IN, Pin.PULL_UP)
stepper = GORILLACELL_STEPMOTOR(step_pin=26, dir_pin=25)
MICRO = 1    # 파란 스위치 설정: 셋 다 OFF = 1 · 1/2 = 2 · 1/4 = 4 · 1/8 = 8 · 1/16 = 16 (카드 위 표)
direction = 'cw'
ticks = 0
turns = 0
t_last = ticks_ms()
print('초침 시작! BOOT 버튼 = 방향 바꾸기')
while True:
    if boot.value() == 0:
        while boot.value() == 0:
            sleep_ms(10)
        direction = 'ccw' if direction == 'cw' else 'cw'
        print('방향 바꿈:', '시계' if direction == 'cw' else '반시계')
    if ticks_diff(ticks_ms(), t_last) >= 1000:
        t_last = ticks_ms()
        stepper.rotate(9 * MICRO, direction)     # 9도 = 5스텝
        ticks += 1
        print('똑딱', ticks, '/ 40')
        if ticks == 40:
            ticks = 0
            turns += 1
            print('한 바퀴 완성! 지금까지', turns, '바퀴')
    sleep_ms(10)
