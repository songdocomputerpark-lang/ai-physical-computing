# 레이저로 SOS 신호 보내기 (모스 부호: 짧게 3번, 길게 3번, 짧게 3번)
# 배선은 1단계와 같아요 (S → GPIO 4)
# ⚠ 레이저는 눈에 비추지 말고, 벽이나 종이를 향하게 하세요!
from machine import Pin
from time import sleep_ms

laser = Pin(4, Pin.OUT)
DOT = 200   # 짧은 신호 길이 (ms)

def signal(length):
    laser.on()
    sleep_ms(length)
    laser.off()
    sleep_ms(DOT)

def send(name, length):
    print(name)
    for i in range(3):
        signal(length)
    sleep_ms(DOT * 2)

print('SOS 신호 시작')
try:
    while True:
        send('S (짧게 3번)', DOT)
        send('O (길게 3번)', DOT * 3)
        send('S (짧게 3번)', DOT)
        print('--- 잠깐 쉬어요 ---')
        sleep_ms(2000)
finally:
    laser.off()
