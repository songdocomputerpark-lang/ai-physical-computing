# 16채널 서보 드라이버(PCA9685) 기본 동작 테스트: 채널 0 의 서보가 0도 → 180도 → 0도로 천천히 움직여요.
# I2C 선(SDA=GPIO 21, SCL=GPIO 22)만 보드에 꽂고, 서보는 드라이버의 채널 0 에 꽂아요(주황/노랑 = 신호가 위쪽).
# ⚠️ 서보 전원은 드라이버의 V+ 단자에 따로 (건전지 5~6V) 연결해야 해요. 보드 5V 로 여러 개를 돌리면 보드가 꺼질 수 있어요.
from machine import Pin, SoftI2C
from pca9685 import PCA9685
from time import sleep_ms

# PCA9685: SDA → GPIO 21, SCL → GPIO 22 (I2C 주소 0x40)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
if 0x40 not in i2c.scan():
    print('PCA9685 를 못 찾았어요. SDA(21)·SCL(22) 선과 전원을 확인하세요.')
    raise SystemExit
pca = PCA9685(i2c, 0x40)
pca.freq(50)                 # 서보는 50Hz (20ms 마다 펄스)

def angle(ch, deg):          # 채널 ch 의 서보를 deg 도(0~180)로
    us = 500 + deg * 2000 // 180          # 0도 = 500µs, 180도 = 2500µs
    pca.duty(ch, us * 4096 // 20000)      # 12비트(0~4095) 값으로 바꿔서 보내요

def release(ch):             # 신호를 끊어서 서보에 힘이 안 들어가게
    pca.duty(ch, 0)

print('PCA9685 서보 테스트 시작 (SDA → 21, SCL → 22, 채널 0)')
try:
    while True:
        for deg in range(0, 181, 10):
            angle(0, deg)
            print('채널 0 →', deg, '도')
            sleep_ms(150)
        for deg in range(180, -1, -10):
            angle(0, deg)
            print('채널 0 →', deg, '도')
            sleep_ms(150)
finally:
    angle(0, 90)
    sleep_ms(300)
    release(0)
