# 보충 C3 보드 쪽: 받은 숫자만큼 네오픽셀 켜기
# 컴퓨터가 보낸 숫자 한 줄(예: 3)을 받아, 네오픽셀 링의 LED를 그 개수만큼 켜요.
# @lesson c3
# @tags 네오픽셀, UART, 통신, 시나리오 F
# @part uart rx=17 tx=16
# @part neopixel 23
from machine import Pin, UART
from neopixel import NeoPixel

NUM_OF_LED = 16
COLOR = (0, 60, 90)  # (빨강, 초록, 파랑) — 0~255

np = NeoPixel(Pin(23), NUM_OF_LED)
# UART2: 보드 TX(17) → 변환기 RX, 보드 RX(16) ← 변환기 TX. 두 선은 서로 엇갈리게 이어요.
uart = UART(2, baudrate=9600, tx=17, rx=16, timeout=200)


def show(count):
    """앞에서부터 count개만 켜고 나머지는 꺼요."""
    for i in range(NUM_OF_LED):
        np[i] = COLOR if i < count else (0, 0, 0)
    np.write()  # 정한 색을 링으로 보내요. 이 줄이 없으면 아무것도 안 바뀌어요.


show(0)
print("기다리는 중… 컴퓨터 쪽 예제를 실행해요.")

while True:
    line = uart.readline()  # 줄바꿈(\n)까지 한 줄. 0.2초 동안 아무것도 안 오면 None
    if not line:
        continue
    try:
        text = line.decode().strip()
    except UnicodeError:
        print("글자가 깨져서 그냥 두었어요. 두 쪽의 속도(bps)가 같은지 봐요.")
        continue
    if text == "":
        continue
    if text.isdigit():
        count = min(int(text), NUM_OF_LED)  # 링보다 많이 켤 수는 없어요.
        show(count)
        print("LED {}개를 켰어요".format(count))
    else:
        print("숫자가 아니라서 그냥 두었어요:", text)

# ── 실습 방법 ──
# 1. [실행]을 눌러요. 링이 모두 꺼진 채로 글자가 오기를 기다려요(아직 아무 일도 없는 것이 정상이에요).
# 2. 보드 아래 "USB-UART 변환기 조작" 칸의 [보낼 글자]에 3을 적고 [보내기]를 눌러 봐요. LED 3개가 켜지면 선이 잘 이어진 거예요.
# 3. 영상처리 실습실에서 짝 예제 "보충 C3 컴퓨터 쪽: 편 손가락 개수를 세어 보드로 보내기"를 실행하고 손가락을 펴 봐요. 편 손가락 수만큼 켜지면 성공이에요.
# ── 바꿔볼 것 3가지 ──
# 1. COLOR를 (90, 0, 0)으로 바꿔 빨간 링으로 만들어 봐요.
# 2. show()의 i < count를 i >= NUM_OF_LED - count로 바꿔 반대쪽부터 켜 봐요.
# 3. 조작 칸의 [보낼 글자]로 a와 20을 보내 봐요. 숫자가 아니면 링을 그대로 두고, 16보다 크면 16개만 켜지는지 콘솔과 링으로 확인해요.
# ── 왜 이런 결과가 나올까 ──
# UART는 바이트를 하나씩 보내요. 그래서 끝에 줄바꿈(\n)을 붙여 "여기까지가 한 메시지"라고 알려 줘요.
# readline()은 그 줄바꿈이 올 때까지 기다렸다가 한 줄을 줘요. 숫자인지 먼저 확인하는 것은 통신으로는 엉뚱한 글자도 올 수 있기 때문이에요.
# 두 쪽의 속도(bps)가 다르면 바이트가 깨져서 글자로 읽을 수 없어요 — 그래서 decode()를 try로 감쌌어요.
# 네오픽셀은 np[번호]로 색을 정하기만 해서는 바뀌지 않고, np.write()를 불러야 링으로 색이 나가요.
