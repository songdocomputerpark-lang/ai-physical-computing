# 이마에 센서를 가까이 대고 온도를 재서 정상/발열을 알려 주는 코드예요.
# 배선은 1단계와 같아요. (표면 온도라서 실제 체온보다 조금 낮게 나올 수 있어요)
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from mlx90614 import MLX90614
from time import sleep, sleep_ms

FEVER = 37.5     # 이 온도 이상이면 '열이 있어요'
WARM = 37.0      # 이 온도 이상이면 '조금 높아요'

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=100000)   # MLX90614 는 100kHz 까지만 돼요
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
sensor = MLX90614(i2c)
led = Pin(2, Pin.OUT)    # 보드 내장 LED

def read_avg(n=5):
    total = 0
    for i in range(n):
        total += sensor.read_object_temp()
        sleep_ms(100)
    return total / n

print('체온 체커 시작! 이마에 2~3cm 가까이 대 보세요.')
while True:
    temp = read_avg()
    if temp >= FEVER:
        state = '열이 있어요'
        text = 'FEVER!'
        led.on()
    elif temp >= WARM:
        state = '조금 높아요'
        text = 'WARM'
        led.off()
    else:
        state = '정상이에요'
        text = 'NORMAL'
        led.off()
    print('측정 온도:', '{:.1f}'.format(temp), '°C ->', state)
    show(0, 'Temp {:.1f} C'.format(temp))
    show(1, text)
    sleep(0.3)
