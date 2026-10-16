# L293DD 2단계 — 두 바퀴 자동차 움직임(앞·뒤·왼쪽·오른쪽)을 부드럽게 가속하며 돌려 본다.
# BOOT 버튼을 누를 때마다 «움직임 시작 / 일시 정지» 가 바뀐다. 배선은 1단계와 같다.
from machine import Pin, PWM
from time import sleep, sleep_ms

# 모터 A: AIN1·AIN2 = 방향, PWMA = 속도 / 모터 B: BIN1·BIN2 = 방향, PWMB = 속도
ain1, ain2 = Pin(16, Pin.OUT), Pin(18, Pin.OUT)
bin1, bin2 = Pin(19, Pin.OUT), Pin(14, Pin.OUT)
pwma = PWM(Pin(17), freq=1000, duty_u16=0)
pwmb = PWM(Pin(13), freq=1000, duty_u16=0)

def motor(in1, in2, pwm, speed):     # speed: -100(뒤로) ~ 0(정지) ~ 100(앞으로)
    speed = max(-100, min(100, speed))
    in1.value(1 if speed > 0 else 0)
    in2.value(1 if speed < 0 else 0)
    pwm.duty_u16(abs(speed) * 65535 // 100)

def drive(a, b):                     # 두 모터를 한 번에
    motor(ain1, ain2, pwma, a)
    motor(bin1, bin2, pwmb, b)

boot = Pin(0, Pin.IN, Pin.PULL_UP)
MOVES = [('앞으로', 1, 1), ('오른쪽 회전', 1, -1), ('앞으로', 1, 1), ('왼쪽 회전', -1, 1), ('뒤로', -1, -1)]
running = True

def wait_or_pause(ms):               # ms 동안 기다리며 BOOT 버튼을 본다
    global running
    for i in range(ms // 20):
        if boot.value() == 0:
            running = not running
            print('▶ 다시 시작' if running else '⏸ 일시 정지')
            drive(0, 0)
            while boot.value() == 0:
                sleep_ms(20)
        sleep_ms(20)

def ramp(da, db, top=80):            # 0 → top 까지 천천히 올렸다가 내린다
    for s in list(range(0, top + 1, 10)) + list(range(top, -1, -10)):
        if not running:
            drive(0, 0)
            return
        drive(da * s, db * s)
        wait_or_pause(100)

print('자동차 움직임 시작 — BOOT 버튼 = 일시 정지/다시 시작')
try:
    while True:
        for name, da, db in MOVES:
            while not running:
                wait_or_pause(100)
            print(name)
            ramp(da, db)
            wait_or_pause(300)
finally:
    drive(0, 0)
    print('모터 정지')
