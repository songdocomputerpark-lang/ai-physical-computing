# 로터리 인코더를 볼륨 다이얼처럼 써요. 돌리면 0~19 단계가 바뀌고 내장 LED(GPIO 2) 밝기가 달라져요.
# 단계는 LCD 에 막대로 보여요. 손잡이를 누르면 0으로 돌아가요. 배선은 1단계와 같아요.
from machine import Pin, PWM
from machine import SoftI2C
from i2c_lcd import I2cLcd
from rotary_irq import RotaryIRQ
from time import sleep_ms

rotary = RotaryIRQ(pin_num_clk=23, pin_num_dt=25, min_val=0, max_val=19,
                   reverse=True, range_mode=RotaryIRQ.RANGE_BOUNDED)
push = Pin(26, Pin.IN)
led = PWM(Pin(2), freq=1000)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
last = -1
print('볼륨 다이얼 시작 (돌리면 밝기, 누르면 0)')
show(0, 'Volume dial')

try:
    while True:
        if push.value() == 1:
            rotary.set(value=0)
            sleep_ms(200)
        now = rotary.value()
        if now != last:
            last = now
            led.duty_u16(now * 3449)               # 0 ~ 65531
            print('볼륨', now, ' ', '#' * now)
            show(1, '{:2d} {}'.format(now, '#' * (now * 13 // 19)))
        sleep_ms(10)
finally:
    led.deinit()
