import ESP32BLE
from machine import Pin, SoftI2C
from time import sleep
from i2c_lcd import I2cLcd
from mg90s_servo import MG90S_SERVO, map 

# ====== 초기화 ======
ble = ESP32BLE.init("ESP32") 

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()
lcd.putstr("BLE Waiting...")

# 서보모터 객체 생성 (X축: 25번핀, Y축: 26번핀)
servo_x = MG90S_SERVO(signal_pin=25)
servo_y = MG90S_SERVO(signal_pin=26)

# RGB LED 핀 설정 (R: 27, G: 32, B: 33)
led_r = Pin(27, Pin.OUT)
led_g = Pin(32, Pin.OUT)
led_b = Pin(33, Pin.OUT)

# 변수 초기화
mouse_x, mouse_y = 0, 0
d_c, r_c = 0, 0

while True:
    data = ble.read()
    
    if data:
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
                angle_x = map(mouse_x, 0, 3840, 0, 180)
                angle_y = map(mouse_y, 0, 2160, 0, 180)
                servo_x.rotate(angle_x)
                servo_y.rotate(angle_y)

                # 4. RGB LED 제어
                # d_c 값이 1이면 녹색, r_c 값이 1이면 파란색 LED를 켭니다.
                if d_c == 1:
                    led_r.value(0)
                    led_g.value(1) # 녹색 ON
                    led_b.value(0)
                elif r_c == 1:
                    led_r.value(0)
                    led_g.value(0)
                    led_b.value(1) # 파란색 ON
                else:
                    # d_c와 r_c가 모두 1이 아니면 LED를 끈다.
                    led_r.value(0)
                    led_g.value(0)
                    led_b.value(0)

        except:
            # 파싱 중 오류 발생 시 무시
            pass
            
    sleep(0.01) # 10ms 대기
