from machine import ADC, Pin, UART
from time import sleep

# UART 설정 (DFPlayer Mini)
uart = UART(2, baudrate=9600, \
            tx=Pin(17), rx=Pin(16))

# ADC 입력 설정 
adc = ADC(Pin(32))
adc.atten(ADC.ATTN_11DB)       
adc.width(ADC.WIDTH_12BIT)     

# 트랙 번호 및 상태
track_num = 1
prev_button = 0  # 이전 버튼 상태

# DFPlayer 명령 전송 함수
def send_cmd(cmd, p1=0, p2=0):
    uart.write(bytearray(\
        [0x7E, 0xFF, 0x06, cmd, 0x00,\
         p1, p2, 0xEF]))
    
# n번 트랙 재생
def play_track(n):
    send_cmd(0x03, 0x00, n)
    
# 재생 중지
def stop_track():
    send_cmd(0x16)  

# 버튼 판별 함수
def get_button(adc_val):
    if 500 < adc_val < 800:
        return 1  # 다음곡 버튼
    elif 1200 < adc_val < 1700:
        return 2  # 정지 버튼
    else:
        return 0  

while True:
    val = adc.read()
    # 현재 아날로그 전압값 읽기
    print("ADC 값:", val)        
    btn = get_button(val)

    # 다음곡 버튼 눌림 감지
    if btn == 1 and prev_button == 0:
        track_num += 1
        if track_num > 3:
            track_num = 1
        print("▶ 다음 곡:", track_num)
        play_track(track_num)
        sleep(0.5)

    # 정지 버튼 눌림 감지
    if btn == 2 and prev_button == 0:
        print("⏹ 정지")
        stop_track()
        sleep(0.5)

    prev_button = btn
    sleep(0.1)
