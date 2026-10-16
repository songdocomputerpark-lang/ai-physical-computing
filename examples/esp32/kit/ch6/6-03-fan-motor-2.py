# 팬 모터 심화 예제: BOOT 버튼을 누를 때마다 바람 세기가 꺼짐 → 약 → 중 → 강 으로 바뀝니다.
# INA → GPIO 25, INB → GPIO 26
from machine import Pin
from time import sleep_ms
from gorillacell_dcmotors import GORILLACELL_DCMOTORS

boot = Pin(0, Pin.IN, Pin.PULL_UP)   # 보드의 BOOT 버튼 (누르면 0)

def pressed():
    # 버튼을 눌렀다 떼면 True (한 번만)
    if boot.value() == 0:
        sleep_ms(30)
        while boot.value() == 0:
            sleep_ms(10)
        return True
    return False

fan = GORILLACELL_DCMOTORS(25, 26)
levels = [('꺼짐', 0), ('약', 40), ('중', 70), ('강', 99)]   # 속도는 0~99
index = 0
print('BOOT 버튼을 누를 때마다 바람 세기가 바뀌어요.')
try:
    while True:
        if pressed():
            index = (index + 1) % len(levels)
            name, speed = levels[index]
            if speed == 0:
                fan.stop()
            else:
                fan.rotate('cw', speed=speed)
            print('바람 세기:', name, '( 속도', speed, ')')
        sleep_ms(20)
finally:
    fan.stop()
