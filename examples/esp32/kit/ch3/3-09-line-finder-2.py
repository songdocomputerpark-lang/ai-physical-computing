# 센서를 움직이다가 검은 선 위로 올라가는 순간마다 '선을 건넜어요' 를 세어요. (LCD 에도 보여 줘요)
# 어두운 선 위에서는 내장 LED(GPIO 2)가 켜져요. 배선은 1단계와 같아요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

line = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
crossed = 0
last = line.value()
print('검은 선 위로 센서를 지나가 보세요')
show(0, 'Lines: 0')
show(1, 'Light floor')

while True:
    v = line.value()
    if v != last:
        if v == 1:
            crossed += 1
            print('선 위에 올라왔어요! 건넌 횟수:', crossed)
            show(0, 'Lines: {}'.format(crossed))
            show(1, 'On the line')
        else:
            print('선에서 벗어났어요 (밝은 바닥)')
            show(1, 'Light floor')
        last = v
    led.value(v)
    sleep_ms(10)
