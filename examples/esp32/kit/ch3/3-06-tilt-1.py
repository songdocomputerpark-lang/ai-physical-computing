# 기울기 센서 확인 (LCD 와 출력 창에 같이 보여 줘요)
# 센서를 천천히 기울여 보세요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

tilt = Pin(23, Pin.IN)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('기울기 센서 테스트 시작 (S → GPIO 23)')
show(0, 'Tilt sensor')

while True:
    v = tilt.value()
    if v == 1:
        print('기울기: 기울어졌어요! (값 1)')
        show(1, 'Tilted! (1)')
    else:
        print('기울기: 똑바로예요 (값 0)')
        show(1, 'Upright (0)')
    sleep_ms(200)
