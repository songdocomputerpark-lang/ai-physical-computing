# FSR 압력 센서에 가해지는 힘을 읽어요. SIG 선은 GPIO 32 에 꽂았어요. (VCC 는 3V3)
# 센서의 동그란 부분을 손가락으로 약하게, 세게 눌러 보세요. (LCD 에도 막대로 나와요)
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

fsr = ADC(Pin(32))
fsr.atten(ADC.ATTN_11DB)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('FSR 압력 센서 테스트 시작 (SIG → GPIO 32)')
show(0, 'FSR pressure')

while True:
    v = fsr.read()
    print('누르는 힘 값:', v, ' ', '#' * (v * 20 // 4095))
    show(1, '{:4d} {}'.format(v, '#' * (v * 11 // 4095)))
    sleep_ms(300)
