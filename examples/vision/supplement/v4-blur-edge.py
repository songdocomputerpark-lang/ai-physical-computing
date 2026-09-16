# 보충 V4: 블러와 에지(테두리 찾기)
# 사진을 먼저 살짝 흐리게(블러) 만들어 잡티를 줄인 뒤, 밝기가 크게 바뀌는 곳(에지)만 흰 선으로 남겨요.
# @lesson v4
# @tags 블러, 에지, Canny, GaussianBlur, 회색
# 시작하기의 첫 실습과 같은 원리예요. 여기서는 흐리게 하는 정도와 아래 기준(low)·위 기준(high)을 따로 움직여 비교해요.
import cv2

blur_size = 5  # @slider 1 31 2 흐리게 하는 정도(홀수만)
low = 50  # @slider 0 255 1 테두리 후보로 볼 밝기 차이의 아래 기준
high = 150  # @slider 0 255 1 테두리로 확정하는 위 기준

cap = cv2.VideoCapture(0)  # 0번 카메라(웹캠)를 열어요.
while cap.isOpened():
    ok, frame = cap.read()  # 사진 한 장(프레임)을 읽어요.
    if not ok:
        break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 색을 빼고 밝기만 남겨요.
    # 픽셀마다 주변 픽셀과 섞어 흐리게 해요(가운데 픽셀에 가장 큰 비중). 크기가 클수록 더 넓게 섞여 더 흐려져요.
    blurred = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)
    edges = cv2.Canny(blurred, low, high)  # 밝기 차이가 high보다 크면 테두리, low보다 작으면 버려요. 그 사이는 이어져 있을 때만 남겨요.
    cv2.imshow("edges", edges)  # 검은 바탕에 흰 테두리 선
    cv2.imshow("blurred", blurred)  # 흐리게 한 사진도 함께 봐요.
    if cv2.waitKey(1) & 0xFF == ord("q"):  # q 키를 누르면 끝내요.
        break

cap.release()
cv2.destroyAllWindows()

# ── 바꿔볼 것 3가지 ──
# 1. blur_size를 1과 21로 바꿔 봐요. 1이면 잡티까지 테두리가 되어 선이 지글거리고, 21이면 잔 선이 사라지고 큰 윤곽만 남아요.
# 2. high를 60까지 내려 봐요. 희미한 밝기 차이도 테두리가 되어 선이 훨씬 많아져요. 250 가까이 올리면 아주 뚜렷한 테두리만 남아요.
# 3. low를 high와 같게 맞춰 봐요. 약한 테두리를 이어 주는 일이 없어져서 선이 군데군데 끊겨요.
# ── 왜 이런 결과가 나올까 ──
# 흐리게 하면 픽셀 하나하나가 주변과 섞여 작은 잡티(노이즈)의 밝기 차이가 줄어요. 그래서 진짜 물체의 테두리가 더 잘 남아요.
# 너무 많이 흐리게 하면 진짜 테두리의 밝기 차이도 완만해져서 함께 사라져요. blur_size를 31로 올리면 선이 거의 남지 않아요.
# Canny는 밝기 차이가 high보다 크면 테두리로 확정하고, low보다 작으면 버려요. 그 사이 값은 확정된 테두리와 이어져 있을 때만 남겨요.
