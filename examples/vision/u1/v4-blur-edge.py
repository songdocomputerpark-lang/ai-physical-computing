# 보충 V4: 흐리게 한 뒤 테두리(에지) 찾기
# 흐리게 하는 정도와 테두리로 볼 밝기 차이의 아래·위 기준을 따로 바꿔 보며 결과를 비교해요.
# @lesson v4
# @tags 에지, 블러, 회색, Canny
# 영상처리 실습실에서 웹캠이나 샘플 입력으로 실행해요. 줄 끝의 "# @slider 최소 최대 간격"은 조절 패널의 조절 막대가 돼요.
import cv2

# 흐리게 하는 정도: 홀수만 쓸 수 있어서 1부터 2씩 늘려요.
blur_size = 5  # @slider 1 31 2 흐리게 하는 정도(홀수)
# 테두리로 볼 밝기 차이의 아래 기준과 위 기준
low = 50  # @slider 0 255 1 아래 기준
high = 150  # @slider 0 255 1 위 기준

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

# ── 바꿔볼 것 3가지 ──
# 1. blur_size를 1과 21로 바꿔 봐요. 찾은 테두리가 많아지나요, 줄어드나요?
# 2. high를 300 가까이 올려 봐요. 아주 뚜렷한 테두리만 남아요.
# 3. low를 high와 같게 맞춰 봐요. 약한 테두리를 이어 주는 일이 없어져서 선이 끊겨요.
# ── 왜 이런 결과가 나올까 ──
# 흐리게 하면 픽셀 하나하나가 주변과 섞여 작은 잡티의 밝기 차이가 줄어요. 그래서 진짜 물체의 테두리가 더 잘 남아요.
# Canny는 밝기 차이가 high보다 크면 테두리로 확정하고, low보다 작으면 버려요. 그 사이 값은 확정된 테두리와 이어져 있을 때만 남겨요.
