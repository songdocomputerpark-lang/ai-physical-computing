from machine import UART
from time import sleep

# UART2 설정 (권장: TX=GPIO17, RX=GPIO16)
uart = UART(2, baudrate=9600, tx=17, rx=16)

# 데이터 전송
uart.write('Hello from ESP32!\n')
print("전송 완료: Hello from ESP32!")

# 수신 대기 루프
while True:
    if uart.any() > 0:
        data = uart.read()
        msg = data.decode('utf-8')
        print(f"수신: {msg}")
        # 에코 응답
        uart.write(f"ECHO: {msg}\n")
    sleep(0.1)
