# 서보 모터 심화 예제: 0도와 180도 사이를 천천히 왔다 갔다 합니다.
# BOOT 버튼을 누르면 빠르게/느리게 바뀌어요. (서보 신호선 → GPIO 25)
from machine import Pin
from time import sleep_ms
from gorillacell_servo import GORILLACELL_SERVO

boot = Pin(0, Pin.IN, Pin.PULL_UP)   # 보드의 BOOT 버튼 (누르면 0)

def pressed():
    # 버튼을 눌렀다 떼면 True (한 번만)
    if boot.value() == 0:
        sleep_ms(30)
        while boot.value() == 0:
            sleep_ms(10)
        return True
    return False

servo = GORILLACELL_SERVO(signal_pin=25)
delay = 30          # 2도 움직인 뒤 기다리는 시간 (ms) - 작을수록 빠름
angle = 0
direction = 1       # 1 = 커지는 방향, -1 = 작아지는 방향
print('천천히 움직이는 중. BOOT 버튼 = 속도 바꾸기')
try:
    while True:
        servo.rotate(angle)
        if angle % 30 == 0:
            print('각도:', angle, '도')
        angle += direction * 2
        if angle >= 180:
            angle = 180
            direction = -1
        elif angle <= 0:
            angle = 0
            direction = 1
        sleep_ms(delay)
        if pressed():
            delay = 5 if delay == 30 else 30
            print('속도 바꿈 → 기다리는 시간', delay, 'ms')
finally:
    servo.rotate(90)
