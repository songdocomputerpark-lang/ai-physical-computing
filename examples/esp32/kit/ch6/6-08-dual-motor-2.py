# 듀얼 모터 드라이버 심화 예제: 두 모터의 속도를 다르게 해서 앞으로·회전·뒤로 움직이는 순서를 반복합니다.
# 모터 A = 왼쪽 바퀴, 모터 B = 오른쪽 바퀴라고 생각하세요. (SDA → GPIO 21, SCL → GPIO 22)
from machine import Pin, SoftI2C
from time import sleep_ms
from pca9685 import DCMotors

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
car = DCMotors(i2c)
# (이름, 왼쪽 속도, 오른쪽 속도, 시간 ms) - 속도는 -4095 ~ 4095
moves = [
    ('앞으로', 2500, 2500, 1500),
    ('왼쪽으로 돌기', 800, 2500, 1500),
    ('오른쪽으로 돌기', 2500, 800, 1500),
    ('제자리 회전', 2500, -2500, 1500),
    ('뒤로', -2500, -2500, 1500),
    ('정지', 0, 0, 1000),
]
print('로봇 자동차 연습 시작')
try:
    while True:
        for name, left, right, ms in moves:
            print('동작:', name)
            car.speed(0, left)
            car.speed(1, right)
            sleep_ms(ms)
finally:
    car.brake(0)
    car.brake(1)
