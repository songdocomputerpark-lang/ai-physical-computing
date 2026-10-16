# WiFi(ESP12E) 모듈 기본 동작 테스트: 'AT' 명령을 보내 모듈이 'OK' 라고 대답하는지 확인합니다.
# 모듈 TX → GPIO 25, RX → GPIO 26. 모듈의 스위치는 UART 쪽으로 두세요.
from time import sleep_ms
from gorillacell_wifi import GORILLACELL_WIFI

print('WiFi 모듈 테스트 시작 (모듈 TX → GPIO 25, RX → GPIO 26)')
wifi = GORILLACELL_WIFI()      # 115200 보드레이트, UART2
count = 0
while True:
    count += 1
    wifi.write('AT')
    sleep_ms(500)
    reply = wifi.decode().strip()
    if 'OK' in reply:
        print(count, '번째: 모듈이 대답했어요! →', reply.replace('\r\n', ' '))
    else:
        print(count, '번째: 대답이 없어요. 선과 스위치를 확인하세요.', reply)
    sleep_ms(1500)
