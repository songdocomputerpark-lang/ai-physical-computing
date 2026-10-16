# 슬라이더 의 값을 읽어요. S 선은 GPIO 32 에 꽂았어요.
# 슬라이더를 밀면 ADC 값은 0(최소) ~ 4095(최대) 이고, 퍼센트(%)와 함께 LCD 에도 나와요.
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

slider = ADC(Pin(32))
slider.atten(ADC.ATTN_11DB)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('슬라이더 테스트 시작 (S → GPIO 32)')
show(0, 'Analog')

while True:
    v = slider.read()
    print('값:', v, ' (', v * 100 // 4095, '% )')
    show(1, 'Val {} {}%'.format(v, v * 100 // 4095))
    sleep_ms(300)
