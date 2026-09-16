# 첫 실습: 웹캠 영상에서 테두리(에지) 찾기
# 영상을 회색으로 바꾼 뒤, 밝기가 크게 바뀌는 곳만 흰 선으로 그려요.
# 카메라가 없으면 실습실이 직접 그린 샘플 입력을 대신 넣어 줘요.
# "# @slider 최소 최대 간격" 주석은 실습실이 조절 막대로 바꿔 줘요(다음 단계).
import cv2

threshold = 100  # @slider 0 255 1

cap = cv2.VideoCapture(0)  # 0번 카메라(웹캠)를 열어요.
while cap.isOpened():
    ok, frame = cap.read()  # 사진 한 장(프레임)을 읽어요.
    if not ok:  # 읽지 못하면 끝내요.
        break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 색을 빼고 밝기만 남겨요.
    edges = cv2.Canny(gray, threshold, threshold * 2)  # 테두리를 찾아요.
    cv2.imshow("edges", edges)  # 결과를 출력 화면에 보여 줘요.
    if cv2.waitKey(1) & 0xFF == ord("q"):  # q 키를 누르면 끝내요.
        break

cap.release()  # 카메라를 놓아줘요.
cv2.destroyAllWindows()  # 창을 모두 닫아요.
