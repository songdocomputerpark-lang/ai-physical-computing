# 서보 모터 기본 동작 테스트: 0도 → 90도 → 180도 → 90도를 반복합니다.
# 서보의 주황색(신호) 선을 GPIO 25 에 꽂으세요.
from time import sleep
from gorillacell_servo import GORILLACELL_SERVO

print('서보 모터 테스트 시작 (신호선 → GPIO 25)')
servo = GORILLACELL_SERVO(signal_pin=25)
try:
    while True:
        for angle in (0, 90, 180, 90):
            print('각도:', angle, '도')
            servo.rotate(angle)
            sleep(1)
finally:
    servo.rotate(90)
