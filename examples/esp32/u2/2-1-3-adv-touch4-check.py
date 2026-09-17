from machine import ADC, Pin
from time import sleep

# SIG 핀을 아날로그 입력으로 설정
touch = ADC(Pin(32))
touch.atten(ADC.ATTN_11DB)  # 최대 전압 3.3V
touch.width(ADC.WIDTH_12BIT)  # 0~4095 범위

# 버튼별 전압 범위 설정
def get_button(value):
    if 500 < value < 1200:
        return "Button 1"
    elif 1000 < value < 2500:
        return "Button 2"
    elif 2000 < value < 4000:
        return "Button 3"
    elif 3000 < value < 4200:
        return "Button 4"
    else:
        return "No touch"

while True:
    val = touch.read()
    button = get_button(val)
    print(f"ADC: {val} → {button}")
    sleep(0.2)

