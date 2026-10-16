# DS18B20 물 온도 센서로 온도를 재는 코드예요.
# 센서 S -> GPIO 23, LCD 는 I2C(SDA 21, SCL 22). 따뜻한 물에 센서 끝을 담가 보세요.
import machine
import onewire
import ds18x20
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
ds = ds18x20.DS18X20(onewire.OneWire(Pin(23)))
roms = ds.scan()

print('물 온도 센서 테스트 시작 (S -> GPIO 23)')
print('찾은 센서 개수:', len(roms))
show(0, 'Water Temp')
if not roms:
    print('센서를 찾지 못했어요. S 선이 GPIO 23 에 꽂혀 있는지 확인하세요.')
    show(1, 'No sensor')
while roms:
    ds.convert_temp()
    sleep_ms(750)
    for rom in roms:
        temp = ds.read_temp(rom)
        print('물 온도:', '{:.1f}'.format(temp), '°C')
        show(1, '{:.1f} C'.format(temp))
