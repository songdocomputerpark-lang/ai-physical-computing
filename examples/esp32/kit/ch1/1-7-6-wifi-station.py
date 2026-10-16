import network
import time

sta = network.WLAN(network.STA_IF)
sta.active(True)

# ★ 아래 SSID와 비밀번호를 본인 공유기 정보로 변경하세요
sta.connect('YOUR_SSID', 'YOUR_PASSWORD')

# 연결 대기 (최대 10초)
timeout = 10
while not sta.isconnected() and timeout > 0:
    print(f"연결 중... ({timeout}초 남음)")
    time.sleep(1)
    timeout -= 1

if sta.isconnected():
    ip = sta.ifconfig()[0]
    print(f"WiFi 연결 성공! IP: {ip}")
else:
    print("WiFi 연결 실패 - SSID/비밀번호를 확인하세요")
