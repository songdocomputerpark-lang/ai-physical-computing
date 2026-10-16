# 듀얼 모터 드라이버 기본 동작 테스트: 모터 A·B 가 함께 앞으로 → 멈춤 → 뒤로 → 멈춤을 반복합니다.
# SDA → GPIO 21, SCL → GPIO 22 (드라이버 Motor Power 에 모터 전원, Motor A·B 에 모터를 꽂으세요)
from machine import Pin, SoftI2C
from time import sleep
from pca9685 import DCMotors

print('듀얼 모터 테스트 시작 (SDA → GPIO 21, SCL → GPIO 22)')
i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
dualmotor = DCMotors(i2c)
try:
    while True:
        print('두 모터 시계 방향')
        dualmotor.cw()
        sleep(2)
        dualmotor.stp()
        print('멈춤')
        sleep(1)
        print('두 모터 반시계 방향')
        dualmotor.ccw()
        sleep(2)
        dualmotor.stp()
        print('멈춤')
        sleep(1)
finally:
    dualmotor.stp()
