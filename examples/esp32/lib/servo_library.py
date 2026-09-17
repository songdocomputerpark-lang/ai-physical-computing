# servo_library.py — 교과서 2-2-4 "서보모터 활용하기"의 서보모터 라이브러리(복원본)
# 교과서 원고 174쪽 "단계 1 라이브러리 저장하기" 화면(Thonny)의 코드 20줄을 글자 그대로 옮겼어요. 원본 파일은 자료에 없어요(운영자 원고, DECISIONS O2).
# 이 안내 네 줄 아래가 화면의 1~20번 줄이에요. 보드에 저장할 때도 파일 이름은 servo_library.py 그대로 써요.
# rotate(각도)는 duty = int(40 + 각도 / 180 × 75)로 보내요(0도 = 40, 90도 = 77, 180도 = 115). 한 번 돌릴 때마다 0.5초 기다려요.
from machine import Pin, PWM
import time

class ServoMotor:
    def __init__(self, signal_pin, freq=50):
        self.pwm = PWM(Pin(signal_pin), freq=freq)
        self.pwm.duty(0)

    def rotate(self, angle):
        """
        angle: 0 ~ 180 도 범위
        입력 각도에 따라 서보모터 위치 조절
        """
        angle = max(0, min(180, angle))
        duty = int(40 + (angle / 180) * 75)
        self.pwm.duty(duty)
        time.sleep(0.5)

    def stop(self):
        self.pwm.duty(0)
