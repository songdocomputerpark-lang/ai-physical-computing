# IR 송신기 기본 동작 테스트: 1초마다 리모컨 신호(NEC 방식)를 보냅니다.
# IR 송신기의 S 선을 GPIO 23 에 꽂으세요. 눈에는 안 보이니 휴대폰 카메라로 송신기를 보면 깜빡여요!
from machine import Pin
from time import sleep
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

print('IR 송신기 테스트 시작 (S → GPIO 23)')
led = Pin(2, Pin.OUT)   # 보낼 때마다 보드 LED 도 깜빡여요
count = 0
try:
    while True:
        count += 1
        led.value(1)
        send(0x00, 0x0C)    # 주소 0x00, 코드 0x0C (보통 리모컨의 1번 키)
        print(count, '번째 신호 보냄 (주소 0x00, 코드 0x0C)')
        sleep(0.2)
        led.value(0)
        sleep(0.8)
finally:
    rmt.deinit()
    led.value(0)
