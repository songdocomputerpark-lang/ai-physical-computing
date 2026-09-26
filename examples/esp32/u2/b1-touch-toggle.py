# 터치할 때마다 내장 LED 켜고 끄기
# 터치 센서 값이 0에서 1로 바뀌는 순간만 알아채, 그때마다 보드의 내장 LED를 켜거나 꺼요.
# @lesson b1
# @tags 터치 센서, 내장 LED, 바뀌는 순간, 입력과 출력
# @part touch-digital 17
from machine import Pin
import time

# ① 핀 정하기: 17번은 터치 센서(입력), 2번은 보드에 붙은 내장 LED(출력)
touch = Pin(17, Pin.IN)
led = Pin(2, Pin.OUT)

# ② 기억할 값: LED가 켜졌는지(처음엔 꺼짐)와 바로 전에 읽은 터치 값
led_on = False
prev_touch = 0
print("터치 센서를 한 번씩 눌렀다 떼 보세요.")

# ③ 되풀이: 0.05초마다 터치 값을 읽어요
while True:
    touch_state = touch.value()          # 누르고 있으면 1, 떼면 0
    # ④ 바뀌는 순간: 바로 전에는 0이었는데 지금 1이면 "방금 눌렀다"
    if prev_touch == 0 and touch_state == 1:
        led_on = not led_on              # 켜져 있으면 끄고, 꺼져 있으면 켜요
        if led_on:
            led.on()
            print("눌렀어요 → LED 켜짐")
        else:
            led.off()
            print("눌렀어요 → LED 꺼짐")
    prev_touch = touch_state             # 다음 비교를 위해 지금 값을 기억해요
    time.sleep(0.05)

# ── 바꿔볼 것 3가지 ──
# 1. 조건을 if touch_state == 1: 로 바꿔 봐요. 터치 센서를 누르고 있는 동안 LED가 어떻게 되나요?
# 2. 조건을 if prev_touch == 1 and touch_state == 0: 으로 바꿔 봐요. LED가 누를 때 바뀌나요, 뗄 때 바뀌나요?
# 3. ②에 count = 0을 더하고 누를 때마다 1씩 늘려, print(count, "번째 눌렀어요")로 찍어 봐요.
# ── 왜 이런 결과가 나올까 ──
# 누르고 있는 동안 touch_state는 계속 1이지만, 0에서 1로 바뀌는 순간은 누르기 시작한 한 번뿐이에요.
# 그래서 prev_touch와 함께 보면 한 번 누를 때 LED가 한 번만 바뀌어요.
# ── 실습 방법 ──
# 1. [실행]을 눌러요.
# 2. 보드 아래 터치 센서를 마우스나 손가락으로 한 번 눌렀다 떼요(키보드는 Tab으로 터치 센서에 간 뒤 Space를 눌렀다 떼요).
# 3. 누를 때마다 내장 LED가 켜지고 꺼지는지, 콘솔에 한 줄씩 나오는지 봐요. 다 봤으면 [정지]를 눌러요.
