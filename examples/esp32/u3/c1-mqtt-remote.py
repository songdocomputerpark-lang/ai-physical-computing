# 보충 C1 친구 보드: 터치 센서로 친구 보드의 LED 켜고 끄기
# 터치 센서를 누를 때마다 친구 보드(esp32-01)에 on이나 off를 보내고(발행), 친구 보드가 보내는 숫자를 받아(구독) 콘솔에 적어요.
# @lesson c1
# @tags 와이파이, MQTT, 발행, 구독, 통신, 터치 센서
# @part touch-digital 17
import network
from umqtt.simple import MQTTClient
from machine import Pin
from time import sleep

WIFI_NAME = "my-wifi"  # 교실 와이파이 이름으로 바꿔요(가상 보드는 그대로 둬도 돼요).
WIFI_PASSWORD = "my-password"  # 실제 비밀번호를 적었으면 수업 뒤 [이 컴퓨터에서 내 기록 지우기]를 눌러요.
BROKER = "broker.emqx.io"  # 학습용 공개 중계 서버. 이름, 사진 같은 개인정보는 보내지 않아요.
PREFIX = ""  # 우리 반 통신 접두어. 실제 보드는 MQTT 칸의 [코드에 접두어 적기]로 꼭 채워요.
MY_NAME = "esp32-02"  # 내 보드 번호(이름이나 학번은 넣지 않아요)
FRIEND = "esp32-01"  # 친구 보드 번호 — 친구 보드 코드의 DEVICE와 같게 적어요.
BASE = PREFIX + "/" + FRIEND if PREFIX else FRIEND
TOPIC_COMMAND = BASE + "/rx"  # 친구 보드가 명령을 받는 토픽 → 내가 여기로 보내요(발행).
TOPIC_VALUE = BASE + "/tx"  # 친구 보드가 값을 보내는 토픽 → 내가 여기를 받아요(구독).

touch = Pin(17, Pin.IN)  # 터치 센서: 누르고 있는 동안 1
led_on = False  # 친구 LED를 켜라고 보냈는지 기억해요.
was_pressed = False  # 바로 앞 차례에 누르고 있었는지


def on_message(topic, payload):
    """구독한 토픽에 메시지가 오면 이 함수가 불려요."""
    print("친구 보드가 보낸 값:", payload.decode())


wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect(WIFI_NAME, WIFI_PASSWORD)
while not wlan.isconnected():  # 연결될 때까지 기다려요(실물도 곧바로 붙지 않아요).
    sleep(0.1)
print("와이파이 연결:", wlan.isconnected())

client = MQTTClient(MY_NAME, BROKER)
client.set_callback(on_message)
client.connect()
client.subscribe(TOPIC_VALUE)  # 친구 보드의 값을 받기로 해요(구독).
print("받기로 한 토픽:", TOPIC_VALUE)

while True:
    client.check_msg()  # 온 메시지가 있으면 on_message를 불러요(없으면 그냥 지나가요).
    pressed = touch.value() == 1
    if pressed and not was_pressed:  # 손가락이 닿는 순간에만
        led_on = not led_on
        command = "on" if led_on else "off"
        client.publish(TOPIC_COMMAND, command)  # 친구 보드에 명령을 보내요(발행).
        print("보냄:", TOPIC_COMMAND, command)
    was_pressed = pressed
    sleep(0.05)

# ── 실습 방법 ──
# 1. 친구 보드 예제(통신 템플릿 3: 와이파이 + MQTT)를 다른 화면에서 먼저 [실행]해요. 두 화면의 통신 접두어가 같아야 해요.
# 2. 이 보드도 [실행]해요. 콘솔에 "친구 보드가 보낸 값: 1, 2, 3…"이 1초마다 늘어나요.
# 3. 보드 아래 터치 센서를 한 번 누르면 친구 보드의 파란 LED(GPIO2)가 켜지고, 한 번 더 누르면 꺼져요.
# ── 바꿔볼 것 3가지 ──
# 1. command = "on" if led_on else "off"를 command = "blink"로 바꿔 봐요. 친구 LED가 1초마다 깜빡여요.
# 2. FRIEND를 "esp32-03"으로 바꿔 봐요. 아무도 그 토픽을 쓰지 않아 값도 안 오고, 친구 LED도 그대로예요.
# 3. TOPIC_VALUE를 BASE + "/#"로 바꿔 봐요. #은 "그 아래 토픽 모두"라는 뜻이라, 내가 보낸 on, off까지 콘솔에 함께 나와요.
# ── 왜 이런 결과가 나올까 ──
# 두 보드는 서로 직접 잇지 않고, 가운데의 중계 서버(브로커)를 거쳐 이야기해요. 보내는 쪽은 토픽 이름을 붙여 보내고(발행),
# 중계 서버는 그 토픽을 받기로 한(구독한) 쪽에만 전해 줘요. 그래서 토픽 이름이 한 글자라도 다르면 메시지가 닿지 않아요.
# 친구 보드는 esp32-01/rx를, 이 보드는 esp32-01/tx를 구독했어요. 한 보드가 보내기와 받기를 함께 할 수 있어요.
# 손가락이 닿는 순간만 알아내려고 "지금은 눌렀고, 바로 앞에는 안 눌렀다"를 봐요. 누르고 있는 동안 계속 보내지 않게 하려는 거예요.
