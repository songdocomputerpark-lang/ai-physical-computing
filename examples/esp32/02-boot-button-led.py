# BOOT 버튼을 누르면 LED 켜기
# 보드의 BOOT 버튼(GPIO0)을 누르고 있는 동안 내장 LED(GPIO2)가 켜져요. 이 버튼은 누르면 0, 떼면 1로 읽혀요.
# @tags 버튼, 입력, Pin.IN, LED
# 가상 보드의 BOOT 버튼은 마우스로 누르고 있거나, Tab 키로 버튼에 간 뒤 Space를 누르고 있으면 눌려요.
from machine import Pin
from time import sleep_ms

led = Pin(2, Pin.OUT)  # 내장 LED: 출력
button = Pin(0, Pin.IN)  # BOOT 버튼: 입력(평소 1, 누르면 0)

while True:
    if button.value() == 0:  # 버튼을 누르고 있으면
        led.on()
    else:
        led.off()
    sleep_ms(20)  # 0.02초마다 다시 확인해요.

# ── 바꿔볼 것 3가지 ──
# 1. == 0을 == 1로 바꾸면 LED가 언제 켜질까요? 먼저 짐작해 보고 실행해 봐요.
# 2. led.on()과 led.off()의 자리를 서로 바꿔 "누르면 꺼지는" LED를 만들어 봐요.
# 3. 버튼을 한 번 누를 때마다 켜짐과 꺼짐이 바뀌는 스위치를 만들어 봐요. 바로 전에 읽은 값을 변수에 기억해 두면 돼요.
# ── 왜 이런 결과가 나올까 ──
# BOOT 버튼은 누르면 GPIO0을 GND(0V)에 이어요. 누르지 않을 때는 보드가 핀을 3.3V 쪽으로 끌어올려 두어(풀업) 1로 읽혀요.
# 그래서 이 버튼은 "누르면 0"인, 거꾸로 동작하는 버튼이에요. 터치 센서처럼 "누르면 1"인 부품은 == 1로 확인해요.
