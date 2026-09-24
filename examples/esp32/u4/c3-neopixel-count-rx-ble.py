# 보충 C3 보드 쪽(블루투스판): 받은 숫자만큼 네오픽셀 켜기
# 컴퓨터가 블루투스로 보낸 숫자(예: 3)를 받아 네오픽셀 링의 LED를 그 개수만큼 켜요. USB-UART 변환기(선) 없이 하는 판이에요.
# @lesson c3
# @tags 네오픽셀, 블루투스, BLE, 통신, 시나리오 F
# @part ble 12
# @part neopixel 23
import ESP32BLE
from machine import Pin
from neopixel import NeoPixel
from time import sleep_ms

NUM_OF_LED = 16
COLOR = (0, 60, 90)  # (빨강, 초록, 파랑) — 0~255

np = NeoPixel(Pin(23), NUM_OF_LED)
# 교실에서는 뒤 번호를 내 자리 번호로 바꿔요(예: ESP32-12). 이름·학번은 쓰지 않아요.
ble = ESP32BLE.init("ESP32-07")


def show(count):
    """앞에서부터 count개만 켜고 나머지는 꺼요."""
    for i in range(NUM_OF_LED):
        np[i] = COLOR if i < count else (0, 0, 0)
    np.write()  # 정한 색을 링으로 보내요. 이 줄이 없으면 아무것도 안 바뀌어요.


show(0)
print("기다리는 중… 블루투스로 연결하고 숫자를 보내요.")

while True:
    text = ble.read()  # 받은 글자(끝의 줄바꿈은 떼어져 있어요). 새로 온 것이 없으면 None
    if text is None:
        sleep_ms(50)
        continue
    if text.isdigit():
        count = min(int(text), NUM_OF_LED)  # 링보다 많이 켤 수는 없어요.
        show(count)
        print("LED {}개를 켰어요".format(count))
    else:
        print("숫자가 아니라서 그냥 두었어요:", text)

# ── 실습 방법 ──
# 1. [실행]을 눌러요. 링이 모두 꺼진 채로 기다리고, 보드 안 블루투스 표시등이 깜빡여요(아직 연결 전).
# 2. 보드 아래 "블루투스(BLE) 조작" 칸에서 [연결]을 누르고, [보낼 글자]에 3을 적어 [보내기]를 눌러 봐요. LED 3개가 켜져요.
# 3. 영상처리 실습실에서 짝 예제(손가락 개수 보내기)를 열고 [보내기] 패널로 이 화면을 열면, 가상 보드도 블루투스로 숫자를 받아요. 실물 보드라면 통로를 "블루투스(실제 보드)"로 골라요. 코드는 그대로예요.
# ── 바꿔볼 것 3가지 ──
# 1. ESP32BLE.init("ESP32-07")의 번호를 내 자리 번호로 바꿔 봐요. 조작 칸과 연결 창에 보이는 보드 이름이 바뀌어요.
# 2. COLOR를 (0, 90, 0)으로 바꿔 초록 링으로 만들어 봐요.
# 3. sleep_ms(50)을 sleep_ms(2000)으로 바꾸고, 조작 칸에서 3과 5를 빠르게 이어 보내 봐요. 콘솔에는 LED 5개만 찍혀요.
# ── 왜 이런 결과가 나올까 ──
# ESP32BLE.read()는 받은 글자를 한 칸에 담아 두었다가 줘요. 새 글자가 오면 앞 글자를 덮어써요.
# 손가락 개수처럼 "지금 값"은 마지막 값만 뜻이 있어서 덮어써도 괜찮아요. 클릭처럼 한 번 일어난 일은 사라질 수 있어요.
# 컴퓨터 쪽 코드는 UART판과 한 글자도 다르지 않아요. 무엇으로 보낼지는 [보내기] 패널의 통로가 정해요.
