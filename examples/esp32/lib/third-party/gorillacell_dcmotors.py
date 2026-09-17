# gorillacell_dcmotors.py — 팬(DC) 모터 라이브러리 PWM판, 이 사이트가 원고 스크린숏으로 복원한 파일
#
# [복원 근거]
# - 아래 클래스의 첫 20줄("from machine import Pin, PWM"부터 'ccw' 분기의 첫 줄까지)은 교과서 원고 II단원 169쪽
#   Thonny 스크린숏의 gorillacell_dcmotors.py 탭을 그대로 옮겼다: freq=1000, rotate(direction, speed=100),
#   duty = int(1023 * (max(0, min(speed, 100)) / 100)).
# - 스크린숏이 20번째 줄에서 잘려 있어 'ccw' 분기의 나머지와 stop()은 보이는 'cw' 분기와 같은 규칙으로 채웠다.
# - 자료의 키트 라이브러리(Library-6.20, 디지털판)는 rotate(direction='cw')에 속도 인자가 없어
#   원고 170~172쪽 예제(rotate('cw', speed=30), rotate('cw', 40))가 TypeError로 멈춘다. 그래서 PWM판을 복원했다.
# - 같은 계열 코드가 George Bantique의 "034 - MicroPython TechNotes: DC Motors"(TechToTinker, 2021-05-08)에
#   실려 있다. 그 글의 PWM 예제는 500Hz·speed 0~99라 이 파일은 원고 스크린숏을 따랐다. 글에 라이선스 표기가 없어
#   원 권리는 원 저작자에게 있다(운영자 사용 허락 O5, 사이트 출처 등록부 sources.yaml).
# - 보드에는 gorillacell_dcmotors.py라는 이름으로 저장한다(사이트의 가상 보드는 저절로 불러온다).
#   machine.PWM이 있는 MicroPython(ESP32)에서 돈다.
from machine import Pin, PWM

class GORILLACELL_DCMOTORS:
    def __init__(self, pin1, pin2, freq=1000):
        self.pwm1 = PWM(Pin(pin1), freq=freq)
        self.pwm2 = PWM(Pin(pin2), freq=freq)
        self.stop()

    def rotate(self, direction, speed=100):
        """
        direction: 'cw' (시계방향), 'ccw' (반시계방향)
        speed: 0~100 (%) 사이로 속도 설정
        """
        duty = int(1023 * (max(0, min(speed, 100)) / 100))

        if direction == 'cw':
            self.pwm1.duty(duty)
            self.pwm2.duty(0)
        elif direction == 'ccw':
            self.pwm1.duty(0)
            self.pwm2.duty(duty)

    def stop(self):
        self.pwm1.duty(0)
        self.pwm2.duty(0)
