# 버튼을 누른 횟수를 세어요. 짧게 누르면 +1, 1초 이상 길게 누르면 0으로 되돌려요.
# 눌릴 때마다 보드 내장 LED(GPIO 2)가 켜졌다 꺼지고, 횟수는 LCD 에도 보여요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

button = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
idle = button.value()      # 시작할 때 손을 떼고 있어야 해요
count = 0
pressed_at = 0
was_pressed = False
print('버튼 세기 시작 (길게 누르면 초기화)')
show(0, 'Press count')
show(1, 'Count: 0')

while True:
    is_pressed = (button.value() != idle)
    if is_pressed and not was_pressed:      # 막 눌렀을 때
        pressed_at = ticks_ms()
        led.value(not led.value())
    if was_pressed and not is_pressed:      # 막 뗐을 때
        if ticks_diff(ticks_ms(), pressed_at) > 1000:
            count = 0
            print('길게 눌러서 0으로 초기화!')
            show(0, 'Reset!')
        else:
            count += 1
            print('누른 횟수:', count)
            show(0, 'Press count')
        show(1, 'Count: {}'.format(count))
    was_pressed = is_pressed
    sleep_ms(30)
