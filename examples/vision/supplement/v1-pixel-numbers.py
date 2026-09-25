# 보충 V1: 사진은 숫자다(픽셀 숫자 보기)
# 영상의 작은 네모 부분을 크게 확대해 칸마다 밝기 숫자를 적어요. 사진이 0~255 숫자가 채워진 모눈이라는 것을 눈으로 확인해요.
# @lesson v1
# @tags 픽셀, 밝기, 회색, 확대, numpy
# 웹캠이나 샘플 입력으로 실행해요. 조절 패널에서 확대할 자리(x, y)와 한 변에 볼 픽셀 수(cells)를 바꿔 봐요.
import cv2

x = 320  # @slider 0 639 1 확대할 자리의 가로 위치(픽셀)
y = 240  # @slider 0 479 1 확대할 자리의 세로 위치(픽셀)
cells = 8  # @slider 4 16 2 한 변에 볼 픽셀 수
ZOOM = 480  # 확대한 그림의 한 변 크기(픽셀)
BLUE = (214, 91, 31)  # OpenCV 색은 (파랑, 초록, 빨강) 순서예요. 이 값은 사이트의 파란색이에요.

cap = cv2.VideoCapture(0)  # 0번 카메라(웹캠)를 열어요. 카메라가 없으면 실습실이 샘플 입력을 대신 줘요.
printed = False  # 사진 크기는 처음 한 번만 콘솔에 적어요.
while cap.isOpened():
    ok, frame = cap.read()  # 사진 한 장(프레임)을 읽어요. frame은 (세로, 가로, 3) 모양의 숫자 배열이에요.
    if not ok:  # 읽지 못하면 반복을 끝내요.
        break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 색 숫자 3개를 밝기 숫자 1개(0 검정 ~ 255 흰색)로 합쳐요.
    height, width = gray.shape  # 세로·가로 픽셀 수
    if not printed:
        print("사진 크기(세로, 가로):", gray.shape, "→ 픽셀", height * width, "개")
        print("가운데 픽셀의 밝기:", gray[height // 2, width // 2], "/ 색(B, G, R):", frame[height // 2, width // 2])
        printed = True

    # 확대할 네모의 왼쪽 위 모서리. 사진 밖으로 나가지 않게 0 ~ (크기 - cells) 사이로 맞춰요.
    left = min(max(x - cells // 2, 0), width - cells)
    top = min(max(y - cells // 2, 0), height - cells)
    patch = gray[top:top + cells, left:left + cells]  # 네모 부분만 잘라요(numpy 슬라이스).
    step = ZOOM // cells  # 확대된 픽셀 한 칸의 크기
    size = step * cells  # 확대한 그림의 실제 크기(칸 크기의 배수)
    # 잘라낸 부분을 크게 키워요. INTER_NEAREST는 픽셀을 뭉개지 않고 그대로 네모로 늘려요.
    zoom = cv2.resize(patch, (size, size), interpolation=cv2.INTER_NEAREST)
    zoom = cv2.cvtColor(zoom, cv2.COLOR_GRAY2BGR)  # 색 글자·선을 그릴 수 있게 3채널로 바꿔요.
    scale = max(0.3, step / 120)  # 칸이 작아지면 글자도 작게
    for row in range(cells):
        for col in range(cells):
            value = int(patch[row, col])  # 이 칸의 밝기 숫자
            color = (255, 255, 255) if value < 128 else (0, 0, 0)  # 어두운 칸엔 흰 글자, 밝은 칸엔 검은 글자
            cv2.putText(zoom, str(value), (col * step + 3, row * step + step // 2 + 5), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 1, cv2.LINE_AA)
    for i in range(cells + 1):  # 모눈 선
        cv2.line(zoom, (i * step, 0), (i * step, size), BLUE, 1)
        cv2.line(zoom, (0, i * step), (size, i * step), BLUE, 1)
    cv2.rectangle(frame, (left - 6, top - 6), (left + cells + 6, top + cells + 6), BLUE, 2)  # 원본에 확대한 자리를 표시해요.
    cv2.imshow("zoom", zoom)  # 확대한 모눈(숫자 포함)
    cv2.imshow("camera", frame)  # 원본(확대한 자리 표시 포함)
    if cv2.waitKey(1) & 0xFF == ord("q"):  # q 키를 누르면 끝내요.
        break

cap.release()  # 카메라를 놓아줘요.
cv2.destroyAllWindows()  # 창을 모두 닫아요.

# ── 바꿔볼 것 3가지 ──
# 1. cells를 16으로 올려 봐요(10행이나 조절 막대). 확대하는 네모가 16×16픽셀로 넓어져 zoom 창에 칸이 256개 들어가고, 칸과 글자가 작아져요.
# 2. 24행에 두 번 나오는 [height // 2, width // 2]를 모두 [0, 0]으로 바꿔 봐요. 왼쪽 위 구석 픽셀의 값이 찍혀요. 가운데 픽셀과 견줘 봐요.
# 3. 30행의 gray를 frame[:, :, 2](빨강 채널)로 바꿔 봐요. 빨간 물체는 숫자가 크고 파란 물체는 작아요(V2에서 자세히 봐요).
# ── 왜 이런 결과가 나올까 ──
# 카메라는 픽셀마다 들어온 빛의 세기를 0~255 사이 정수로 저장해요. 그래서 사진은 숫자가 가득한 표(배열)예요.
# 확대해도 새로운 정보는 생기지 않아요. INTER_NEAREST는 픽셀 하나를 그대로 큰 네모로 늘려서 원래 숫자가 보이는 거예요.
# 밝은 칸은 숫자가 크고 어두운 칸은 작아요. 이 숫자를 다른 숫자로 바꾸는 계산이 곧 영상 처리예요(V2~V5).
