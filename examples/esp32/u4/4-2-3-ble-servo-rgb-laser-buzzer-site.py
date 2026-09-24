import ESP32BLE
from machine import Pin, SoftI2C, PWM
from time import sleep
from i2c_lcd import I2cLcd
from mg90s_servo import MG90S_SERVO, map 

# BLE
ble = ESP32BLE.init("ESP32") 

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()
lcd.putstr("BLE Waiting...")

# 서보모터 (X: 25번, Y: 26번)
servo_x = MG90S_SERVO(signal_pin=25)
servo_y = MG90S_SERVO(signal_pin=26)

# RGB LED (R: 27, G: 32, B: 33)
led_r = Pin(27, Pin.OUT)
led_g = Pin(32, Pin.OUT)
led_b = Pin(33, Pin.OUT)

# 변수 초기화
mouse_x, mouse_y = 0, 0
d_c, r_c = 0, 0

# 레이저 모듈 (18번)
laser = Pin(18, Pin.OUT)

# 부저 (2번)
buzzer = PWM(Pin(2, Pin.OUT))
buzzer.duty(0) # 부저는 처음에는 꺼진 상태로 시작

# ====== 버저 함수 ======
def play_click_sound(buzzer_pwm):
    """경쾌한 클릭 효과음을 재생하는 함수"""
    try:
        # '도(523Hz)' 음을 0.075초 재생
        buzzer_pwm.freq(523)
        buzzer_pwm.duty(512) # 50% duty cycle
        sleep(0.075)
        
        # '솔(784Hz)' 음을 0.075초 재생
        buzzer_pwm.freq(784)
        sleep(0.075)
    finally:
        # 부저를 끈다
        buzzer_pwm.duty(0)

# ====== 메인 루프 ======
while True:
    data = ble.read()
    
    if data:
        # 데이터 수신 시 레이저 ON
        laser.value(1)
        
        try:
            # 수신 데이터 형식: "DATA,X좌표,Y좌표,더블클릭,우클릭"
            parts = data.split(',')
            if len(parts) == 5 and parts[0] == "DATA":
                # 1. 데이터 파싱
                mouse_x = int(parts[1])
                mouse_y = int(parts[2])
                d_c = int(parts[3])
                r_c = int(parts[4])
                
                # 2. LCD에 좌표 값 출력
                lcd.clear()
                lcd.setcursor(0, 0)
                lcd.putstr(f"X:{mouse_x:<5} Y:{mouse_y:<5}")
                lcd.setcursor(0, 1)
                lcd.putstr(f"d_c:{d_c:<5} r_c:{r_c:<5}")

                # 3. 서보모터 제어
                #X좌표 좌우반전 및 각도 축소
                angle_x = map(mouse_x, 3840, 0, 10, 170)
                angle_y = map(mouse_y, 0, 2160, 30, 90)
                servo_x.rotate(angle_x)
                servo_y.rotate(angle_y)

                # 4. RGB LED 및 부저 제어
                is_double_click = (d_c == 1)
                is_right_click = (r_c == 1)

                # LED 상태 설정 (더블클릭: 녹색, 우클릭: 파란색)
                led_g.value(is_double_click)
                led_b.value(is_right_click)
                led_r.value(0) # 빨간색은 사용하지 않음

                # 부저 상태 확인 및 재생
                if is_double_click or is_right_click:
                    play_click_sound(buzzer)

        except:
            # 파싱 중 오류 발생 시 무시
            pass
    else:  # [사이트판] 레이저 끄기 분기의 주석을 풀었어요(PD-23 — 실물 레이저가 계속 켜져 있지 않게)
        # 데이터 수신이 없으면 레이저 OFF
        laser.value(0)
            
    sleep(0.01) # 10ms 대기