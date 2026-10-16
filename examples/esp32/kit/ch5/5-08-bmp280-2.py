# 처음 있던 곳의 기압을 기준으로 얼마나 올라갔는지(내려갔는지) 재는 코드예요.
# 배선은 1단계와 같아요. 센서를 들고 계단을 오르내리거나 책상 위아래로 움직여 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from bmp280 import BMP280
from time import sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
bmp = BMP280(i2c)
led = Pin(2, Pin.OUT)    # 보드 내장 LED

def avg_pressure(n=10):
    total = 0
    for i in range(n):
        total += bmp.getPress()
        sleep_ms(50)
    return total / n

print('기준 기압을 재는 중... 센서를 가만히 두세요.')
show(0, 'Measuring base..')
base = avg_pressure(20)
print('기준 기압:', '{:.1f}'.format(base / 100), 'hPa')
while True:
    p = avg_pressure(5)
    height = 44330 * (1 - (p / base) ** (1 / 5.255))    # 처음보다 몇 m 높은지
    if height >= 0.5:
        msg = '올라갔어요'
        text = 'UP'
    elif height <= -0.5:
        msg = '내려갔어요'
        text = 'DOWN'
    else:
        msg = '비슷한 높이예요'
        text = 'SAME'
    led.value(1 if abs(height) >= 1 else 0)
    print('처음보다', '{:.2f}'.format(height), 'm', msg)
    show(0, 'Height {:.2f} m'.format(height))
    show(1, text)
