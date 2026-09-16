# 첫 실습: 웹캠 영상에서 테두리(에지) 찾기
# 영상을 회색으로 바꾸고 살짝 흐리게 한 뒤, 밝기가 크게 바뀌는 곳만 흰 선으로 그려요.
# @tags 에지, 회색, 블러, Canny
# 카메라가 없으면 실습실이 직접 그린 샘플 입력을 대신 넣어 줘요.
# 줄 끝의 "# @slider 최소 최대 간격"은 오른쪽 아래 조절 패널의 조절 막대가 돼요. 실행 중에 움직이면 다음 프레임부터 바뀌어요.
import cv2

threshold = 100  # @slider 0 255 1 테두리로 볼 밝기 차이
blur_size = 5  # @slider 1 31 2 흐리게 하는 정도(홀수)

cap = cv2.VideoCapture(0)  # 0번 카메라(웹캠)를 열어요.
while cap.isOpened():
    ok, frame = cap.read()  # 사진 한 장(프레임)을 읽어요.
    if not ok:  # 읽지 못하면 끝내요.
        break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 색을 빼고 밝기만 남겨요.
    blurred = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)  # 살짝 흐리게 해서 잡티를 줄여요.
    edges = cv2.Canny(blurred, threshold, threshold * 2)  # 테두리를 찾아요.
    cv2.imshow("edges", edges)  # 결과를 출력 화면에 보여 줘요.
    if cv2.waitKey(1) & 0xFF == ord("q"):  # q 키를 누르면 끝내요.
        break

cap.release()  # 카메라를 놓아줘요.
cv2.destroyAllWindows()  # 창을 모두 닫아요.

# ── 바꿔볼 것 3가지 ──
# 1. threshold를 30까지 내려 봐요. 작은 밝기 차이도 테두리가 돼서 선이 훨씬 많아져요.
# 2. threshold를 200 넘게 올려 봐요. 아주 뚜렷한 테두리만 남고 나머지는 사라져요.
# 3. blur_size를 21로 키워 봐요. 잔 선이 사라지고 큰 윤곽만 남아요(값은 홀수만 돼요).
# ── 왜 이런 결과가 나올까 ──
# Canny는 픽셀마다 옆 픽셀과의 밝기 차이를 재요. 차이가 threshold * 2보다 크면 테두리로 확정하고, threshold보다 작으면 버려요.
# 그 사이에 있는 픽셀은 확정된 테두리와 이어져 있을 때만 남겨요. 그래서 threshold를 올리면 약한 선부터 사라져요.
# 흐리게 하면 잡티(노이즈)의 작은 밝기 차이가 줄어 가짜 테두리가 사라지고, 너무 흐리면 진짜 테두리도 약해져요.
