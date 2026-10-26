import time                     # 영상 프레임마다 시각을 붙이기 위한 시간 라이브러리
import cv2                      # 비디오 처리용 OpenCV 라이브러리
import mediapipe as mp          # 손 인식을 위한 MediaPipe 라이브러리
from mediapipe.tasks.python import vision   # MediaPipe의 영상 인식 도구 모음
import math                     # 유클리드 거리 계산을 위한 수학 라이브러리

mp_drawing = vision.drawing_utils           # 손 관절 시각화를 위한 도구

options = vision.HandLandmarkerOptions(                                          # 손 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'),  # 손 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                       # 영상 모드: 프레임을 차례로 넣어요
    num_hands=2)                                                                 # 손을 2개까지 찾기
hands = vision.HandLandmarker.create_from_options(options)  # 손 인식 객체 생성

cap = cv2.VideoCapture(0)  # 웹캠(0번 장치) 연결

while True:
    ret, frame = cap.read()               # 프레임 읽기
    if not ret:
        break                             # 실패 시 루프 종료

    frame = cv2.flip(frame, 1)            # 좌우 반전
    h, w, _ = frame.shape                 # 영상 크기

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # RGB 변환
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)  # MediaPipe가 읽는 사진 형식으로 감싸기

    result = hands.detect_for_video(mp_img, int(time.time() * 1000))  # 손 랜드마크 추출 (지금 시각을 밀리초로 함께 넘김)

    if result.hand_landmarks:             # 손이 감지된 경우
        for hand in result.hand_landmarks:
            mp_drawing.draw_landmarks(frame, hand, vision.HandLandmarksConnections.HAND_CONNECTIONS)

            thumb = hand[4]               # 엄지 끝
            index = hand[8]               # 검지 끝

            x1, y1 = int(thumb.x * w), int(thumb.y * h) # 픽셀 좌표계로 변환
            x2, y2 = int(index.x * w), int(index.y * h) # 픽셀 좌표계로 변환

            distance = math.hypot(x2 - x1, y2 - y1)  # 유클리드 거리 계산

            cv2.line(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)  # 선 그리기

            # 거리 출력
            cv2.putText(frame, f'Distance: {int(distance)}', (10, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)

    cv2.imshow('Hand Tracking', frame)      # 출력 화면
    if cv2.waitKey(1) == ord('q'):          # 'q' 키 누르면 종료
        break

hands.close()             # 손 인식 객체 닫기
cap.release()             # 카메라 종료
cv2.destroyAllWindows()   # 모든 창 닫기
