# 온도의 최고값과 최저값을 기록하고, 30도를 넘는 상태가 3번 이어지면 '더위 경보'를 울려요.
# 경보가 울리면 내장 LED(GPIO 2)가 켜지고 LCD 에 HOT ALERT! 가 나와요. 센서를 손으로 감싸 따뜻하게 해 보세요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from dht import DHT11
from time import sleep

d = DHT11(Pin(23))
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
HOT = 30            # 이 온도(도)를 넘으면 더운 걸로 봐요
t_max = -100
t_min = 100
hot_count = 0
print('더위 경보기 시작 (기준', HOT, '도)')

while True:
    try:
        d.measure()
    except OSError:
        print('센서를 읽지 못했어요')
        show(1, 'Read error')
        sleep(2)
        continue
    t = d.temperature()
    if t > t_max:
        t_max = t
    if t < t_min:
        t_min = t
    if t > HOT:
        hot_count += 1
    else:
        hot_count = 0
    led.value(1 if hot_count >= 3 else 0)
    print('온도', t, '도 (최고', t_max, '/ 최저', t_min, ') 습도', d.humidity(), '%')
    show(0, 'T{} Max{} Min{}'.format(t, t_max, t_min))
    if hot_count >= 3:
        print('더위 경보! 너무 더워요')
        show(1, 'HOT ALERT!')
    else:
        show(1, 'Humi {}%'.format(d.humidity()))
    sleep(2)
