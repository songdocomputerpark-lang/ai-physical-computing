# BOOT 버튼을 누를 때마다 서보의 '속도 단계'가 바뀌어요: 정지 → 정방향 점점 빠르게 → 정지 → 역방향 점점 빠르게
# 360도 연속회전 서보는 각도가 아니라 '속도와 방향'을 펄스 폭으로 정해요. (1500µs = 정지, 1000/2000µs = 한쪽 방향 절반 속도)
# 각도형 서보(회색·레고 서보)는 이 코드를 쓰면 돌지 않고 정해진 각도로 움직였다 멈춰요.
# ⚠️ 서보가 움직일 때 순간 전류가 커요. 큰 서보를 여러 개 쓸 땐 별도 전원(건전지)을 쓰세요.
from machine import Pin, PWM
from time import sleep_ms

servo = PWM(Pin(25), freq=50)
button = Pin(0, Pin.IN, Pin.PULL_UP)        # 보드의 BOOT 버튼 (누르면 0)
levels = [1500, 1600, 1700, 1800, 2000, 1500, 1400, 1300, 1200, 1000]
idx = 0

def pulse(us):
    servo.duty_u16(us * 65535 // 20000)

pulse(levels[0])
print('BOOT 버튼을 누를 때마다 속도가 바뀌어요! (지금: 정지)')
try:
    while True:
        if button.value() == 0:
            idx = (idx + 1) % len(levels)
            us = levels[idx]
            pulse(us)
            if us > 1500:
                way = '정방향'
            elif us < 1500:
                way = '역방향'
            else:
                way = '정지'
            print('단계', idx, '→', way, '/', us, 'µs / 속도 약', abs(us - 1500) // 5, '%')
            while button.value() == 0:      # 버튼에서 손을 뗄 때까지 기다려요
                sleep_ms(20)
            sleep_ms(50)
        sleep_ms(20)
finally:
    pulse(1500)
    sleep_ms(300)
    servo.deinit()
