# 긱 서보모터 기본 동작 테스트: 정지 → 정방향 → 정지 → 역방향 을 반복해요.
# 서보모터의 신호선(주황/노랑)을 GPIO 25 에 꽂았어요. (빨강 = 5V, 갈색/검정 = GND)
# 서보는 20ms 마다 오는 펄스 폭으로 움직여요. 1500µs = 가운데/정지, 그보다 크면 한쪽, 작으면 반대쪽이에요.
# ⚠️ 서보가 움직일 때 순간 전류가 커요. 큰 서보를 여러 개 쓸 땐 별도 전원(건전지)을 쓰세요.
from machine import Pin, PWM
from time import sleep_ms

STOP = 1500                  # 정지(가운데) 펄스 폭 (µs, 마이크로초)
SPEED = 300                  # 정지에서 얼마나 다르게 줄지 (클수록 빨라요. 최대 약 500)
servo = PWM(Pin(25), freq=50)

def pulse(us):               # 펄스 폭(µs) → PWM 값(0~65535) 으로 바꿔서 보내요
    servo.duty_u16(us * 65535 // 20000)

print('긱 서보 테스트 시작 (신호선 → GPIO 25)')
try:
    while True:
        print('정지')
        pulse(STOP)
        sleep_ms(1000)
        print('정방향 (', STOP + SPEED, 'µs )')
        pulse(STOP + SPEED)
        sleep_ms(2000)
        print('정지')
        pulse(STOP)
        sleep_ms(1000)
        print('역방향 (', STOP - SPEED, 'µs )')
        pulse(STOP - SPEED)
        sleep_ms(2000)
finally:
    pulse(STOP)              # 멈추기 전에 꼭 정지 펄스를 보내요
    sleep_ms(300)
    servo.deinit()
