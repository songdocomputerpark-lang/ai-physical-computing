# 버튼이 살아 있는지 확인해요. S 선을 GPIO 23 에 꽂았어요. (LCD 와 출력 창에 같이 보여 줘요)
# 시작할 때는 버튼에서 손을 떼고 있어야 해요. (그때의 값을 '안 눌림'으로 기억해요)
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

button = Pin(23, Pin.IN)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
idle = button.value()
print('버튼 테스트 시작 (S → GPIO 23)')
print('안 눌렀을 때 값:', idle)
show(0, 'Button test')

while True:
    if button.value() != idle:
        print('버튼: 눌렸어요!')
        show(1, 'PRESSED!')
    else:
        print('버튼: 안 눌렸어요')
        show(1, 'Released')
    sleep_ms(200)
