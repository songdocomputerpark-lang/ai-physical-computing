import ESP32BLE_LIB
from machine import Pin, SoftI2C, PWM
from time import sleep, ticks_ms
from i2c_lcd import I2cLcd
from mg90s_servo import MG90S_SERVO, map 

# 초기화
ble = ESP32BLE_LIB.init("ESP32") 
lcd = I2cLcd(SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000), 0x20, 2, 16)
servo_x = MG90S_SERVO(signal_pin=32)
servo_y = MG90S_SERVO(signal_pin=26)

# 핀 설정
leds = {'r': Pin(12, Pin.OUT), 'g': Pin(5, Pin.OUT), 'b': Pin(4, Pin.OUT)}
laser = Pin(27, Pin.OUT)
buzzer = PWM(Pin(2, Pin.OUT))
buzzer.duty(0)

# LED 타이머
led_timers = {'g': 0, 'b': 0}

def beep(freq, duration):
    """부저 울리기"""
    buzzer.freq(freq)
    buzzer.duty(512)
    sleep(duration)
    buzzer.duty(0)

def check_leds():
    """LED 1초 후 끄기"""
    now = ticks_ms()
    for color, start_time in led_timers.items():
        if start_time > 0 and now - start_time > 2000:
            leds[color].value(0)
            led_timers[color] = 0

# 메인 루프
lcd.clear()
lcd.putstr("BLE Waiting...")

while True:
    check_leds()  # LED 타이머 확인
    
    data = ble.read()
    if data:
        laser.value(1)  # 레이저 ON
        
        try:
            parts = data.split(',')
            if len(parts) == 5 and parts[0] == "DATA":
                # 데이터 파싱
                x, y = int(parts[1]), int(parts[2])
                d_click, r_click = int(parts[3]), int(parts[4])
                
                # LCD 표시
                lcd.clear()
                lcd.putstr(f"X:{x} Y:{y}")
                lcd.setcursor(0, 1)
                lcd.putstr("Double!" if d_click else "Right!" if r_click else "Moving...")
                
                # 서보 제어
                servo_x.rotate(map(x, 3840, 0, 10, 170))
                servo_y.rotate(map(y, 0, 2160, 90, 140))
                
                # 클릭 처리
                if d_click:
                    leds['g'].value(1)
                    led_timers['g'] = ticks_ms()
                    beep(523, 0.1)  # 높은음
                    beep(784, 0.1)  # 높은음
                    
                    
                if r_click:
                    leds['b'].value(1)
                    led_timers['b'] = ticks_ms()
                    beep(523, 0.1)  # 높은음
                    beep(392, 0.1)  # 낮은음
                    
        except:
            pass
    
    sleep(0.01)