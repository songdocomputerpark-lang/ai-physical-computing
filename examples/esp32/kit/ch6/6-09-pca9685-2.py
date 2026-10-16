# 여러 채널의 서보를 차례로 움직이고, 마지막에는 한 칸씩 늦게 움직이는 '물결(웨이브)' 동작을 해요.
# 채널 0~3 에 서보 4개를 꽂아요. `CHANNELS` 를 바꾸면 더 많이도 쓸 수 있어요(최대 16).
# ⚠️ 서보 전원은 드라이버의 V+ 단자에 따로 (건전지 5~6V) 연결해요. 서보 4개 이상은 보드 5V 로 돌리면 안 돼요.
import math
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

CHANNELS = 4
print('서보 여러 개 순차 동작 시작! (채널 0 ~', CHANNELS - 1, ')')
try:
    while True:
        for ch in range(CHANNELS):            # 1) 차례로 90도로
            print('채널', ch, '→ 90도')
            angle(ch, 90)
            sleep_ms(400)
        for ch in range(CHANNELS):            # 2) 차례로 0도로
            print('채널', ch, '→ 0도')
            angle(ch, 0)
            sleep_ms(400)
        print('물결 동작!')
        for t in range(0, 361, 10):           # 3) 채널마다 45도씩 늦게 움직이기
            for ch in range(CHANNELS):
                angle(ch, int(90 + 90 * math.sin(math.radians(t - ch * 45))))
            sleep_ms(40)
finally:
    for ch in range(CHANNELS):
        angle(ch, 90)
    sleep_ms(400)
    for ch in range(CHANNELS):
        release(ch)
