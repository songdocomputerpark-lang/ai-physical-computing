# 보충 V4 틀 예제: 흐리게 한 뒤 테두리(에지) 찾기
# 영상처리 실습실(Phase 2)에서 웹캠이나 샘플 이미지로 실행해요.
# 줄 끝의 "# @slider 최소 최대 간격"은 실습실이 조절 막대로 바꿔 줘요(SPEC §6.1).
import cv2

# 흐리게 하는 정도: 홀수만 쓸 수 있어서 1부터 2씩 늘려요.
blur_size = 5  # @slider 1 31 2
# 테두리로 볼 밝기 차이의 아래 기준과 위 기준
low = 50  # @slider 0 255 1
high = 150  # @slider 0 255 1

cap = cv2.VideoCapture(0)  # 0번 카메라(웹캠)를 열어요.
while True:
    ok, frame = cap.read()  # 사진 한 장(프레임)을 읽어요.
    if not ok:  # 읽지 못하면 반복을 끝내요.
        break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 흑백으로 바꿔요.
    blurred = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)  # 흐리게 해요.
    edges = cv2.Canny(blurred, low, high)  # 밝기가 크게 바뀌는 곳을 찾아요.
    cv2.imshow("edges", edges)  # 결과를 화면에 보여 줘요.
    if cv2.waitKey(1) & 0xFF == ord("q"):  # q 키를 누르면 끝내요.
        break

cap.release()  # 카메라를 닫아요.
cv2.destroyAllWindows()  # 창을 모두 닫아요.
