# 로딩 막대 애니메이션 - 0% 에서 100% 까지 차올라요
# 배선은 1단계와 같아요. BOOT 버튼을 누르면 빠르게 ↔ 느리게 바뀌어요
from machine import Pin, SoftI2C
from sh1106 import SH1106_I2C
from time import sleep_ms, ticks_ms, ticks_diff

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
oled = SH1106_I2C(128, 64, i2c, None, addr=0x3C)
boot = Pin(0, Pin.IN, Pin.PULL_UP)

delay = 50
last_press = 0
print('로딩 막대 시작 - BOOT 버튼으로 속도 바꾸기')
while True:
    for p in range(101):
        if boot.value() == 0 and ticks_diff(ticks_ms(), last_press) > 400:
            last_press = ticks_ms()
            delay = 10 if delay == 50 else 50
            print('속도 바뀜 (한 칸에', delay, 'ms)')
        oled.fill(0)
        oled.text('Loading...', 0, 0)
        oled.rect(0, 24, 128, 16, 1)
        oled.fill_rect(2, 26, 124 * p // 100, 12, 1)
        oled.text('{}%'.format(p), 50, 48)
        oled.show()
        if p % 10 == 0:
            print('진행:', p, '%')
        sleep_ms(delay)
    oled.fill(0)
    oled.text('Done!', 44, 28)
    oled.show()
    print('완료!')
    sleep_ms(1500)
