# 기어 모터 심화 예제: 속도를 0 → 99 까지 서서히 올렸다가 서서히 내리고, 방향을 바꿔 반복합니다.
# INA → GPIO 25, INB → GPIO 26
from time import sleep_ms
from gorillacell_dcmotors import GORILLACELL_DCMOTORS

gear = GORILLACELL_DCMOTORS(25, 26)

def run(direction):
    print('방향:', '시계' if direction == 'cw' else '반시계')
    for speed in range(0, 100, 11):       # 점점 빠르게
        gear.rotate(direction, speed=speed)
        print('속도:', speed)
        sleep_ms(300)
    for speed in range(99, -1, -11):      # 점점 느리게
        gear.rotate(direction, speed=speed)
        print('속도:', speed)
        sleep_ms(300)
    gear.stop()
    sleep_ms(800)

print('서서히 가속·감속 시작')
try:
    while True:
        run('cw')
        run('ccw')
finally:
    gear.stop()
