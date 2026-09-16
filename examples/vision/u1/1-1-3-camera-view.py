# 1. 라이브러리 임포트 영역
import cv2

# 2. 상수 및 설정 영역
WINDOW_NAME = 'Camera View'

# 3. 초기화(환경/데이터/객체) 영역
cap = cv2.VideoCapture(0)

# 4. 함수 정의 영역
def show_frame(frame):
    cv2.imshow(WINDOW_NAME, frame)

# 5. (선택) 네트워크/외부 연동 설정 영역
def setup_external_services():
    pass

# 6. 메인 실행 영역
while True:
    ret, frame = cap.read()
    if not ret:
        break

    show_frame(frame)

    if cv2.waitKey(1) == ord('q'):
        break

# 7. 프로그램 종료 처리 영역(또는 시작점)
cap.release()
cv2.destroyAllWindows()
