from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

adc = ADC(Pin(32))
adc.atten(ADC.ATTN_11DB)     # 0~3.3V 까지 읽기 (값 0~4095)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

def read_mv(n=1):                    # n번 읽은 평균을 mV(밀리볼트)로 돌려줌
    total = 0
    for i in range(n):
        total += adc.read()
        sleep_ms(5)
    raw = total // n
    return raw, raw * 3300 // 4095

# 50ms(0.05초) 동안 가장 큰 값을 '두드림 세기'로 삼고, 두드린 횟수를 세요.
# 한 번 두드리면 값이 여러 번 튀므로, 문턱을 넘으면 한 번만 세고 잠깐 쉬었다가 다시 세요.
THRESH = 300        # 이 값을 넘으면 '두드림' (둔하면 작게, 너무 잘 세지면 크게)
REARM_MS = 200      # 한 번 센 뒤 200ms 동안은 다시 세지 않아요
count = 0
armed = True
last_hit = ticks_ms()
shown = (-1, -1)
print('두드림 세기와 횟수를 재요! 센서 옆 책상을 두드려 보세요.')

while True:
    peak = 0
    start = ticks_ms()
    while ticks_diff(ticks_ms(), start) < 50:      # 50ms 창 안에서 최댓값 찾기
        v = adc.read()
        if v > peak:
            peak = v
    now = ticks_ms()
    if peak > THRESH and armed:
        count += 1
        armed = False
        last_hit = now
        print('톡! 세기:', peak, '/ 횟수:', count)
    elif peak <= THRESH and ticks_diff(now, last_hit) > REARM_MS:
        armed = True
    if (peak, count) != shown:                     # 값이 바뀔 때만 LCD 갱신
        shown = (peak, count)
        show(0, 'Power {}'.format(peak))
        show(1, 'Count {}'.format(count))
