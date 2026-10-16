# 4개의 버튼으로 비밀번호 1-3-2-4 를 맞추는 게임이에요. 배선은 1단계와 같아요.
# 맞게 누르면 한 칸씩 진행하고, 틀리면 처음부터 다시 시작해요. 다 맞으면 LED 가 깜빡이고 LCD 에 OPEN! 이 나와요.
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

ats = ADC(Pin(32))
ats.atten(ADC.ATTN_11DB)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
SECRET = [1, 3, 2, 4]
pos = 0

def which():
    v = ats.read()
    if 608 < v < 728:
        return 1
    if 1453 < v < 1573:
        return 2
    if 2273 < v < 2393:
        return 3
    if 3139 < v < 3259:
        return 4
    return 0

print('비밀번호 4자리를 눌러 보세요 (힌트: 1-3-2-4)')
show(0, 'Enter password')
show(1, 'Step 0/4')
released = True
while True:
    k = which()
    if k == 0:
        released = True
    elif released:                 # 버튼을 눌렀다 뗀 뒤 다시 누를 때만
        released = False
        print(k, '번을 눌렀어요')
        if k == SECRET[pos]:
            pos += 1
            print('  맞아요!', pos, '/', len(SECRET))
            show(1, 'Step {}/4 OK'.format(pos))
            if pos == len(SECRET):
                print('금고가 열렸어요! 성공!')
                show(1, 'OPEN!')
                for i in range(6):
                    led.value(not led.value())
                    sleep_ms(150)
                led.value(0)
                pos = 0
                show(1, 'Step 0/4')
        else:
            print('  틀렸어요. 처음부터 다시!')
            show(1, 'WRONG! Again')
            pos = 0
    sleep_ms(30)
