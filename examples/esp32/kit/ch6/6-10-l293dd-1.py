# L293DD 모터 드라이버 기본 테스트 — 모터 A, B 를 차례로 앞으로·뒤로 돌린다.
# 배선: AIN1 16 · PWMA 17 · AIN2 18 · BIN1 19 · PWMB 13 · BIN2 14, 모터는 Motor A·B 커넥터, 모터 전원(VM)은 배터리.
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

print('L293DD 테스트 시작 (AIN1 16, PWMA 17, AIN2 18 / BIN1 19, PWMB 13, BIN2 14)')
try:
    while True:
        for name, a, b in (('모터 A 앞으로', 70, 0), ('모터 A 뒤로', -70, 0),
                           ('모터 B 앞으로', 0, 70), ('모터 B 뒤로', 0, -70)):
            print(name)
            drive(a, b)
            sleep(2)
            drive(0, 0)
            sleep(0.5)
finally:
    drive(0, 0)                      # 멈추기를 누르면 두 모터 모두 정지
    print('모터 정지')
