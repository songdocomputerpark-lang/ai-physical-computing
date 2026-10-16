# 가변저항을 돌려서 내장 LED(GPIO 2)의 밝기를 조절해요. 배선은 1단계와 같아요.
# 값(0~4095)을 LED 밝기(0~65535)로 바꿔서 주고, 밝기 막대는 LCD 에도 나와요.
from machine import Pin, ADC, PWM
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

pot = ADC(Pin(32))
pot.atten(ADC.ATTN_11DB)
led = PWM(Pin(2), freq=1000)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('밝기 다이얼 시작 (손잡이를 돌려 보세요)')
show(0, 'LED dimmer')

try:
    while True:
        v = pot.read()
        led.duty_u16(v * 16)
        pct = v * 100 // 4095
        print('밝기', pct, '%', '#' * (v * 20 // 4095))
        show(1, '{:3d}% {}'.format(pct, '#' * (v * 10 // 4095)))
        sleep_ms(200)
finally:
    led.deinit()
