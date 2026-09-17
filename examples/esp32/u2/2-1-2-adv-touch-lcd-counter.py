from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep

i2c = SoftI2C(scl = Pin(22), sda = Pin(21),\
              freq = 400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

touch = Pin(17, Pin.IN)

counter = 0 # 초기 상태
prev_touch = 0  # 이전 터치 상태

lcd.clear()
lcd.putstr("Counter: 0")

while True:
    touch_state = touch.value()
    
    # 터치 감지 (엣지 감지: 0 → 1)
    if touch_state == 1 and prev_touch == 0:
        counter += 1
        lcd.clear()
        lcd.putstr("Counter: {}".format(counter))
        sleep(0.3)  # 디바운싱
    
    prev_touch = touch_state
    sleep(0.05)
