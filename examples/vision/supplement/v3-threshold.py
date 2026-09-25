# 보충 V3: 임계값으로 나누기(흰색과 검은색)
# 회색 사진의 픽셀을 기준 밝기(임계값)와 비교해, 더 밝으면 흰색(255) 아니면 검은색(0)으로 나눠요.
# @lesson v3
# @tags 임계값, 이진화, threshold, 흑백
# 웹캠이나 샘플 입력으로 실행해요. 조절 패널의 threshold를 움직이면 다음 프레임부터 흰 부분이 달라져요.
import cv2

threshold = 128  # @slider 0 255 1 기준 밝기(이보다 밝으면 흰색)
invert = False  # @toggle 흰색과 검은색 뒤집기

cap = cv2.VideoCapture(0)  # 0번 카메라(웹캠)를 열어요.
last_setting = None  # 기준이 바뀔 때만 콘솔에 적으려고 기억해 둬요.
while cap.isOpened():
    ok, frame = cap.read()  # 사진 한 장(프레임)을 읽어요.
    if not ok:
        break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 밝기 숫자 한 장으로 바꿔요.
    kind = cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY  # 뒤집기: 밝으면 0, 어두우면 255
    _, binary = cv2.threshold(gray, threshold, 255, kind)  # 기준보다 밝은 픽셀 → 255, 나머지 → 0
    if (threshold, invert) != last_setting:  # 기준이 바뀌었을 때만 흰 픽셀 비율을 적어요(매 프레임 적으면 너무 많아요).
        white = cv2.countNonZero(binary)  # 흰 픽셀(0이 아닌 값) 수
        print(f"기준 {threshold}{' (뒤집기)' if invert else ''}: 흰 픽셀 {white * 100 // binary.size}%")
        last_setting = (threshold, invert)
    cv2.imshow("binary", binary)  # 흰색·검은색만 있는 사진
    cv2.imshow("gray", gray)  # 비교용 회색 사진
    if cv2.waitKey(1) & 0xFF == ord("q"):  # q 키를 누르면 끝내요.
        break

cap.release()
cv2.destroyAllWindows()

# ── 바꿔볼 것 3가지 ──
# 1. threshold를 60까지 내려 봐요. 어두운 곳까지 흰색이 되어 흰 부분이 크게 늘어요.
# 2. threshold를 200 넘게 올려 봐요. 아주 밝은 곳(전등, 흰 종이, 창문)만 흰색으로 남아요.
# 3. invert를 켜 봐요. 흰색과 검은색이 뒤바뀌어요. 어두운 물체를 흰 덩어리로 잡고 싶을 때 이렇게 써요.
# ── 왜 이런 결과가 나올까 ──
# 임계값 나누기는 픽셀마다 "기준보다 밝은가?"라는 질문 하나에 예(255) 또는 아니오(0)로 답하는 거예요. 그래서 결과에는 두 값만 있어요.
# 기준을 내리면 예라고 답하는 픽셀이 늘어 흰 부분이 커지고, 기준을 올리면 줄어요.
# 조명이 바뀌면 같은 물체의 밝기 숫자도 바뀌어서 알맞은 기준이 달라져요. 그래서 실제 프로그램은 기준을 자동으로 찾는 방법(cv2.THRESH_OTSU)이나 주변 밝기와 비교하는 방법(cv2.adaptiveThreshold)도 써요.
