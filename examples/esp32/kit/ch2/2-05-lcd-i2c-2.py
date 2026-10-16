# LCD 스톱워치 + BOOT 버튼 누른 횟수 세기
# 배선은 1단계와 같아요 (SDA → GPIO 21, SCL → GPIO 22)
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD 주소 = 0x20
boot = Pin(0, Pin.IN, Pin.PULL_UP)

def show(row, text):                 # 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

start = ticks_ms()
presses = 0
last_state = 1
last_sec = -1

print('LCD 스톱워치 시작 - BOOT 버튼을 눌러 횟수를 세어 보세요')
lcd.clear()
show(1, 'BOOT x 0')
while True:
    sec = ticks_diff(ticks_ms(), start) // 1000
    if sec != last_sec:
        last_sec = sec
        show(0, 'Time {:02d}:{:02d}'.format(sec // 60, sec % 60))
    state = boot.value()
    if last_state == 1 and state == 0:
        presses += 1
        print('BOOT 버튼', presses, '번 눌림')
        show(1, 'BOOT x {}'.format(presses))
    last_state = state
    sleep_ms(100)
