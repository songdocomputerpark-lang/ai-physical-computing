# 박수 소리를 세고, 박수 칠 때마다 LED 를 켰다 껐다 하는 코드예요. (배선은 1단계와 같아요)
from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, sleep_us, ticks_ms, ticks_diff

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
mic = ADC(Pin(32))
mic.atten(ADC.ATTN_11DB)
led = Pin(2, Pin.OUT)     # 보드 내장 LED

def loudness():
    low = 4095
    high = 0
    for i in range(200):          # 아주 짧은 시간에 200번 읽어 가장 큰 흔들림을 찾는다
        v = mic.read()
        if v < low:
            low = v
        if v > high:
            high = v
        sleep_us(100)
    return high - low

print('조용한 정도를 재는 중... 1초만 가만히 계세요.')
show(0, 'Measuring quiet')
quiet = 0
for i in range(20):
    quiet = max(quiet, loudness())
    sleep_ms(50)
threshold = quiet * 2 + 400      # 이보다 크면 박수로 본다
print('박수 기준:', threshold, '  이제 박수를 쳐 보세요!')

count = 0
last = ticks_ms()
last_lcd = ticks_ms()
level = 0
while True:
    level = loudness()
    if level > threshold and ticks_diff(ticks_ms(), last) > 400:
        count += 1
        last = ticks_ms()
        led.value(not led.value())
        print('짝!', count, '번째 박수 (크기', level, ')')
    if ticks_diff(ticks_ms(), last_lcd) >= 300:      # LCD 는 0.3초마다만 갱신
        last_lcd = ticks_ms()
        show(0, 'Claps: {}'.format(count))
        show(1, 'Lv {} / T {}'.format(level, threshold))
    sleep_ms(10)
