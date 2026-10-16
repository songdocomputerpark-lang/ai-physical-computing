# 어두워지면 내장 LED(GPIO 2)가 저절로 켜지고, 밝아지면 꺼져요. (자동 가로등, LCD 에도 보여 줘요)
# 시작할 때 센서가 밝은 곳을 보게 두세요. 그 밝기를 기준으로 어두운 정도를 판단해요.
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

ldr = ADC(Pin(32))
ldr.atten(ADC.ATTN_11DB)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
show(0, 'Street light')
show(1, 'Calibrating...')
total = 0
for i in range(10):
    total += ldr.read()
    sleep_ms(100)
bright = total // 10
print('기준 밝기:', bright, '- 센서를 손으로 가려 보세요')

while True:
    v = ldr.read()
    if v < bright * 60 // 100:        # 기준의 60% 보다 어두우면 켜요
        led.on()
    elif v > bright * 75 // 100:      # 기준의 75% 보다 밝아지면 꺼요
        led.off()
    if led.value():
        print('밝기', v, '-> 어두워요, 가로등 켜짐')
        show(1, 'Dark {} LAMP ON'.format(v))
    else:
        print('밝기', v, '-> 밝아요, 가로등 꺼짐')
        show(1, 'Bright {} off'.format(v))
    sleep_ms(300)
