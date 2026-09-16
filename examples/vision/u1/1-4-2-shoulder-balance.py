# 라이브러리 불러오기
import cv2  # OpenCV 모듈 불러오기
import mediapipe as mp  # MediaPipe 모듈 불러오기

# 포즈 인식 관련 모듈 불러오기
mp_pose = mp.solutions.pose  # Pose 모듈 불러오기
mp_drawing = mp.solutions.drawing_utils  # 랜드마크 시각화 유틸 불러오기

# 포즈 모델 초기화 및 웹캠 연결
pose = mp_pose.Pose()  # Pose 모델 초기화
cap = cv2.VideoCapture(0)  # 웹캠 연결

# 영상 처리 루프 시작
while cap.isOpened():  # 웹캠이 열려 있는 동안 반복
    ret, frame = cap.read()  # 프레임 읽기 
    if not ret:
        break  # 프레임을 읽을 수 없으면 종료

    frame = cv2.flip(frame, 1)  # 좌우 반전
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # BGR → RGB 색상 변환
    results = pose.process(image)  # 포즈 추정 수행
    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)  # 출력을 위해 다시 RGB → BGR로 색상 변환

    # 포즈가 감지되었을 때
    if results.pose_landmarks:
        landmarks = results.pose_landmarks.landmark  # 33개 랜드마크 좌표 가져오기
        h, w, _ = image.shape  # 이미지 높이, 너비 정보 가져오기

        # 왼쪽 어깨와 오른쪽 어깨 좌표 추출
        left_shoulder = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER]  # 왼쪽 어깨
        right_shoulder = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER]  # 오른쪽 어깨

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
            results.pose_landmarks,  # 랜드마크 좌표
            mp_pose.POSE_CONNECTIONS  # 연결선 정보
        )

    # 결과 영상 출력
    cv2.imshow('Pose Tracking', image)  # 실시간 영상 출력

    if cv2.waitKey(10) & 0xFF == ord('q'):  # 'q' 키를 누르면 종료
        break

# 자원 정리
cap.release()  # 웹캠 해제
cv2.destroyAllWindows()  # 모든 창 닫기