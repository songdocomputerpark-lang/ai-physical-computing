from machine import Pin
from machine import ADC
from neopixel import NeoPixel
from time import sleep

# NeoPixel 설정
NUM_OF_LED = 16
np = NeoPixel(Pin(23), NUM_OF_LED)

# 아날로그 터치 입력 설정
touch = ADC(Pin(32))
touch.atten(ADC.ATTN_11DB)   # 0~3.3V
touch.width(ADC.WIDTH_12BIT) # 0~4095

# 무드등 색상 정의
colors = {
    "Button 1": (255, 0, 0), # 빨강
    "Button 2": (0, 255, 0), # 초록
    "Button 3": (0, 0, 255), # 파랑
    "Button 4": (0, 0, 0)  # 꺼짐
}

# 네오픽셀 색상 적용 함수
def set_color(rgb):
    for i in range(NUM_OF_LED):
        np[i] = rgb
    np.write()

# 버튼 감지 함수 
def get_button(value):
    if 500 < value < 800:
        return "Button 1"
    elif 1000 < value < 1700:
        return "Button 2"
    elif 2000 < value < 2500:
        return "Button 3"
    elif 3000 < value < 3500:
        return "Button 4"
    else:
        return "None"

# 이전 상태 저장
prev_button = "None"

# --- 메인 루프 ---
while True:
    val = touch.read()
    button = get_button(val)

    if button != prev_button and button in colors:
        print(f"ADC: {val} → {button}")
        set_color(colors[button])
        prev_button = button
        sleep(0.2)  # debounce

    sleep(0.05)
