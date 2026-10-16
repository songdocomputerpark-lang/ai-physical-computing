# 기어 모터 기본 동작 테스트: 시계 방향 → 멈춤 → 반시계 방향 → 멈춤을 반복합니다.
# INA → GPIO 25, INB → GPIO 26
from time import sleep
from gorillacell_dcmotors import GORILLACELL_DCMOTORS

print('기어 모터 테스트 시작 (INA → GPIO 25, INB → GPIO 26)')
gear = GORILLACELL_DCMOTORS(25, 26)
try:
    while True:
        print('시계 방향 회전')
        gear.rotate('cw', speed=50)
        sleep(2)
        gear.stop()
        print('멈춤')
        sleep(1)
        print('반시계 방향 회전')
        gear.rotate('ccw', speed=50)
        sleep(2)
        gear.stop()
        print('멈춤')
        sleep(1)
finally:
    gear.stop()
