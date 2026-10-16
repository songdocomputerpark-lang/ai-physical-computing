# 조도 센서(LDR)로 주변 밝기를 읽어요. S 선은 GPIO 32 에 꽂았어요.
# 센서를 손으로 가렸다 뗐다 하면서 값이 어떻게 변하는지 보세요. (어두우면 값이 작아져요)
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

ldr = ADC(Pin(32))
ldr.atten(ADC.ATTN_11DB)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('조도 센서 테스트 시작 (S → GPIO 32)')
show(0, 'Light sensor')

while True:
    v = ldr.read()
    print('밝기 값:', v, '(0=아주 어두움, 4095=아주 밝음)')
    show(1, 'Light: {}'.format(v))
    sleep_ms(300)
