# 스텝 모터 기본 동작 테스트: 90도 시계 방향 → 쉬기 → 90도 반시계 방향 → 쉬기를 반복합니다.
# DIR → GPIO 25, STEP → GPIO 26 (스텝 모터 드라이버의 9V DC 전원도 꼭 연결하세요)
from time import sleep
from gorillacell_stepper import GORILLACELL_STEPMOTOR

print('스텝 모터 테스트 시작 (DIR → GPIO 25, STEP → GPIO 26)')
stepper = GORILLACELL_STEPMOTOR(step_pin=26, dir_pin=25)
MICRO = 1    # 파란 스위치 설정: 셋 다 OFF = 1 · 1/2 = 2 · 1/4 = 4 · 1/8 = 8 · 1/16 = 16 (카드 위 표)
while True:
    print('시계 방향 90도')
    stepper.rotate(90 * MICRO, 'cw')
    sleep(1)
    print('반시계 방향 90도')
    stepper.rotate(90 * MICRO, 'ccw')
    sleep(1)
