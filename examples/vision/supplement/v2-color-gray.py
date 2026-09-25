# 보충 V2: 색공간과 흑백(채널 나눠 보기)
# 컬러 프레임을 파랑·초록·빨강 채널로 따로 보고, 회색(흑백)으로 바꾸면 숫자 3개가 하나로 합쳐지는 것을 확인해요.
# @lesson v2
# @tags 색공간, BGR, RGB, 채널, 회색
# 웹캠이나 샘플 입력으로 실행해요. 조절 패널의 mode를 바꾸면 다음 프레임부터 화면이 달라져요.
import cv2
import numpy as np

mode = "gray"  # 보여 줄 방식 @select gray blue green red swap
show_values = True  # @toggle 가운데 픽셀의 숫자를 화면에 적기

cap = cv2.VideoCapture(0)  # 0번 카메라(웹캠)를 열어요.
printed = False
while cap.isOpened():
    ok, frame = cap.read()  # frame[세로, 가로]에는 (파랑, 초록, 빨강) 숫자 3개가 들어 있어요. OpenCV는 BGR 순서예요.
    if not ok:
        break
    blue, green, red = cv2.split(frame)  # 채널 3장으로 나눠요. 각각 0~255 숫자가 한 장씩이에요.
    zeros = np.zeros_like(blue)  # 다른 채널을 0으로 채울 빈 판
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 숫자 3개를 밝기 숫자 1개로 합쳐요(초록에 가장 큰 비중).
    if mode == "gray":
        shown = gray
    elif mode == "blue":
        shown = cv2.merge([blue, zeros, zeros])  # 파랑 채널만 남기고 초록·빨강은 0
    elif mode == "green":
        shown = cv2.merge([zeros, green, zeros])
    elif mode == "red":
        shown = cv2.merge([zeros, zeros, red])
    else:  # "swap": 파랑과 빨강 자리를 맞바꿔요. RGB 순서 사진을 BGR로 잘못 보여 줄 때 나는 색이에요.
        shown = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    height, width = frame.shape[:2]
    cy, cx = height // 2, width // 2  # 가운데 픽셀의 자리
    b, g, r = frame[cy, cx]  # 가운데 픽셀의 색 숫자 3개
    v = gray[cy, cx]  # 같은 픽셀의 밝기 숫자 1개
    if not printed:  # 처음 한 번만 콘솔에 적어요.
        print(f"가운데 픽셀의 색 숫자: B={b} G={g} R={r} → 회색 밝기 {v}")
        printed = True
    if show_values:
        if shown.ndim == 2:  # 회색 사진에도 색 글자를 적을 수 있게 3채널로
            shown = cv2.cvtColor(shown, cv2.COLOR_GRAY2BGR)
        cv2.drawMarker(shown, (cx, cy), (255, 255, 255), cv2.MARKER_CROSS, 24, 2)  # 가운데 표시
        cv2.putText(shown, f"B={b} G={g} R={r} gray={v}", (12, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.imshow("result", shown)  # 고른 방식으로 바꾼 사진
    if cv2.waitKey(1) & 0xFF == ord("q"):  # q 키를 누르면 끝내요.
        break

cap.release()
cv2.destroyAllWindows()

# ── 바꿔볼 것 3가지 ──
# 1. mode를 blue, green, red로 바꿔 봐요. 파란 물체는 blue에서만 밝게, red에서는 어둡게 나와요.
# 2. mode를 swap으로 바꿔 봐요. 파란 것은 주황이나 빨강으로, 빨간 것은 파랑으로 뒤바뀌어요. 숫자는 그대로인데 읽는 순서만 달라진 거예요.
# 3. 20행을 gray = ((blue.astype(int) + green + red) // 3).astype("uint8")로 바꿔 봐요. 세 채널을 똑같이 평균해도 회색이 되지만 OpenCV 방식과 조금 달라요.
# ── 왜 이런 결과가 나올까 ──
# 컬러 픽셀 하나에는 파랑, 초록, 빨강 빛의 세기가 숫자 3개로 들어 있어요. 채널 하나만 남기면 그 색 빛이 얼마나 센지가 밝기로 보여요.
# 회색으로 바꾸는 계산은 0.114×B + 0.587×G + 0.299×R이에요. 사람 눈이 초록에 가장 민감해서 초록에 가장 큰 비중을 둬요.
# OpenCV는 BGR, 다른 많은 프로그램(MediaPipe 등)은 RGB 순서를 써요. 순서를 잘못 읽으면 숫자는 같아도 파랑과 빨강이 뒤바뀐 색으로 보여요.
