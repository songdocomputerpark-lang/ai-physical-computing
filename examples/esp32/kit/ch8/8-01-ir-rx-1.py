# IR 수신기 기본 동작 테스트: 리모컨 버튼을 누르면 버튼 번호(코드)가 나타납니다.
# IR 수신기의 S 선을 GPIO 25 에 꽂고, TV 리모컨(NEC 방식)을 수신기에 향해 누르세요.
from machine import Pin
from time import sleep_ms
from ir_rx import NEC_16

print('IR 수신기 테스트 시작 (S → GPIO 25)')
got = []   # 받은 신호를 잠깐 모아 두는 곳

def callback(data, addr, ctrl):
    if data >= 0:                  # 음수는 오류/반복 신호
        got.append((data, addr))

ir = NEC_16(Pin(25, Pin.IN), callback)
waiting = 0
while True:
    if got:
        data, addr = got.pop(0)
        print('버튼 코드:', hex(data), ' 주소:', hex(addr))
        waiting = 0
    else:
        waiting += 1
        if waiting % 100 == 0:
            print('... 리모컨 버튼을 눌러 보세요')
    sleep_ms(50)
