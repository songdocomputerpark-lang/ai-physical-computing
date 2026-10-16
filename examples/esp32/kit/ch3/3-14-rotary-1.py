# 로터리 인코더를 돌리면 위치(0~19)가 바뀌고, 누르면 '눌렸어요'가 나와요.
# SA → GPIO 23, SB → GPIO 25, SW(누름) → GPIO 26. 위치는 LCD 와 출력 창에 같이 나와요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from rotary_irq import RotaryIRQ
from time import sleep_ms

rotary = RotaryIRQ(pin_num_clk=23, pin_num_dt=25, min_val=0, max_val=19,
                   reverse=True, range_mode=RotaryIRQ.RANGE_WRAP)
push = Pin(26, Pin.IN)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
last = rotary.value()
print('로터리 인코더 테스트 시작 (SA 23, SB 25, SW 26)')
print('현재 위치:', last)
show(0, 'Rotary encoder')
show(1, 'Position: {}'.format(last))

while True:
    now = rotary.value()
    if now != last:
        last = now
        print('위치:', now)
        show(1, 'Position: {}'.format(now))
    if push.value() == 1:
        print('손잡이를 눌렀어요!')
        show(0, 'PUSHED!')
        sleep_ms(300)
        show(0, 'Rotary encoder')
    sleep_ms(10)
