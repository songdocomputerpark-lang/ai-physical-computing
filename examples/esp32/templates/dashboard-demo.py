# 통신 템플릿 4: 대시보드와 주고받기 — 0~100 값을 보내고 스위치로 LED 켜기
# 보드가 0~100 사이를 오르내리는 값을 보내면 대시보드 그래프·게이지에 보이고, 대시보드 스위치가 보낸 on·off로 LED를 켜고 꺼요.
# @lesson c2
# @tags 대시보드, MQTT, 와이파이, 발행, 구독, 통신, 템플릿
from machine import Pin
from umqtt.simple import MQTTClient
import network
import time

# 우리 반 통신 접두어(무작위 12글자) — MQTT 칸의 [코드에 접두어 적기]를 누르면 채워져요.
# 실제 보드는 꼭 채워야 해요(비어 있으면 사이트가 실제 보드로 보내지 않아요). 가상 보드는 비워 둬도 사이트가 앞에 붙여 줘요.
PREFIX = ""
DEVICE = "esp32-01"  # 내 보드 번호(이름·학번은 넣지 않아요)
BASE = PREFIX + "/" + DEVICE if PREFIX else DEVICE
ALLOW = ("on", "off")  # 이 말만 받아요(허용 목록)

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
# 실제 보드는 교실 와이파이 이름·비밀번호로 바꿔요(가상 보드는 그대로 둬도 돼요).
# 편집칸 코드는 이 컴퓨터에 자동 저장되니, 실제 비밀번호를 적었으면 수업 뒤 [이 컴퓨터에서 내 기록 지우기]를 눌러요.
wlan.connect("classroom-wifi", "1234")
while not wlan.isconnected():  # 연결될 때까지 기다려요(실물도 곧바로 붙지 않아요)
    time.sleep(0.1)

led = Pin(2, Pin.OUT)  # 받은 명령으로 켜는 것은 LED 같은 표시 장치만


def on_message(topic, msg):
    if len(msg) > 20:
        print("무시했어요(너무 긴 메시지)")
        return
    try:
        text = msg.decode().strip()
    except Exception:
        print("무시했어요(글자로 바꿀 수 없어요)")  # 이상한 바이트가 와도 멈추지 않아요
        return
    if text not in ALLOW:
        print("무시했어요(허용 목록에 없어요):", text)
        return
    led.value(1 if text == "on" else 0)
    print("받음:", text)


client = MQTTClient(DEVICE, "broker.emqx.io")
client.set_callback(on_message)
client.connect()
client.subscribe(BASE + "/rx")
print("준비 끝")

value = 0
step = 5
while True:
    value = value + step
    if value >= 100 or value <= 0:
        step = -step
    client.publish(BASE + "/tx", str(value))  # 대시보드 그래프·게이지가 보는 값
    client.check_msg()
    time.sleep(0.3)

# ── 실습 방법 ──
# 1. 대시보드에서 [연결]을 누른 뒤 이 코드를 [실행]해요(대시보드의 [이 자리에서 가상 보드 열기]로 열었으면 그 안에서).
# 2. 대시보드 그래프·게이지에 0~100 사이 값이 들어오는지 봐요.
# 3. 대시보드 스위치를 누르면 보드의 LED(GPIO2)가 켜지고, 다시 누르면 꺼져요.
# 4. 실제 보드에 올릴 때는 MQTT 칸의 [코드에 접두어 적기]로 PREFIX 줄을 채우고 와이파이 이름·비밀번호를 바꿔요.
# ── 바꿔볼 것 3가지 ──
# 1. step을 10으로 바꾸면 그래프가 어떻게 달라지는지 봐요.
# 2. time.sleep(0.3)을 1로 바꾸고 그래프의 점 사이 간격을 견줘 봐요.
# 3. ALLOW에서 "off"를 빼고 스위치를 꺼 봐요. 콘솔에 무엇이 나오나요?
# ── 왜 이런 결과가 나올까 ──
# 보드는 BASE + "/tx" 토픽으로 값을 보내고(발행), 대시보드는 같은 접두어의 토픽을 받아(구독) 그래프에 그려요.
# 대시보드 스위치는 BASE + "/rx" 토픽으로 on·off를 보내고, 보드는 그 토픽을 받아 허용 목록에 있는 말일 때만 LED를 바꿔요.
# 공개 중계 서버는 누구나 보낼 수 있어서, 길이·글자·허용 목록을 차례로 보고 LED 같은 표시 장치만 움직여요.
