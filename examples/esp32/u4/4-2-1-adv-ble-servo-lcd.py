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
                # 수신된 좌표(3840*2160)를 서보 각도(0-180)로 매핑
                angle_x = map(mouse_x, 0, 3840, 0, 180)
                angle_y = map(mouse_y, 0, 2160, 0, 180)

                # 계산된 각도로 서보모터 회전
                servo_x.rotate(angle_x)
                servo_y.rotate(angle_y)

        except:
            # 파싱 중 오류 발생 시 무시
            pass
            
    sleep(0.01) # 10ms 대기