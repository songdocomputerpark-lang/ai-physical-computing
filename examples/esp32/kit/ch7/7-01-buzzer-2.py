# 부저 심화 예제: 반짝반짝 작은 별을 연주합니다.
# BOOT 버튼을 누르면 빠르게/느리게 바뀝니다. (부저 S → GPIO 23)
from machine import Pin, PWM
from time import sleep_ms

boot = Pin(0, Pin.IN, Pin.PULL_UP)   # 보드의 BOOT 버튼 (누르면 0)

def pressed():
    # 버튼을 눌렀다 떼면 True (한 번만)
    if boot.value() == 0:
        sleep_ms(30)
        while boot.value() == 0:
            sleep_ms(10)
        return True
    return False

C, D, E, F, G, A = 523, 587, 659, 698, 784, 880
song = [(C, 1), (C, 1), (G, 1), (G, 1), (A, 1), (A, 1), (G, 2),
        (F, 1), (F, 1), (E, 1), (E, 1), (D, 1), (D, 1), (C, 2)]

buzzer = PWM(Pin(23))
beat = 400   # 한 박자의 길이 (ms)
print('작은 별 연주 시작! BOOT 버튼 = 속도 바꾸기')
try:
    while True:
        for hz, length in song:
            buzzer.freq(hz)
            buzzer.duty_u16(32768)
            sleep_ms(beat * length - 60)
            buzzer.duty_u16(0)
            sleep_ms(60)
            if pressed():
                beat = 200 if beat == 400 else 400
                print('박자 길이:', beat, 'ms')
        print('--- 한 곡 끝, 1.5초 쉬어요 ---')
        sleep_ms(1500)
finally:
    buzzer.duty_u16(0)
    buzzer.deinit()
