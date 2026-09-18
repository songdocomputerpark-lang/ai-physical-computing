import serial 
import time

uart = serial.Serial("COM10", 115200)
time.sleep(2)  

while True:
    key = input("입력 (a, b, q): ").strip().lower()

    if key == 'a' or key == 'b':
        uart.write(key.encode('utf-8'))
        print(f"{key} 문자를 시리얼로 전송했습니다.")
        
    elif key == 'q':
        print("프로그램을 종료합니다.")
        break
    
    else:
        print("올바른 문자(a, b, q)를 입력해주세요.")

uart.close()

