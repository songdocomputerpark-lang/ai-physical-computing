# RF433 수신기 심화 예제: 송신기(5.04 심화 예제)가 보낸 숫자(0~255)를 받아 화면에 보여 줍니다.
# (수신기 S → GPIO 25) 신호 모양: 긴 시작 신호 → 8개의 짧은/긴 펄스(0 또는 1)
from machine import Pin, time_pulse_us
from time import sleep_ms

rx = Pin(25, Pin.IN)
led = Pin(2, Pin.OUT)
ok = 0
print('숫자 메시지를 기다리는 중...')
while True:
    w = time_pulse_us(rx, 1, 200000)          # 켜진 시간을 마이크로초로 재기
    if 2500 < w < 3500:                        # 시작 신호(약 3000us)를 찾았다!
        value = 0
        good = True
        for i in range(8):
            w = time_pulse_us(rx, 1, 3000)
            if 250 < w < 700:
                bit = 0
            elif 800 < w < 1300:
                bit = 1
            else:
                good = False
                break
            value = (value << 1) | bit
        if good:
            ok += 1
            led.value(value & 1)
            print('받은 숫자:', value, '(', ok, '번째 )')
    sleep_ms(1)
