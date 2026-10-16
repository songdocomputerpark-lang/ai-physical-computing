# 펌프 릴레이 V2 기본 동작 테스트: 워터 펌프를 2초 켜고 2초 끄기를 반복해요.
# 펌프 릴레이의 S 선을 GPIO 23 에 꽂았어요. (펌프는 릴레이 모듈의 펌프 단자에 연결)
# ⚠️ 펌프를 물 없이 오래 돌리면 고장 나요! 꼭 물에 담근 채(수중펌프) 또는 물이 흐르는 상태로 시험하고, 전기 부품에 물이 튀지 않게 해요.
from machine import Pin
from time import sleep

relay = Pin(23, Pin.OUT, value=0)
print('펌프 릴레이 테스트 시작 (S → GPIO 23)')
try:
    while True:
        relay.value(1)                  # 릴레이 ON = 펌프 켜짐
        print('펌프 켜짐 (2초)')
        sleep(2)
        relay.value(0)
        print('펌프 꺼짐 (2초)')
        sleep(2)
finally:
    relay.value(0)                      # 멈출 때 꼭 끄기
