from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms
import dht

# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

# 온습도 센서(DHT22)의 온도와 습도를 읽는 코드예요. S 선은 GPIO 23 에 꽂았어요.
# DHT22 는 느린 센서라 2초에 한 번만 읽을 수 있어요. 손으로 감싸 쥐거나 입김을 불어 보세요.
sensor = dht.DHT22(Pin(23))
print('DHT22 온습도 센서 테스트 시작 (S → GPIO 23)')
show(0, 'DHT22 sensor')

while True:
    try:
        sensor.measure()
        t = sensor.temperature()
        h = sensor.humidity()
        print('온도:', t, '도 / 습도:', h, '%')
        show(0, 'Temp {} C'.format(t))
        show(1, 'Humi {} %'.format(h))
    except OSError:
        print('읽기 실패! 선(S → GPIO 23)을 확인하세요.')
        show(1, 'Read error')
    sleep_ms(2000)
