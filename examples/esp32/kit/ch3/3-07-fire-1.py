# 화재 센서 확인 (LCD 와 출력 창에 같이 보여 줘요)
# 불꽃은 센서에서 충분히 떨어뜨리고, 어른과 함께 안전하게 해 보세요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

fire = Pin(23, Pin.IN)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('화재 센서 테스트 시작 (S → GPIO 23)')
show(0, 'Fire sensor')

while True:
    v = fire.value()
    if v == 1:
        print('불꽃: 감지됨! (값 1)')
        show(1, 'FIRE! (1)')
    else:
        print('불꽃: 없음 (값 0)')
        show(1, 'No fire (0)')
    sleep_ms(300)
