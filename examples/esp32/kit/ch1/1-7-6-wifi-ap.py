import network

ap = network.WLAN(network.AP_IF)
ap.active(True)
ap.config(essid='ESP32_Brixel', password='12345678')

print("AP 모드 시작!")
print(f"SSID: ESP32_Brixel")
print(f"IP: {ap.ifconfig()[0]}")
print("핸드폰/PC에서 'ESP32_Brixel' WiFi에 연결하세요")
