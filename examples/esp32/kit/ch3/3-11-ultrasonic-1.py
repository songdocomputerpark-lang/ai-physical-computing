# 초음파 센서로 앞 물체까지의 거리를 재요. TRIG → GPIO 25, ECHO → GPIO 23 에 꽂았어요.
# 거리는 출력 창과 LCD 에 같이 나와요. 센서 앞에 손이나 책을 놓고 움직여 보세요. (2cm ~ 400cm)
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from hcsr04 import HCSR04
from time import sleep_ms

sensor = HCSR04(trigger_pin=25, echo_pin=23, echo_timeout_us=30000)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('초음파 센서 테스트 시작 (TRIG → GPIO 25, ECHO → GPIO 23)')
show(0, 'Ultrasonic')

while True:
    try:
        d = sensor.distance_cm()
        print('거리:', int(d), 'cm')
        show(1, 'Dist: {} cm'.format(int(d)))
    except OSError:
        print('거리: 너무 멀거나 물체가 없어요')
        show(1, 'Out of range')
    sleep_ms(300)
