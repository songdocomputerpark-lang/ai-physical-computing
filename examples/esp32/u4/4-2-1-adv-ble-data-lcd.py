import ESP32BLE
from machine import Pin, SoftI2C
from time import sleep
from i2c_lcd import I2cLcd

ble = ESP32BLE.init("ESP32") 

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()
lcd.putstr("BLE Waiting...")

mouse_x = 0
mouse_y = 0
d_c = 0
r_c = 0

# ====== 메인 루프 ======
while True:
    data = ble.read()
    
    if data:
        try:
            # 수신 데이터 형식: "DATA,X좌표,Y좌표"
            parts = data.split(',')
            if len(parts) == 5 and parts[0] == "DATA":
                # X, Y 좌표 값을 파싱하여 변수에 저장
                mouse_x = int(parts[1])
                mouse_y = int(parts[2])
                d_c = int(parts[3])
                r_c = int(parts[4])
                
                # LCD에 좌표 값 출력
                lcd.clear()
                lcd.setcursor(0, 0)
                lcd.putstr(f"X:{mouse_x:<5} Y:{mouse_y:<5}")
                lcd.setcursor(0, 1)
                lcd.putstr(f"d_c:{d_c:<5} r_c:{r_c:<5}")
        except:
            # 파싱 중 오류 발생 시 무시
            pass
            
    sleep(0.01) # 10ms 대기
