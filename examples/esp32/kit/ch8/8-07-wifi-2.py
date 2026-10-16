# WiFi 심화 예제: 우리 집(교실) 공유기에 접속하고, 받은 IP 주소를 출력합니다.
# 모듈 TX → GPIO 25, RX → GPIO 26
from time import sleep_ms
from gorillacell_wifi import GORILLACELL_WIFI

# ★★★ 여기를 내 와이파이 이름과 비밀번호로 바꾸세요 ★★★
SSID = 'my_wifi_name'
PASSWORD = 'my_wifi_password'
# ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

wifi = GORILLACELL_WIFI()
print('공유기에 접속하는 중... (몇 초 걸려요. 비밀번호가 틀리면 계속 기다려요)')
wifi.sta_init(SSID, PASSWORD)    # 접속에 성공하면 다음 줄로 넘어가요
print('접속 성공!')
wifi.cifsr()                      # IP 주소 물어보기
sleep_ms(500)
print(wifi.decode())
print('위에서 STAIP 뒤의 숫자가 이 모듈의 IP 주소예요.')
