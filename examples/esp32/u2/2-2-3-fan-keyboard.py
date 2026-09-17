from machine import Pin
import time
from gorillacell_dcmotors import GORILLACELL_DCMOTORS

fan = GORILLACELL_DCMOTORS(25, 26)

while True:
    cmd = input('입력(1/0/q):')

    if cmd == '1':
        fan.rotate('cw', speed=100)
        print('[Fan] on (CW, speed = 100)')

    elif cmd == '0':
        fan.stop()
        print('[Fan] OFF (STOP)')

    elif cmd.lower() == 'q':
        fan.stop()
        print('프로그램을 종료합니다.')
        break
    else:
        print('잘못된 입력입니다. 1/0/q 중에서 입력하세요.')