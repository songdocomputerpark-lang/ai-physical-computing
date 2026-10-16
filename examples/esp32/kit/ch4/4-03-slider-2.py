# 슬라이더를 밀면 0~4 의 5단계로 바꿔서 알려 줘요. 단계가 높을수록 내장 LED(GPIO 2)가 빨리 깜빡여요.
# 0단계는 LED 가 꺼져 있어요. 단계와 막대는 LCD 에도 나와요. 배선은 1단계와 같아요.
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

slider = ADC(Pin(32))
slider.atten(ADC.ATTN_11DB)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
level = -1
last_blink = ticks_ms()
print('슬라이더를 밀어 보세요 (0~4단계)')
show(0, 'Slider level')

while True:
    v = slider.read()
    new_level = v * 5 // 4096
    show(1, 'L{} {} {}'.format(new_level, '#' * new_level, v))
    if new_level != level:
        level = new_level
        print('단계:', level, ' ', '#' * level, ' (값', v, ')')
    if level == 0:
        led.value(0)
    else:
        wait = 600 - level * 120      # 단계가 클수록 짧은 간격
        if ticks_diff(ticks_ms(), last_blink) > wait:
            led.value(not led.value())
            last_blink = ticks_ms()
    sleep_ms(50)
