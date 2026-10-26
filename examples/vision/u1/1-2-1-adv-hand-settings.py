import time             # 시간 라이브러리 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2
import mediapipe as mp  # 미디어파이프 라이브러리를 mp로 명명하여 사용
from mediapipe.tasks.python import vision  # 미디어파이프의 영상 인식 도구 모음을 vision으로 사용

# MediaPipe 손 인식(HandLandmarker) 초기화
options = vision.HandLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'),  # 손 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,  # 영상 모드: 프레임을 차례로 넣어요
    num_hands=1,                            # 한 번에 찾을 손의 최대 개수
    min_hand_detection_confidence=0.5)      # 손이라고 인정하는 신뢰도 기준(0~1)
hands = vision.HandLandmarker.create_from_options(options)  # 손 인식을 위한 설정 초기화

mp_drawing = vision.drawing_utils  # 그리기 도구를 mp_drawing으로 명명하여 사용

video = cv2.VideoCapture(0) # 웹캠 연결

while True:
    ret, frame = video.read()  # 프레임 읽기
    if not ret: # 프레임 읽기에 실패하면 종료
        break

    frame = cv2.flip(frame, 1)  # 좌우 반전 (거울 모드)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)  # MediaPipe가 읽는 사진 형식으로 감싸기
    result = hands.detect_for_video(mp_img, int(time.time() * 1000))     # 손 인식 (지금 시각을 밀리초로 함께 넘김)

    if result.hand_landmarks:  # 여러 손의 랜드마크가 감지되었는지 확인
        for hand_landmarks in result.hand_landmarks: # 손 관절(랜드마크)마다 반복
            # 손 관절(랜드마크)와 연결선을 그리기
            mp_drawing.draw_landmarks(frame, hand_landmarks, vision.HandLandmarksConnections.HAND_CONNECTIONS)

    cv2.imshow('Hand Tracking', frame)  # 프레임 출력

    if cv2.waitKey(30) == ord('q'):   # 30 ms마다 q 키를 누르는지 확인
        break

hands.close()     # 손 인식 모델 닫기
video.release()   # 웹캠 장치 해제
cv2.destroyAllWindows() # 창 닫기
