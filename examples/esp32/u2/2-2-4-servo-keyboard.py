from machine import Pin
import time
from servo_library import ServoMotor

servo_1 = ServoMotor(signal_pin=25)
servo_1.rotate(90)

while True:
    cmd = input('서보 제어 (1: 180도, 2: 0도): ')

    if cmd == '1':
        servo_1.rotate(180)
        print('서보모터가 180도로 이동했습니다.')

    elif cmd == '2':
        servo_1.rotate(0)
        print('서보모터가 0도로 이동했습니다.')

    else:
        print('잘못된 입력입니다. 1 또는 2를 입력하세요.')