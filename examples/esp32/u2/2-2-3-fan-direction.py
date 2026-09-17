# 필요한 모듈 불러오기
from machine import Pin      # GPIO 핀을 제어할 수 있는 Pin 클래스 사용
import time                  # 시간 지연을 위한 time 모듈 사용

# 팬 모터 제어 핀 설정
ina = Pin(25, Pin.OUT)       # INA 핀을 출력으로 설정 (GPIO 25번 사용)
inb = Pin(26, Pin.OUT)       # INB 핀을 출력으로 설정 (GPIO 26번 사용)

# 반복문을 통해 팬 제어
while True:
    # ▶ 정회전: INA=1, INB=0
    ina.value(1)             # INA 핀 HIGH (전압 인가)
    inb.value(0)             # INB 핀 LOW (전압 없음)
    time.sleep(2)            # 2초 동안 회전 유지

    # ◀ 역회전: INA=0, INB=1
    ina.value(0)             # INA 핀 LOW
    inb.value(1)             # INB 핀 HIGH
    time.sleep(2)            # 2초 동안 회전 유지

    # ■ 정지: INA=0, INB=0
    ina.value(0)             # INA 핀 LOW
    inb.value(0)             # INB 핀 LOW
    time.sleep(2)            # 2초 동안 정지 유지