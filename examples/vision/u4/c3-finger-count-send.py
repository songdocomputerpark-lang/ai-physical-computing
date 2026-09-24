# 보충 C3 컴퓨터 쪽: 편 손가락 개수를 세어 보드로 보내기
# 카메라에 보이는 손에서 편 손가락을 세어, 그 개수를 통신으로 보드에 보내요. 보드는 그 수만큼 네오픽셀을 켜요.
# @lesson c3
# @tags 손, 손가락 개수, 통신, 네오픽셀, 시나리오 F
import cv2
import mediapipe as mp
import bridge

mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(max_num_hands=2)

# 손가락마다 (뿌리 관절, 끝, 기준점) — 교안 계단 9(접힌 손가락 알아채기)와 같은 번호예요.
# 엄지는 소지 뿌리(17)에서, 나머지 네 손가락은 손목(0)에서 얼마나 먼지를 봐요.
COMPARE = [(2, 4, 17), (5, 8, 0), (9, 12, 0), (13, 16, 0), (17, 20, 0)]


def count_fingers(landmark):
    """손 하나에서 편 손가락 수를 세요(0~5)."""
    count = 0
    for mcp, tip, base in COMPARE:
        tip_dist = (landmark[base].x - landmark[tip].x) ** 2 + (landmark[base].y - landmark[tip].y) ** 2
        mcp_dist = (landmark[base].x - landmark[mcp].x) ** 2 + (landmark[base].y - landmark[mcp].y) ** 2
        if tip_dist > mcp_dist:  # 끝이 뿌리 관절보다 멀면 펴진 손가락이에요.
            count += 1
    return count


cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()
    if not ret:
        break
    frame = cv2.flip(frame, 1)  # 거울처럼 좌우를 뒤집어요.
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(image)

    total = 0
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            # 손마다 따로 세어 더해요. 손이 두 개면 0~10개가 돼요.
            total += count_fingers(hand_landmarks.landmark)
            mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

    bridge.send(str(total))  # 개수가 바뀔 때만 나가요. 어디로 보낼지(통로)는 [보내기] 패널에서 골라요.

    cv2.putText(frame, str(total), (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)
    cv2.imshow('Finger Count', frame)
    if cv2.waitKey(1) == 27:  # ESC
        break

cap.release()
cv2.destroyAllWindows()

# ── 실습 방법 ──
# 1. [보내기] 패널의 [한 화면에 가상 보드 열기]를 눌러요. 열린 ESP32 실습실의 편집칸이 짝 예제 "보충 C3 보드 쪽: 받은 숫자만큼 네오픽셀 켜기"인지 보고(아니면 예제 목록에서 불러와요) [실행]해요.
# 2. 이 화면의 [실행]을 눌러요. 카메라가 없으면 입력 소스를 "재생 입력"으로, 동작을 "손가락 0~5개 펴기"로 골라요.
# 3. 화면 왼쪽 위의 숫자만큼 가상 보드의 네오픽셀 링이 켜지면 성공이에요. ESC를 누르면 끝나요.
# ── 바꿔볼 것 3가지 ──
# 1. max_num_hands=2를 1로 바꾸고 재생 동작을 "두 손"으로 골라 봐요. 손이 두 개 보여도 한 손(5개)만 세요.
# 2. COMPARE 맨 앞의 (2, 4, 17)을 지워 봐요. 엄지를 세지 않아서 한 손에 최대 4개까지만 켜져요.
# 3. bridge.send(str(total))을 bridge.event(str(total))로 바꿔 봐요. 같은 값도 계속 보내서 콘솔의 Sent: 줄이 훨씬 빨리 늘어나요.
# ── 왜 이런 결과가 나올까 ──
# 손가락이 펴졌는지는 "끝이 기준점에서 얼마나 먼가"로 알아요. 접으면 끝이 손목 쪽으로 다가와 뿌리 관절보다 가까워져요.
# 교안 계단 9는 이 계산을 손 반복문 바깥에 두어서, 손이 두 개 보이면 마지막 손의 값만 남았어요. 여기서는 손마다 따로 세어 더해요.
# bridge.send()는 값이 바뀔 때만 보내요. 1초에 15장을 보면서도 통신은 손가락 수가 달라질 때만 일어나요.
# 보내는 글자는 "3"과 줄바꿈(\n) 두 바이트예요. 보드는 줄바꿈까지 한 줄로 읽어요.
