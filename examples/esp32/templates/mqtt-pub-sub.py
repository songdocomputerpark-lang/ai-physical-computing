# 통신 템플릿 3: 와이파이 + MQTT — 값을 보내고(발행) 명령을 받기(구독)
# 공개 브로커는 누구나 보고 누구나 보낼 수 있어요. 그래서 받는 쪽은 허용한 명령만, 20바이트까지만 받고 LED 표시만 해요.
# @lesson c1
# @tags 와이파이, MQTT, 발행, 구독, 통신, 템플릿
import network
from umqtt.simple import MQTTClient
from machine import Pin
from time import sleep

WIFI_NAME = "my-wifi"  # 교실 와이파이 이름으로 바꿔요.
# 와이파이 비밀번호로 바꿔요(가상 보드는 그대로 둬도 돼요). 편집칸 코드는 이 컴퓨터에 자동 저장되니,
# 실제 비밀번호를 적었으면 수업 뒤 [이 컴퓨터에서 내 기록 지우기]를 눌러요(다른 사람에게 알려 주지 않아요).
WIFI_PASSWORD = "my-password"
BROKER = "broker.emqx.io"  # 학습용 공개 브로커. 이름·사진 같은 개인정보는 절대 보내지 않아요.
# 우리 반 통신 접두어(무작위 12글자) — MQTT 칸의 [코드에 접두어 적기]를 누르면 채워져요.
# 실제 보드는 꼭 채워야 해요(비어 있으면 사이트가 실제 보드로 보내지 않아요). 가상 보드는 비워 둬도 사이트가 앞에 붙여 줘요.
PREFIX = ""
DEVICE = "esp32-01"  # 내 보드 번호(이름·학번은 넣지 않아요)
BASE = PREFIX + "/" + DEVICE if PREFIX else DEVICE  # 접두어가 있으면 "접두어/esp32-01", 없으면 "esp32-01"
TOPIC_RX = BASE + "/rx"  # 컴퓨터 → 보드(명령)
TOPIC_TX = BASE + "/tx"  # 보드 → 컴퓨터(값)
ALLOW = ("on", "off", "blink")  # 이 명령만 받아요 — 목록에 없는 메시지는 무시해요.
MAX_BYTES = 20  # 한 번에 받을 수 있는 크기(블루투스 기본 크기와 같게 맞췄어요)

led = Pin(2, Pin.OUT)  # 받은 명령으로 켜는 것은 LED·LCD 같은 표시 장치만. 레이저·모터는 잇지 않아요.
command = ""  # 마지막으로 받은 명령


def command_of(data):
    """받은 메시지에서 명령을 꺼내요. 너무 길거나 허용 목록에 없으면 빈 글자('')를 돌려줘요."""
    if len(data) > MAX_BYTES:
        return ""
    try:
        text = data.decode().strip()
    except Exception:
        return ""  # 글자로 바꿀 수 없는 값(이상한 바이트)은 받지 않아요.
    if text not in ALLOW:
        return ""
    return text


def on_message(topic, payload):
    """구독한 토픽에 메시지가 오면 이 함수가 불려요."""
    global command
    got = command_of(payload)
    if got == "":
        print("무시했어요(허용 목록에 없거나 너무 긴 메시지):", payload)
        return
    command = got
    print("받음:", command)


def wifi_connect(name, password):
    """와이파이에 연결해요(최대 10초 기다려요)."""
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        wlan.connect(name, password)
        for _ in range(20):
            if wlan.isconnected():
                break
            sleep(0.5)
    print("와이파이 연결:", wlan.isconnected())


wifi_connect(WIFI_NAME, WIFI_PASSWORD)

client = MQTTClient(DEVICE, BROKER, port=1883)
client.set_callback(on_message)
client.connect()
client.subscribe(TOPIC_RX)
print("MQTT 연결됨:", TOPIC_TX)

count = 0
while True:
    client.check_msg()  # 온 메시지가 있으면 on_message를 불러요(없으면 그냥 지나가요).
    if command == "on":
        led.on()
    elif command == "off":
        led.off()
    elif command == "blink":
        led.value(not led.value())
    count = count + 1
    client.publish(TOPIC_TX, str(count))  # 보드 → 컴퓨터(값)
    sleep(1)

# ── 실습 방법 ──
# 1. WIFI_NAME·WIFI_PASSWORD를 교실 와이파이 이름과 비밀번호로 바꿔요(가상 보드에서는 아무 값이나 괜찮아요).
# 2. [실행]을 눌러요. 콘솔에 "와이파이 연결: True"와 "MQTT 연결됨: esp32-01/tx"가 나오면 준비가 끝난 거예요.
# 3. 컴퓨터 쪽 화면(대시보드나 다른 탭)에서 같은 접두어로 연결하고 on을 보내면 LED가 켜지고, off를 보내면 꺼져요.
# 4. laser-on처럼 허용 목록에 없는 말을 보내면 콘솔에 "무시했어요…"가 나오고 아무 일도 일어나지 않아요.
# 5. 실제 보드에 올릴 때는 MQTT 칸의 [코드에 접두어 적기]를 눌러 PREFIX 줄을 채운 뒤 [실제 보드]에서 [실행]해요.
# ── 바꿔볼 것 3가지 ──
# 1. ALLOW에 "blink"만 남겨 보고 on을 보내 봐요. 허용 목록이 왜 필요한지 바로 알 수 있어요.
# 2. DEVICE를 "esp32-02"로 바꾸면 토픽이 달라져요. 친구 보드의 토픽으로 보내면 친구 LED가 켜지는지 확인해 봐요.
# 3. client.publish의 값을 str(count) 대신 "COUNT," + str(count)로 바꿔 보고, 대시보드에서 어떻게 보이는지 봐요.
# ── 왜 이런 결과가 나올까 ──
# MQTT는 브로커(중간 우체국)에 토픽 이름으로 메시지를 보내고, 같은 토픽을 구독한 사람이 그것을 받는 방식이에요.
# 토픽은 "esp32-01/tx"처럼 짧게 적지만, 가상 보드에서 실제로 나갈 때는 앞에 우리 반 접두어(무작위 12글자)가 붙어요(실제 보드는
# 코드에 적은 접두어가 붙어요). 공개 브로커는 온 세상이 함께 쓰는 곳이라, 접두어가 없으면 "esp32-01/tx"를 쓰는 다른 학교 메시지와 섞여요.
# 공개 브로커는 누구나 접속할 수 있어서 내 토픽 이름을 아는 사람은 누구든 메시지를 보낼 수 있어요.
# 그래서 받는 쪽에서 ① 길이를 먼저 보고 ② 허용 목록에 있는 말만 받아들여요. 이 두 줄이 없으면 모르는 사람이 보낸 글이
# 그대로 보드를 움직이게 돼요. 레이저·팬·서보처럼 움직이거나 위험한 장치는 공개 브로커에 잇지 않고, 같은 컴퓨터 탭 통로나
# USB·블루투스로만 이어요.
