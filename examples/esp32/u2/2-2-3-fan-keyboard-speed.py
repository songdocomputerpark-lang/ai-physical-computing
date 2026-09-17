from machine import Pin
import time
from gorillacell_dcmotors import GORILLACELL_DCMOTORS
fan = GORILLACELL_DCMOTORS(25, 26)
print("버튼을 누르세요: 1 = 약풍, 2 = 중풍, 0 = 정지")
while True:
    cmd = input("입력(1/2/0): ")
    if cmd == '1':
        fan.rotate('cw', 40)
        print("[Fan] 약풍 (speed=40)")
    elif cmd == '2':
        fan.rotate('cw', 70)
        print("[Fan] 중풍 (speed=70)")
    elif cmd == '0':
        fan.stop()
        print("[Fan] 정지")
    else:
        print("잘못된 입력입니다. 1/2/0 중에서 선책하세요.")