# DHT11 온습도 센서로 지금 온도와 습도를 읽어요. S 선은 GPIO 23 에 꽂았어요. (V 는 5V)
# 값은 출력 창과 LCD 에 같이 나와요. 센서를 손으로 감싸 쥐면 온도가 올라가는지 지켜보세요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from dht import DHT11
from time import sleep

d = DHT11(Pin(23))
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
print('DHT11 테스트 시작 (S → GPIO 23)')

while True:
    try:
        d.measure()
        t = d.temperature()
        h = d.humidity()
        print('온도:', t, '도, 습도:', h, '%')
        show(0, 'Temp: {} C'.format(t))
        show(1, 'Humi: {} %'.format(h))
    except OSError:
        print('센서를 읽지 못했어요. 선을 확인해 보세요')
        show(0, 'Read error')
    sleep(2)
