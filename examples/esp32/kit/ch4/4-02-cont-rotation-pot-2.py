# 손잡이를 어느 방향으로 돌리는지 알아내고, 몇 바퀴 돌았는지 세어요. 배선은 1단계와 같아요.
# 값이 4095 에서 0 으로(또는 반대로) 갑자기 뛰면 한 바퀴 돌았다고 봐요. (LCD 에도 보여 줘요)
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

pot = ADC(Pin(32))
pot.atten(ADC.ATTN_11DB)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
last = pot.read()
turns = 0
print('손잡이를 돌려 보세요 (방향과 바퀴 수를 알려 줘요)')
show(0, 'Turns: 0')
show(1, 'Val {}'.format(last))

while True:
    v = pot.read()
    diff = v - last
    if diff > 2000:           # 0 근처에서 4095 근처로 뛰었다 -> 한 바퀴 거꾸로
        turns -= 1
        print('한 바퀴 반대로! 지금까지', turns, '바퀴')
    elif diff < -2000:        # 4095 근처에서 0 근처로 뛰었다 -> 한 바퀴
        turns += 1
        print('한 바퀴 돌았어요! 지금까지', turns, '바퀴')
    elif diff > 40:
        print('값 커지는 쪽으로 돌리는 중:', v)
        show(1, 'Up   {}'.format(v))
    elif diff < -40:
        print('값 작아지는 쪽으로 돌리는 중:', v)
        show(1, 'Down {}'.format(v))
    show(0, 'Turns: {}'.format(turns))
    last = v
    sleep_ms(100)
