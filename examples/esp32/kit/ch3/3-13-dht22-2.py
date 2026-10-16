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

# 온도와 습도로 '불쾌지수'를 계산하고, 켠 뒤의 최저·최고 온도를 기억해요.
# 불쾌지수 = 0.81×온도 + 0.01×습도×(0.99×온도 − 14.3) + 46.3
# 68 미만 쾌적 / 75 미만 보통 / 80 미만 불쾌 / 그 이상 매우 불쾌 (보드 LED 는 75 이상에서 켜져요)
sensor = dht.DHT22(Pin(23))
led = Pin(2, Pin.OUT)
t_min = 100
t_max = -100
print('불쾌지수 측정 시작! 2초마다 갱신해요.')
show(0, 'Comfort index')

while True:
    try:
        sensor.measure()
        t = sensor.temperature()
        h = sensor.humidity()
        if t < t_min:
            t_min = t
        if t > t_max:
            t_max = t
        di = 0.81 * t + 0.01 * h * (0.99 * t - 14.3) + 46.3
        if di < 68:
            level, text = '쾌적', 'Good'
        elif di < 75:
            level, text = '보통', 'So-so'
        elif di < 80:
            level, text = '불쾌', 'Hot'
        else:
            level, text = '매우 불쾌', 'Bad'
        led.value(1 if di >= 75 else 0)
        print('온도:', t, '/ 습도:', h, '/ 불쾌지수:', int(di), level, '/ 최저', t_min, '최고', t_max)
        show(0, 'T{} H{} DI{}'.format(round(t, 1), round(h, 1), int(di)))
        show(1, '{} {}-{}'.format(text, round(t_min, 1), round(t_max, 1)))
    except OSError:
        print('읽기 실패! 선(S → GPIO 23)을 확인하세요.')
        show(1, 'Read error')
    sleep_ms(2000)
