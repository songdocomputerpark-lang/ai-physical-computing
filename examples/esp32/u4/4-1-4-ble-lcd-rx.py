import ESP32BLE
from machine import Pin, SoftI2C
from time import sleep
from i2c_lcd import I2cLcd

# ====== 블루투스 초기화 ======
ble = ESP32BLE.init("ESP32") 

# ====== LCD 설정 ======
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()
lcd.putstr("BLE Waiting...")

# ====== 전역 변수 ======
mouse_x = 0
mouse_y = 0

# ====== 메인 루프 ======
while True:
    data = ble.read()
    
    if data:
        try:
            # 수신 데이터 형식: "DATA,X좌표,Y좌표"
            parts = data.split(',')
            if len(parts) == 3 and parts[0] == "DATA":
                # X, Y 좌표 값을 파싱하여 변수에 저장
                mouse_x = int(parts[1])
                mouse_y = int(parts[2])
                
                # LCD에 좌표 값 출력
                lcd.clear()
                lcd.putstr(f"X:{mouse_x:<5} Y:{mouse_y:<5}")
        except:
            # 파싱 중 오류 발생 시 무시
            pass
            
    sleep(0.01) # 10ms 대기