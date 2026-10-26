import time                # time: 영상 프레임마다 시각을 붙이는 데 사용
import cv2                 # OpenCV: 이미지 처리와 웹캠 사용
import mediapipe as mp     # MediaPipe: 손가락 추적
from mediapipe.tasks.python import vision  # MediaPipe의 영상 인식 도구 모음
import numpy as np         # NumPy: 배열(이미지 도화지) 처리

# MediaPipe의 손 인식 모델 초기화
options = vision.HandLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'),  # 손 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,  # 영상 모드: 프레임을 차례로 넣어요
    num_hands=1)                            # 손을 1개만 찾기
hands = vision.HandLandmarker.create_from_options(options)  # 손 인식 모델 준비 (한 손만 인식)

canvas = None              # 손가락으로 그릴 도화지 (배경)
prev_x, prev_y = 0, 0      # 이전 프레임의 손가락 위치 (선을 그릴 때 사용)
drawing_enabled = False    # d 키로 그리기 모드 on/off

# 웹캠 열기
cap = cv2.VideoCapture(0)

while True:
    ret, frame = cap.read()      # 웹캠 프레임 읽기
    if not ret:
        break                    # 프레임 읽기 실패 시 종료

    frame = cv2.flip(frame, 1)   # 좌우 반전 (거울처럼 보이게)
    h, w, _ = frame.shape        # 프레임의 높이(h), 너비(w) 구하기

    # 도화지가 아직 없으면, 프레임과 같은 크기의 검은 화면 생성
    if canvas is None:
        canvas = np.zeros_like(frame)

    # 손 인식을 위해 색공간을 RGB로 변환
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)     # MediaPipe가 읽는 사진 형식으로 감싸기
    result = hands.detect_for_video(mp_img, int(time.time() * 1000))  # 손 관절 인식 수행 (지금 시각을 밀리초로 함께 넘김)

    # 손이 화면에 감지되었을 경우
    if result.hand_landmarks:
        # 첫 번째 손의 관절 리스트 가져오기
        lm = result.hand_landmarks[0]

        # 검지 손가락 끝(8번 랜드마크)의 x, y 위치 계산 (픽셀 좌표로 변환)
        x = int(lm[8].x * w)
        y = int(lm[8].y * h)

        # 그리기 모드가 활성화된 경우에만 그림
        if drawing_enabled:
            if prev_x != 0 and prev_y != 0:
                cv2.line(canvas, (prev_x, prev_y), (x, y), (0, 255, 0), 3)
            prev_x, prev_y = x, y
        else:
            prev_x, prev_y = 0, 0
    else:
        # 손이 화면에 없으면 선 그리기 멈춤
        prev_x, prev_y = 0, 0


    # 실제 화면과 캔버스를 반반(0.5, 0.5) 합성해서 보여주기
    output = cv2.addWeighted(frame, 0.5, canvas, 0.5, 0)
    cv2.imshow("Draw with Index Finger (Toggle: d)", output)

    key = cv2.waitKey(1) #& 0xFF

    # 'q' 키를 누르면 종료
    if key == ord('q'):
        break

    # 'd' 키를 누르면 그리기 모드 토글
    elif key == ord('d'):
        drawing_enabled = not drawing_enabled
        print("Drawing mode:", drawing_enabled)

# 손 인식 모델, 웹캠과 창 닫기
hands.close()
cap.release()
cv2.destroyAllWindows()
