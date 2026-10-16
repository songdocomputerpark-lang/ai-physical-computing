# 부저 기본 동작 테스트: 도레미파솔라시도 음계를 차례로 들려줍니다.
# 부저의 S 선을 GPIO 23 에 꽂으세요.
from machine import Pin, PWM
from time import sleep_ms

print('부저 테스트 시작 (S → GPIO 23)')
buzzer = PWM(Pin(23))
notes = [('도', 523), ('레', 587), ('미', 659), ('파', 698),
         ('솔', 784), ('라', 880), ('시', 988), ('높은 도', 1047)]
try:
    while True:
        for name, hz in notes:
            print('음:', name, '(', hz, 'Hz )')
            buzzer.freq(hz)
            buzzer.duty_u16(32768)   # 소리 켜기 (절반 세기)
            sleep_ms(400)
            buzzer.duty_u16(0)       # 소리 끄기
            sleep_ms(100)
        print('--- 한 번 끝! 1초 쉬고 다시 ---')
        sleep_ms(1000)
finally:
    buzzer.duty_u16(0)
    buzzer.deinit()
