# BOOT 버튼을 누르고 있는 동안만 펌프가 돌고, 5초가 지나면 안전을 위해 자동으로 꺼요.
# 5초 뒤에는 버튼을 한 번 떼었다가 다시 눌러야 켜져요. (`MAX_MS` 를 바꿔 보세요)
# ⚠️ 펌프를 물 없이 오래 돌리면 고장 나요! 물이 있는 상태에서 쓰고, 전기 부품에 물이 튀지 않게 해요.
from machine import Pin
from time import sleep_ms, ticks_ms, ticks_diff

relay = Pin(23, Pin.OUT, value=0)
button = Pin(0, Pin.IN, Pin.PULL_UP)        # 보드의 BOOT 버튼 (누르면 0)
MAX_MS = 5000                               # 한 번에 최대 가동 시간 (밀리초)
on_since = None                             # 펌프를 켠 시각 (꺼져 있으면 None)
locked = False                              # 안전 차단 뒤에는 버튼을 뗄 때까지 잠가요
print('BOOT 버튼을 누르고 있으면 펌프가 돌아요! (최대', MAX_MS // 1000, '초)')
try:
    while True:
        pressed = button.value() == 0
        if pressed and not locked:
            if on_since is None:
                on_since = ticks_ms()
                relay.value(1)
                print('펌프 켜짐')
            elif ticks_diff(ticks_ms(), on_since) > MAX_MS:
                relay.value(0)
                on_since = None
                locked = True
                print('안전 차단! 너무 오래 켜져 있어서 껐어요. 버튼을 한 번 떼세요.')
        else:
            if on_since is not None:
                relay.value(0)
                print('펌프 꺼짐 (켜져 있던 시간:', ticks_diff(ticks_ms(), on_since), '밀리초)')
                on_since = None
            if not pressed:
                locked = False
        sleep_ms(20)
finally:
    relay.value(0)
