# IR 송신기 심화 예제: BOOT 버튼을 누를 때마다 다음 코드(1번 → 2번 → 3번 키)를 보냅니다.
# (IR 송신기 S → GPIO 23) 휴대폰 카메라나 IR 수신기로 확인해 보세요.
from machine import Pin
from time import sleep_ms
import esp32

# NEC 리모컨 신호 만들기: 시작(9ms 켜고 4.5ms 쉼) + 32칸(주소·코드와 그 반대값) + 끝
rmt = esp32.RMT(0, pin=Pin(23, Pin.OUT, value=0), resolution_hz=1000000,
                tx_carrier=(38000, 33, 1))   # 38kHz 로 깜빡이는 적외선

def send(addr, code):
    word = (addr & 0xff) | (((addr ^ 0xff) & 0xff) << 8) | ((code & 0xff) << 16) | (((code ^ 0xff) & 0xff) << 24)
    pulses = [9000, 4500]
    for i in range(32):
        pulses.append(563)                                  # 짧게 켜기
        pulses.append(1687 if (word >> i) & 1 else 563)     # 길게 쉬면 1, 짧게 쉬면 0
    pulses.append(563)
    rmt.write_pulses(pulses, 1)
    rmt.wait_done(timeout=200)

boot = Pin(0, Pin.IN, Pin.PULL_UP)   # 보드의 BOOT 버튼 (누르면 0)

def pressed():
    # 버튼을 눌렀다 떼면 True (한 번만)
    if boot.value() == 0:
        sleep_ms(30)
        while boot.value() == 0:
            sleep_ms(10)
        return True
    return False

keys = [('1번 키', 0x0C), ('2번 키', 0x18), ('3번 키', 0x5E)]
index = 0
print('BOOT 버튼을 누르면 리모컨 신호를 보내요.')
try:
    while True:
        if pressed():
            name, code = keys[index]
            send(0x00, code)
            print(name, '전송 (코드', hex(code), ')')
            index = (index + 1) % len(keys)
        sleep_ms(20)
finally:
    rmt.deinit()
