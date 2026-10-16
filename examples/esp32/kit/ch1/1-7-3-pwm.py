from machine import Pin, PWM
from time import sleep

pwm = PWM(Pin(2))
pwm.freq(1000)  # 주파수 1000Hz (LED에 적합)

# LED 밝기가 서서히 밝아졌다 어두워지는 효과
while True:
    # 점점 밝아짐 (duty 0 → 1023)
    for i in range(0, 1024, 8):
        pwm.duty(i)
        sleep(0.01)
    # 점점 어두워짐 (duty 1023 → 0)
    for i in range(1023, -1, -8):
        pwm.duty(i)
        sleep(0.01)
