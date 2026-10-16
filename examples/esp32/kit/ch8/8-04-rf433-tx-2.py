# RF433 송신기 심화 예제: BOOT 버튼을 누를 때마다 숫자(0, 1, 2, ...)를 하나씩 보냅니다.
# (송신기 S → GPIO 23) 수신기(5.03 심화 예제)가 이 숫자를 받아 화면에 보여 줘요.
from machine import Pin
from time import sleep_ms, sleep_us

boot = Pin(0, Pin.IN, Pin.PULL_UP)   # 보드의 BOOT 버튼 (누르면 0)

def pressed():
    # 버튼을 눌렀다 떼면 True (한 번만)
    if boot.value() == 0:
        sleep_ms(30)
        while boot.value() == 0:
            sleep_ms(10)
        return True
    return False

tx = Pin(23, Pin.OUT, value=0)
led = Pin(2, Pin.OUT)

def send_byte(value):
    for _ in range(20):             # 잠깐 켰다 껐다: 수신기 깨우기
        tx.value(1)
        sleep_us(500)
        tx.value(0)
        sleep_us(500)
    tx.value(1)                     # 시작 신호 (3000us)
    sleep_us(3000)
    tx.value(0)
    sleep_us(1000)
    for i in range(7, -1, -1):      # 8칸을 위(큰 자리)부터 하나씩
        bit = (value >> i) & 1
        tx.value(1)
        sleep_us(1000 if bit else 500)    # 1 = 길게, 0 = 짧게
        tx.value(0)
        sleep_us(500)

number = 0
print('BOOT 버튼을 누르면 숫자를 보내요.')
try:
    while True:
        if pressed():
            led.value(1)
            for _ in range(3):      # 놓칠 수 있어서 3번 반복해서 보내요
                send_byte(number)
                sleep_ms(30)
            led.value(0)
            print('보낸 숫자:', number)
            number = (number + 1) % 256
        sleep_ms(20)
finally:
    tx.value(0)
    led.value(0)
