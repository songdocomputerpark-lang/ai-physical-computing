# IR 장애물 센서 확인 (LCD 와 출력 창에 같이 보여 줘요)
# 센서 앞에서 손이나 종이를 가까이 대 보세요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

ir = Pin(23, Pin.IN)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('IR 장애물 센서 테스트 시작 (SIG → GPIO 23)')
show(0, 'IR obstacle')

while True:
    v = ir.value()
    if v == 1:
        print('장애물: 있어요! (값 1)')
        show(1, 'Obstacle! (1)')
    else:
        print('장애물: 없어요 (값 0)')
        show(1, 'Clear (0)')
    sleep_ms(200)
