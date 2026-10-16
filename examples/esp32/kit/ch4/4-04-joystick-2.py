# 조이스틱을 민 방향을 글자로 알려 줘요. 시작할 때 가운데에 두면 그 값을 '중앙'으로 기억해요.
# 방향이 반대로 나오면 아래 +/- 를 바꿔 보세요. LCD 에는 영어로 나와요. 배선은 1단계와 같아요.
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

x = ADC(Pin(32))
y = ADC(Pin(33))
x.atten(ADC.ATTN_11DB)
y.atten(ADC.ATTN_11DB)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
sleep_ms(500)
cx = x.read()          # 가운데 기준값
cy = y.read()
GAP = 800              # 중앙에서 이만큼 벗어나야 '밀었다'고 봐요
print('중앙 기준값 X', cx, 'Y', cy, '- 이제 밀어 보세요')
last = ''
show(0, 'Direction')

while True:
    dx = x.read() - cx
    dy = y.read() - cy
    word, eng = '중앙', 'CENTER'
    if abs(dx) >= abs(dy):
        if dx > GAP:
            word, eng = '오른쪽', 'RIGHT'
        elif dx < -GAP:
            word, eng = '왼쪽', 'LEFT'
    else:
        if dy > GAP:
            word, eng = '위쪽', 'UP'
        elif dy < -GAP:
            word, eng = '아래쪽', 'DOWN'
    if word != last:
        print('방향:', word)
        last = word
    show(1, '{} dx{} dy{}'.format(eng, dx // 100, dy // 100))
    led.value(0 if word == '중앙' else 1)
    sleep_ms(100)
