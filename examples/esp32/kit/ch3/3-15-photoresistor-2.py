# 센서 사이로 구멍 뚫린 바퀴나 날개가 지나갈 때 1초에 몇 번 가려지는지 세는 코드예요.
# 배선은 1단계와 같아요. 손으로 센서 홈에서 종이를 흔들어도 돼요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import ticks_ms, ticks_diff, sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
sensor = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)    # 보드 내장 LED 는 센서 값을 따라가요

count = 0
last = sensor.value()
start = ticks_ms()
print('속도 재기 시작! 1초마다 가려진 횟수를 알려 줘요.')
show(0, 'Speed Counter')
show(1, 'Counting...')
while True:
    now = sensor.value()
    if now == 1 and last == 0:      # 빛이 새로 가려진 순간만 센다
        count += 1
    last = now
    led.value(now)
    if ticks_diff(ticks_ms(), start) >= 1000:
        print('1초 동안', count, '번 가려졌어요 (1분이면', count * 60, '번)')
        show(1, '{}/s {}/min'.format(count, count * 60))
        count = 0
        start = ticks_ms()
    sleep_ms(1)
