import time                               # 시간 라이브러리 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision # MediaPipe 영상 인식 도구 모음

# 웹캠 연결 및 FaceLandmarker(얼굴 그물 인식) 초기화
cap = cv2.VideoCapture(0)
options = vision.FaceLandmarkerOptions(                                         # 얼굴 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='face_landmarker.task'), # 얼굴 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                      # 영상 모드: 프레임을 차례로 넣어요
    num_faces=1)                                                                # 얼굴을 1개만 찾기
face_mesh = vision.FaceLandmarker.create_from_options(options)  # 얼굴 인식 모델 준비

# 왼쪽/오른쪽 카운트 및 이전 방향 초기화
left_count, right_count = 0, 0
prev_direction = "Center"

# 고개 방향 판별 함수: 눈의 중앙과 코의 위치 비교
def detect_head_direction(nose_x, eye_center_x, threshold=10):
    diff = nose_x - eye_center_x
    if diff < -threshold:
        return "Left"
    elif diff > threshold:
        return "Right"
    else:
        return "Center"

# 영상 처리 루프 시작
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1)  # 좌우 반전
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)    # MediaPipe가 읽는 사진 형식으로 감싸기
    results = face_mesh.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 얼굴 인식

    if results.face_landmarks:
        landmarks = results.face_landmarks[0]  # 첫 번째 얼굴의 점 목록
        h, w = frame.shape[:2]

        # 양 눈의 중심점 계산 (좌: 33번, 우: 263번)
        left_eye_x = int(landmarks[33].x * w)
        right_eye_x = int(landmarks[263].x * w)
        eye_center_x = (left_eye_x + right_eye_x) // 2

        # 코 좌표 (1번 포인트)
        nose_x = int(landmarks[1].x * w)

        # 방향 판정
        direction = detect_head_direction(nose_x, eye_center_x)

        # 방향이 바뀔 때만 카운트
        if direction != prev_direction:
            if direction == "Left":
                left_count += 1
            elif direction == "Right":
                right_count += 1
            prev_direction = direction

        # 디버깅용 텍스트 출력
        cv2.putText(frame, f"Direction: {direction}", (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        cv2.putText(frame, f"Left: {left_count}", (30, 100),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
        cv2.putText(frame, f"Right: {right_count}", (30, 140),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

        # 눈과 코 시각화
        cv2.circle(frame, (left_eye_x, int(landmarks[33].y * h)), 3, (0, 255, 255), -1)
        cv2.circle(frame, (right_eye_x, int(landmarks[263].y * h)), 3, (0, 255, 255), -1)
        cv2.circle(frame, (nose_x, int(landmarks[1].y * h)), 3, (0, 0, 255), -1)
        cv2.line(frame, (left_eye_x, 30), (right_eye_x, 30), (100, 100, 255), 2)

    # 결과 영상 출력
    cv2.imshow("Head Direction Counter", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# 자원 정리
face_mesh.close()        # 얼굴 인식 모델 닫기
cap.release()
cv2.destroyAllWindows()
