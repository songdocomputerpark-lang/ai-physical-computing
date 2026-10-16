# DC 모터 심화 예제: 속도를 부드럽게 올렸다가 내립니다. (듀얼 모터 드라이버 Motor A)
# 드라이버 SDA → GPIO 21, SCL → GPIO 22
from machine import Pin, SoftI2C
from time import sleep_ms
from pca9685 import DCMotors

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
motor = DCMotors(i2c)
print('부드럽게 출발! (Ctrl-C 또는 멈추기)')
try:
    while True:
        for v in range(0, 4001, 200):      # 점점 빠르게
            motor.speed(0, v)
            print('속도:', v * 100 // 4095, '%')
            sleep_ms(300)
        for v in range(4000, -1, -200):    # 점점 느리게
            motor.speed(0, v)
            print('속도:', v * 100 // 4095, '%')
            sleep_ms(300)
        motor.brake(0)
        print('--- 잠깐 멈춤 ---')
        sleep_ms(1000)
finally:
    motor.brake(0)
    motor.brake(1)
