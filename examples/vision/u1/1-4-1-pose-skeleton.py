# ▶ 라이브러리 불러오기
import time               # time: 영상 프레임마다 시각을 붙이는 데 사용
import cv2                # OpenCV: 실시간 영상 처리 및 출력
import mediapipe as mp    # MediaPipe: 포즈(자세) 인식 라이브러리
from mediapipe.tasks.python import vision  # MediaPipe 영상 인식 도구 모음

# ▶ MediaPipe Drawing 유틸 불러오기
mp_drawing = vision.drawing_utils                # 랜드마크 시각화 유틸

# ▶ PoseLandmarker(자세 인식) 모델 초기화
options = vision.PoseLandmarkerOptions(                                              # 자세 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='pose_landmarker_lite.task'), # 자세 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO)                                           # 영상 모드: 프레임을 차례로 넣어요
pose = vision.PoseLandmarker.create_from_options(options)  # PoseLandmarker 객체 생성
cap = cv2.VideoCapture(0)                        # 0번 카메라(내장 웹캠) 연결

# ▶ 프레임 반복 처리 루프
while cap.isOpened():                            # 웹캠이 열려있는 동안 계속 반복
    ret, frame = cap.read()                      # 프레임 읽기
    if not ret:                                  # 프레임 못 읽으면 종료
        break

    frame = cv2.flip(frame, 1)                   # 좌우 반전 → 거울 효과
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # BGR → RGB 변환

    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=image)   # MediaPipe가 읽는 사진 형식으로 감싸기
    results = pose.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 포즈 추정 수행

    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)  # 다시 RGB → BGR로 변환 (출력을 위해)

    # ▶ 포즈 랜드마크가 감지되면 화면에 시각화
    if results.pose_landmarks:  # 포즈 정보가 감지되었을 때
        mp_drawing.draw_landmarks(
            image,
            results.pose_landmarks[0],           # 검출된 첫 번째 사람의 랜드마크 정보(점 33개)
            vision.PoseLandmarksConnections.POSE_LANDMARKS  # 랜드마크 간 연결 정보
        )

    cv2.imshow('Pose Tracking', image)           # 결과 영상 출력

    if cv2.waitKey(10) & 0xFF == ord('q'):       # 'q' 키 입력 시 종료
        break

# ▶ 자원 해제
pose.close()                # 자세 인식 모델 닫기
cap.release()               # 웹캠 연결 해제
cv2.destroyAllWindows()     # 모든 OpenCV 창 닫기
