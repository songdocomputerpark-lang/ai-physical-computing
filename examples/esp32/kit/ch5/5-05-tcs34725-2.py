# 센서에 대 본 색종이가 빨강·노랑·초록·파랑·흰색 중 무엇인지 맞히는 코드예요.
# 배선은 1단계와 같아요. 빨간 색이면 보드 LED 가 켜져요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from tcs34725 import TCS34725
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
sensor = TCS34725(i2c)
led = Pin(2, Pin.OUT)    # 보드 내장 LED

def color_name(r, g, b, c):          # (한글 이름, LCD 영어 이름)
    total = r + g + b
    if c < 50 or total == 0:
        return '너무 어두워요', 'Too dark'
    rp = r * 100 // total     # 빨강이 차지하는 비율(%)
    gp = g * 100 // total
    bp = b * 100 // total
    if max(rp, gp, bp) < 42:
        return '흰색/회색', 'White/Gray'
    if rp > 35 and gp > 35 and bp < 25:
        return '노랑', 'Yellow'
    if rp >= gp and rp >= bp:
        return '빨강', 'Red'
    if gp >= bp:
        return '초록', 'Green'
    return '파랑', 'Blue'

print('색 알아맞히기 시작! 색종이를 센서에 가까이 대 보세요.')
while True:
    r, g, b, c = sensor.read(True)
    korean, english = color_name(r, g, b, c)
    led.value(1 if english == 'Red' else 0)
    print('이 색은', korean, '(R', r, 'G', g, 'B', b, ')')
    show(0, 'Color: ' + english)
    show(1, 'R{} G{} B{}'.format(r, g, b))
    sleep(0.5)
