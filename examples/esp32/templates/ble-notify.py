# 통신 템플릿 2: 블루투스 알림 — 보드가 컴퓨터로 값을 보내기
# 1초마다 센 숫자를 블루투스로 보내고, 컴퓨터가 보낸 명령도 함께 받아요. 보내는 글 끝에는 줄바꿈이 한 개 붙어요.
# @lesson 3-1-3
# @tags 블루투스, BLE, 알림, 통신, 템플릿
# @part ble 12
import ESP32BLE
from machine import Pin
from time import sleep

# 교실에서는 보드마다 다른 번호를 붙여요. 이름·학번처럼 나를 알아볼 수 있는 말은 넣지 않아요.
BLE_NAME = "ESP32-01"

ble = ESP32BLE.init(BLE_NAME)
led = Pin(2, Pin.OUT)  # 내장 LED: 값을 보낼 때마다 켜짐·꺼짐이 바뀌어요.
count = 0
warned = False  # 같은 안내를 1초마다 되풀이하지 않으려고 기억해 둬요.


def send(text):
    """연결된 기기가 있을 때만 보내요. 아직 없으면 한 번만 알려 줘요."""
    global warned
    try:
        ble.send(text)
        warned = False
    except OSError:  # 연결이 없으면 보드가 OSError(ENOTCONN)를 내요.
        if not warned:
            print("아직 연결된 기기가 없어요. 컴퓨터·스마트폰에서 [연결]을 누르면 보내져요.")
            warned = True


while True:
    data = ble.read()  # 컴퓨터가 보낸 한 줄(없으면 None)
    if data:
        print("받음:", data)
    count = count + 1
    # 보내는 글은 "COUNT,7"처럼 20바이트 안쪽으로. ESP32BLE.send()가 끝에 줄바꿈(\n)을 붙여 줘요.
    send("COUNT," + str(count))
    led.value(not led.value())
    sleep(1)

# ── 실습 방법 ──
# 1. [실행]을 눌러요. 보드가 "ESP32-01"이라는 이름으로 자기를 알리기 시작해요(광고).
# 2. 컴퓨터 쪽 화면에서 [블루투스 연결]을 누르고 목록에서 ESP32-01을 골라요.
# 3. 컴퓨터 화면에 COUNT,1 COUNT,2 …가 1초마다 올라오면 성공이에요. 내장 LED도 함께 깜빡여요.
# 4. 컴퓨터에서 글자를 보내면 콘솔에 "받음: …"이 나와요.
# ── 바꿔볼 것 3가지 ──
# 1. BLE_NAME을 "ESP32-02"로 바꿔 봐요. 연결 창의 이름이 바뀌어요(교실에서 내 보드를 찾는 방법이에요).
# 2. sleep(1)을 sleep(0.1)로 바꿔 봐요. 1초에 10번까지가 규칙이에요 — 더 자주 보내면 받는 쪽이 밀려요.
# 3. send("COUNT," + str(count))를 send(str(count))로 바꿔 봐요. 받는 쪽이 무엇을 보고 값을 알아보는지 생각해 봐요.
# ── 왜 이런 결과가 나올까 ──
# 블루투스(BLE)는 한 번에 보낼 수 있는 크기가 기본 20바이트예요. 그래서 짧은 글 한 줄을 규칙으로 정해 두고 주고받아요.
# 끝에 붙는 줄바꿈(\n)은 "여기까지가 한 메시지"라는 표시예요. 받는 쪽은 strip()으로 그 표시를 떼고 내용만 봐요.
# 보드가 보내는 쪽(알림, notify)이고 컴퓨터가 받는 쪽이에요. 반대로 컴퓨터가 보낸 글은 ble.read()로 한 번만 꺼낼 수 있어요 —
# 꺼내고 나면 그 값은 지워지고, 읽기 전에 새 값이 오면 앞의 값은 덮어써져요(실물 보드와 같아요).
