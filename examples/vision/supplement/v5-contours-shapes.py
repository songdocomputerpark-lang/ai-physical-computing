# 보충 V5: 윤곽선과 도형(꼭짓점 세기)
# 임계값으로 나눈 흑백 사진에서 흰 덩어리마다 윤곽선을 찾아 그리고, 윤곽선을 직선 몇 개로 단순화해 꼭짓점 수로 도형을 짐작해요.
# @lesson v5
# @tags 윤곽선, findContours, 도형, 꼭짓점, approxPolyDP
# 웹캠 앞에 밝은 종이나 물체를 두고 실행해 봐요. 샘플 입력의 도형(원·네모·삼각형)으로도 돼요.
import cv2

threshold = 128  # @slider 0 255 1 흰 덩어리로 볼 기준 밝기
min_area = 500  # @slider 0 20000 100 이보다 작은 덩어리는 무시(픽셀 수)
draw = "outline"  # 그리는 방식 @select outline box corners
GREEN = (0, 200, 0)  # OpenCV 색은 (파랑, 초록, 빨강) 순서
BLUE = (214, 91, 31)

cap = cv2.VideoCapture(0)  # 0번 카메라(웹캠)를 열어요.
last_count = -1  # 덩어리 수가 바뀔 때만 콘솔에 적으려고 기억해 둬요.
while cap.isOpened():
    ok, frame = cap.read()  # 사진 한 장(프레임)을 읽어요.
    if not ok:
        break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 밝기만 남겨요.
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)  # 잡티를 줄여 윤곽선이 매끈해지게 해요.
    _, binary = cv2.threshold(blurred, threshold, 255, cv2.THRESH_BINARY)  # 기준보다 밝으면 255, 아니면 0
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)  # 흰 덩어리마다 바깥 테두리 점 목록
    count = 0
    for contour in contours:
        if cv2.contourArea(contour) < min_area:  # 너무 작은 덩어리(잡티)는 건너뛰어요.
            continue
        count += 1
        if draw == "outline":
            cv2.drawContours(frame, [contour], -1, GREEN, 3)  # 윤곽선을 초록 선으로 그려요.
        elif draw == "box":
            x, y, w, h = cv2.boundingRect(contour)  # 윤곽선을 둘러싸는 네모
            cv2.rectangle(frame, (x, y), (x + w, y + h), BLUE, 3)
        else:  # "corners": 윤곽선을 직선 몇 개로 단순화하고 꼭짓점 수를 적어요.
            approx = cv2.approxPolyDP(contour, 0.03 * cv2.arcLength(contour, True), True)  # 둘레의 3%보다 작은 굴곡은 펴요.
            cv2.polylines(frame, [approx], True, GREEN, 3)
            x, y, w, h = cv2.boundingRect(contour)
            cv2.putText(frame, str(len(approx)), (x, max(y - 10, 24)), cv2.FONT_HERSHEY_SIMPLEX, 0.9, GREEN, 2, cv2.LINE_AA)
    if count != last_count:  # 덩어리 수가 바뀔 때만 콘솔에 적어요.
        print(f"찾은 덩어리 {count}개")
        last_count = count
    cv2.imshow("shapes", frame)  # 원본 위에 그린 결과
    cv2.imshow("binary", binary)  # 윤곽선을 찾은 흑백 사진
    if cv2.waitKey(1) & 0xFF == ord("q"):  # q 키를 누르면 끝내요.
        break

cap.release()
cv2.destroyAllWindows()

# ── 바꿔볼 것 3가지 ──
# 1. draw를 corners로 바꿔 봐요. 꼭짓점 수가 3이면 삼각형, 4면 네모, 8보다 크면 원에 가까운 도형이에요.
# 2. min_area를 5000 넘게 올려 봐요. 작은 덩어리가 사라지고 큰 물체만 남아요. 0으로 내리면 잡티까지 모두 그려져요.
# 3. threshold를 움직여 봐요. 흰 덩어리의 모양이 바뀌면 윤곽선과 꼭짓점 수도 함께 바뀌어요.
# ── 왜 이런 결과가 나올까 ──
# findContours는 흑백 사진에서 흰 픽셀 덩어리의 가장자리를 따라가며 점을 이어요. 그래서 먼저 임계값으로 흰 덩어리를 만들어야 해요.
# approxPolyDP는 둘레에 비해 작은 굴곡을 펴서 직선 몇 개로 바꿔요. 남은 꼭짓점 수가 도형의 힌트가 돼요.
# 원은 짧은 직선을 아주 많이 이어야 비슷해져서 꼭짓점 수가 많이 나와요. 조명이 고르지 않으면 덩어리가 갈라지거나 붙어 수가 달라져요.
