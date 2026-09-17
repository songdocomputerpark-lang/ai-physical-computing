# 타이머로 LED 깜빡이기
# Timer가 정해진 간격마다 함수를 불러 LED를 바꿔요. 코드가 끝나도 타이머는 [정지]를 누를 때까지 계속 돌아요.
# @tags Timer, 콜백, LED
from machine import Pin, Timer

led = Pin(2, Pin.OUT)


def blink(timer):  # 타이머가 부를 함수(콜백)
    led.value(not led.value())  # 켜져 있으면 끄고, 꺼져 있으면 켜요.


timer = Timer(0)  # 0번 타이머
timer.init(period=300, mode=Timer.PERIODIC, callback=blink)  # 300밀리초마다 blink를 불러 줘요.
print("타이머를 켰어요. 멈추려면 [정지]를 누르세요.")

# ── 실습 방법 ──
# 1. [실행]을 눌러요. 콘솔에 "타이머를 켰어요"가 나와요.
# 2. 코드가 끝났는데도 내장 LED가 계속 깜빡이는지 봐요.
# 3. [정지]를 눌러 타이머를 멈춰요.
# ── 바꿔볼 것 3가지 ──
# 1. period를 100이나 1000으로 바꾸고 다시 [실행]해 봐요.
# 2. mode=Timer.PERIODIC을 mode=Timer.ONE_SHOT으로 바꾸면 어떻게 될까요?
# 3. 맨 위에 import time을 넣고, print 줄 다음에 time.sleep(3)과 timer.deinit()을 차례로 적어 3초 뒤에 타이머를 멈춰 봐요.
# ── 왜 이런 결과가 나올까 ──
# timer.init()은 "period 밀리초마다 blink를 불러 줘"라고 보드에 부탁하고 곧바로 다음 줄로 가요. 그래서 print가 먼저 나와요.
# 코드는 print에서 끝나지만 보드는 타이머 부탁을 기억하고 있어서 LED를 계속 바꿔요. 실물 보드도 똑같아요.
