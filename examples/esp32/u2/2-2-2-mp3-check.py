from machine import UART, Pin
from time import sleep

# DFPlayer 연결용 UART 설정
uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))

def send_cmd(cmd, p1=0, p2=0):
    command = bytearray(10)
    command[0] = 0x7E # 시작 바이트
    command[1] = 0xFF # 버전 정보
    command[2] = 0x06 # 명령어 길이(6바이트)
    command[3] = cmd  # 실행할 명령 코드
    command[4] = 0x00 # 피드백 설정 
    command[5] = p1 # 첫번째 매개변수
    command[6] = p2 # 두번째 매개변수
    command[7] = 0xEF # 종료 바이트

    uart.write(command) 

# MP3 재생 (001.mp3)
send_cmd(0x03, 0x00, 0x01)
sleep(5)
send_cmd(0x16)  # Stop

