from machine import ADC
from machine import Pin
from machine import SoftI2C
from machine import PWM
from ssd1306 import SSD1306_I2C
from time import sleep

# 아날로그 입력 설정
touch = ADC(Pin(32))
touch.atten(ADC.ATTN_11DB)
touch.width(ADC.WIDTH_12BIT)

# OLED 설정 (128x64) 
i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
oled = SSD1306_I2C(128, 64, i2c)
# RGB LED 핀 설정(PWM 출력) 
r = PWM(Pin(12), freq=1000)
g = PWM(Pin(5), freq=1000)  
b = PWM(Pin(4), freq=1000)

# RGB LED 색상 설정 함수
def set_color(r_val, g_val, b_val):
    r.duty(r_val * 4)  # 0~255 → 0~1023
    g.duty(g_val * 4)
    b.duty(b_val * 4)

# 버튼 판별 함수
def get_button(value):
    if 500 < value < 800:  # [사이트판] 원고 152쪽 구간으로 고쳤어요(원본 1000~1200은 원고 139쪽 측정값과 맞지 않아요)
        return "Button 1"
    elif 1000 < value < 1700:  # [사이트판] 원본 2000~2500
        return "Button 2"
    elif 2000 < value < 2500:  # [사이트판] 원본 3500~4000
        return "Button 3"
    elif 3000 < value < 3500:  # [사이트판] 원본 4000~4200
        return "Button 4"
    else:
        return "No touch"

while True:
    val = touch.read()
    button = get_button(val)

    # OLED 출력
    oled.fill(0)
    oled.text("ADC: {}".format(val), 0, 0)
    oled.text("You pressed:", 0, 20)
    oled.text(button, 0, 40)
    oled.show()

    # RGB LED 색상 변경
    if button == "Button 1":
        set_color(255, 0, 0)     # 빨강
    elif button == "Button 2":
        set_color(0, 255, 0)     # 초록
    elif button == "Button 3":
        set_color(0, 0, 255)     # 파랑
    elif button == "Button 4":
        set_color(255, 255, 255) # 흰색
    else:
        set_color(0, 0, 0)       # 꺼짐
    sleep(0.3)
