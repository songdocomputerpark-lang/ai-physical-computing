# 손이 가까이 오면 LED 를 켜고, 주변이 밝은지 어두운지도 알려 주는 코드예요.
# 배선은 1단계와 같아요. 센서 위로 손을 가까이 가져갔다 떼 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from apds9960 import uAPDS9960
from time import sleep

NEAR = 100      # 가까움 값(0~255)이 이보다 크면 '가까이 왔다'
DARK = 200      # 밝기 값이 이보다 작으면 '어둡다' (바꿔 보세요)

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
apds = uAPDS9960(i2c)
apds.enableLightSensor(False)
apds.enableProximitySensor(False)
led = Pin(2, Pin.OUT)    # 보드 내장 LED

print('근접·밝기 센서 시작!')
sleep(0.5)
while True:
    near = apds.readProximity()       # 클수록 손이 가까움
    light = apds.readAmbientLight()   # 클수록 밝음
    led.value(1 if near > NEAR else 0)
    hand = '손이 가까워요!' if near > NEAR else '손이 멀어요'
    room = '어두워요' if light < DARK else '밝아요'
    print('가까움', near, hand, ' 밝기', light, room)
    show(0, 'Prox {} {}'.format(near, 'NEAR' if near > NEAR else 'far'))
    show(1, 'Light {} {}'.format(light, 'DARK' if light < DARK else 'BRIGHT'))
    sleep(0.3)
