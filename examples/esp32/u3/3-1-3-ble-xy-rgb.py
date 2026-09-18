import ESP32BLE                # ESP32 보드에서 블루투스 기능을 사용하기 위한 라이브러리 불러오기
from machine import Pin         # 핀(Pin) 제어를 위한 라이브러리 (LED 같은 부품 제어용)
from time import sleep          # 일정 시간 멈추기(sleep)를 위한 라이브러리

# 블루투스 통신 초기화
ble = ESP32BLE.init("ESP32")    # ESP32를 블루투스 기기로 설정하고 이름을 "ESP32"로 지정

# r, g, b 핀 설정
r = Pin(25, Pin.OUT)            # 빨간 LED를 핀 27번에 연결 (출력 모드)
g = Pin(26, Pin.OUT)            # 초록 LED를 핀 32번에 연결 (출력 모드)
b = Pin(27, Pin.OUT)            # 파란 LED를 핀 33번에 연결 (출력 모드)

# LED 핀 배열
led = [r, g, b]                 # 리스트로 묶어서 led[0]=빨강, led[1]=초록, led[2]=파랑 으로 사용 가능

while True:                     # 무한 반복 (계속 실행)
    data = ble.read()           # 블루투스로 받은 데이터 읽기
    
    if data:                    # 데이터가 있으면 실행
        try:
            # 데이터 파싱 (쉼표로 구분된 값 받기)
            values = data.split(',')      # "120,80" 같은 데이터를 쉼표 기준으로 나눔 → ["120", "80"]
            finger_x = int(values[0])     # 첫 번째 값(문자열)을 정수로 변환 → finger_x
            finger_y = int(values[1])     # 두 번째 값(문자열)을 정수로 변환 → finger_y
            
            # 받은 값 확인용 출력 (디버깅용)
            print(f"Received finger_x: {finger_x}, finger_y: {finger_y}")  
            

            # 조건에 따라 LED 제어
            if finger_x < 100:            # x 값이 100보다 작으면
                led[0].on()               # 빨간 LED 켜기
                sleep(1)                  # 1초 기다리기
                led[0].off()              # 빨간 LED 끄기
                sleep(1)                  # 1초 기다리기
            elif finger_y < 100:          # x는 아니고 y 값이 100보다 작으면
                led[1].on()               # 초록 LED 켜기
                sleep(1)                  
                led[1].off()              # 초록 LED 끄기
                sleep(1)
            else:                         # 두 조건 다 아니면 (x ≥ 100, y ≥ 100)
                led[2].on()               # 파란 LED 켜기
                sleep(1)
                led[2].off()              # 파란 LED 끄기
                sleep(1)

        except Exception as e:            # 만약 데이터 처리 중 에러가 생기면
            print(f"Error processing data: {data}, Error: {e}")  # 에러 메시지 출력
    else:
        # 블루투스로 받은 데이터가 없으면
        led[0].off()            # 빨간 LED 끄기
        led[1].off()            # 초록 LED 끄기
        led[2].off()            # 파란 LED 끄기
        sleep(1)                # 1초 기다리기
