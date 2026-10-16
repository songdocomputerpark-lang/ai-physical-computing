# 센서 앞을 물건이 지나갈 때마다 1개씩 세어요. (컨베이어 벨트의 개수 세기, LCD 에도 보여 줘요)
# 물체가 있는 동안 내장 LED(GPIO 2)가 켜져요. 배선은 1단계와 같아요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

ir = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
count = 0
last = 0
since = 0
print('센서 앞으로 물건을 하나씩 지나가게 해 보세요')
show(0, 'Item counter')
show(1, 'Count: 0')

while True:
    v = ir.value()
    if v == 1 and last == 0:
        since = ticks_ms()
    if v == 0 and last == 1:
        ms = ticks_diff(ticks_ms(), since)
        if ms > 30:                      # 너무 짧은 잡음은 무시
            count += 1
            print('물건', count, '개째 지나갔어요 (가려진 시간', ms, '밀리초)')
            show(1, 'Count: {}'.format(count))
    last = v
    led.value(v)
    sleep_ms(5)
