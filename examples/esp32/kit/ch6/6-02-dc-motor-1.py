# DC 모터 기본 동작 테스트: 듀얼 모터 드라이버(4.10)의 Motor A 에 모터를 연결했어요.
# 드라이버 SDA → GPIO 21, SCL → GPIO 22. (드라이버 Motor Power 에도 전원을 연결하세요)
from machine import Pin, SoftI2C
from time import sleep
from pca9685 import DCMotors

print('DC 모터 테스트 시작 (SDA → GPIO 21, SCL → GPIO 22)')
i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
motor = DCMotors(i2c)
try:
    while True:
        print('앞으로 회전 (속도 2500)')
        motor.speed(0, 2500)
        sleep(2)
        motor.brake(0)
        print('멈춤')
        sleep(1)
        print('뒤로 회전 (속도 -2500)')
        motor.speed(0, -2500)
        sleep(2)
        motor.brake(0)
        print('멈춤')
        sleep(1)
finally:
    motor.brake(0)
    motor.brake(1)
