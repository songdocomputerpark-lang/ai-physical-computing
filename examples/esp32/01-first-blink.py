# 첫 실습: 내장 LED 깜빡이기
# 보드에 붙어 있는 LED(GPIO2)를 켰다 껐다 해요. 조절 패널의 막대로 깜빡이는 빠르기를 바꿔 봐요.
# @tags LED, Pin, sleep, 출력
# 보드가 없어도 오른쪽 가상 보드의 LED가 똑같이 깜빡여요. 실물 보드에 보내도 같은 코드예요.
from machine import Pin
from time import sleep

interval = 0.5  # @slider 0.1 2 0.1 켜고 끄는 간격(초)

led = Pin(2, Pin.OUT)  # 2번 핀을 "내보내는 핀"(출력)으로 정해요. 내장 LED가 이 핀에 붙어 있어요.

while True:
    led.on()  # 1(HIGH): 3.3V를 내보내 LED를 켜요.
    sleep(interval)  # interval초 동안 기다려요.
    led.off()  # 0(LOW): 0V로 바꿔 LED를 꺼요.
    sleep(interval)

# ── 바꿔볼 것 3가지 ──
# 1. 실행 중에 조절 막대로 interval을 0.1까지 내려 봐요. 깜빡임이 어떻게 달라지나요?
# 2. led.on()과 led.off()를 led.value(1)과 led.value(0)으로 바꿔도 똑같이 되는지 확인해 봐요.
# 3. 켜 있는 시간과 꺼져 있는 시간을 다르게 해 봐요. 예: 0.2초 켜고 1초 끄기.
# ── 왜 이런 결과가 나올까 ──
# Pin(2, Pin.OUT)은 2번 핀을 출력으로 정해요. on()은 핀에 3.3V를, off()는 0V를 내보내요.
# sleep이 없으면 켜고 끄는 일이 눈보다 훨씬 빨리 되풀이돼서 LED가 깜빡이는 것이 보이지 않아요.
# 오른쪽 "핀 상태" 표의 GPIO2 값이 1(HIGH)과 0(LOW)으로 바뀌는 것이 LED가 켜지고 꺼지는 것과 같아요.
