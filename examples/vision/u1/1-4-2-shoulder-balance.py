# 라이브러리 불러오기
import time  # 시간 모듈 불러오기 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2  # OpenCV 모듈 불러오기
import mediapipe as mp  # MediaPipe 모듈 불러오기
from mediapipe.tasks.python import vision  # MediaPipe 영상 인식 도구 모음 불러오기

# 랜드마크 시각화 도구 불러오기
mp_drawing = vision.drawing_utils  # 랜드마크 시각화 유틸 불러오기

# 포즈 모델 초기화 및 웹캠 연결
options = vision.PoseLandmarkerOptions(  # 자세 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='pose_landmarker_lite.task'),  # 자세 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO)  # 영상 모드: 프레임을 차례로 넣어요
pose = vision.PoseLandmarker.create_from_options(options)  # Pose 모델 초기화
cap = cv2.VideoCapture(0)  # 웹캠 연결

# 영상 처리 루프 시작
while cap.isOpened():  # 웹캠이 열려 있는 동안 반복
    ret, frame = cap.read()  # 프레임 읽기
    if not ret:
        break  # 프레임을 읽을 수 없으면 종료

    frame = cv2.flip(frame, 1)  # 좌우 반전
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # BGR → RGB 색상 변환
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=image)  # MediaPipe가 읽는 사진 형식으로 감싸기
    results = pose.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 포즈 추정 수행
    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)  # 출력을 위해 다시 RGB → BGR로 색상 변환

    # 포즈가 감지되었을 때
    if results.pose_landmarks:
        landmarks = results.pose_landmarks[0]  # 첫 번째 사람의 33개 랜드마크 좌표 가져오기
        h, w, _ = image.shape  # 이미지 높이, 너비 정보 가져오기

        # 왼쪽 어깨와 오른쪽 어깨 좌표 추출
        left_shoulder = landmarks[vision.PoseLandmark.LEFT_SHOULDER]  # 왼쪽 어깨
        right_shoulder = landmarks[vision.PoseLandmark.RIGHT_SHOULDER]  # 오른쪽 어깨

        # 정규화 좌표(0~1)를 실제 픽셀 좌표로 변환
        lx, ly = int(left_shoulder.x * w), int(left_shoulder.y * h)
        rx, ry = int(right_shoulder.x * w), int(right_shoulder.y * h)

        # 어깨를 연결하는 선 그리기
        cv2.line(image, (lx, ly), (rx, ry), (255, 255, 255), 2)  # 흰색 선

        # 각 어깨 위치에 빨간 점 표시
        cv2.circle(image, (lx, ly), 5, (0, 0, 255), -1)  # 왼쪽 어깨
        cv2.circle(image, (rx, ry), 5, (0, 0, 255), -1)  # 오른쪽 어깨

        # 어깨 높이 차이 계산 후 텍스트 표시
        diff_text = f'Diff: {abs(ly - ry)} px'
        cv2.putText(image, diff_text, (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)  # 어깨 y좌표 차이 출력

        # 전체 포즈 랜드마크 및 연결선 시각화
        mp_drawing.draw_landmarks(
            image,
            landmarks,  # 랜드마크 좌표
            vision.PoseLandmarksConnections.POSE_LANDMARKS  # 연결선 정보
        )

    # 결과 영상 출력
    cv2.imshow('Pose Tracking', image)  # 실시간 영상 출력

    if cv2.waitKey(10) & 0xFF == ord('q'):  # 'q' 키를 누르면 종료
        break

# 자원 정리
pose.close()  # 자세 인식 모델 닫기
cap.release()  # 웹캠 해제
cv2.destroyAllWindows()  # 모든 창 닫기
