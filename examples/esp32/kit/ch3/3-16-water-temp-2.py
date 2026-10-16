# 재는 동안 가장 낮은/높은 온도를 기억하고, 목표 온도가 되면 알려 주는 코드예요.
# 배선은 1단계와 같아요.
import machine
import onewire
import ds18x20
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

TARGET = 30.0    # 이 온도 이상이면 LED 가 켜져요 (바꿔 보세요)

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
ds = ds18x20.DS18X20(onewire.OneWire(Pin(23)))
roms = ds.scan()
led = Pin(2, Pin.OUT)    # 보드 내장 LED

low = 100.0
high = -100.0
print('온도 기록 시작! 목표', TARGET, '°C')
if not roms:
    print('센서를 찾지 못했어요. 배선을 확인하세요.')
    show(0, 'No sensor')
while roms:
    ds.convert_temp()
    sleep_ms(750)
    temp = ds.read_temp(roms[0])
    low = min(low, temp)
    high = max(high, temp)
    if temp >= TARGET:
        led.on()
        msg = '목표 도달!'
        tag = ' HOT!'
    else:
        led.off()
        msg = '아직 낮아요'
        tag = ''
    print('지금', '{:.1f}'.format(temp), '최저', '{:.1f}'.format(low), '최고', '{:.1f}'.format(high), msg)
    show(0, 'Now {:.1f}C{}'.format(temp, tag))
    show(1, 'Min{:.1f} Max{:.1f}'.format(low, high))
