# 라이브러리 불러오기
import cv2                         # OpenCV 모듈 불러오기
import mediapipe as mp            # MediaPipe 모듈 불러오기

# 포즈 인식 관련 모듈 불러오기
mp_pose = mp.solutions.pose       # Pose 모듈 불러오기
mp_drawing = mp.solutions.drawing_utils  # 랜드마크 시각화 유틸 불러오기

# 포즈 모델 초기화 및 웹캠 연결
pose = mp_pose.Pose()            # Pose 모델 초기화
cap = cv2.VideoCapture(0)        # 웹캠 연결

# 성공 조건 기준 설정
TARGET_Y = 0.3    # 왼손 y 좌표가 이 값보다 작으면 성공으로 판단

# 영상 처리 루프 시작
while cap.isOpened():  # 웹캠이 열려 있는 동안 반복
    ret, frame = cap.read()  # 프레임 읽기
    if not ret:
        break  # 프레임을 읽을 수 없으면 종료

    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)   # BGR → RGB 색상 변환

    results = pose.process(image)  # 포즈 추정 수행

    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)  # 출력을 위해 다시 RGB → BGR로 색상 변환

    # 포즈가 감지된 경우
    if results.pose_landmarks:  
        landmarks = results.pose_landmarks.landmark  # 33개 랜드마크 좌표 가져오기

        # 왼손 손목의 y좌표 추출
        left_wrist_y = landmarks[mp_pose.PoseLandmark.LEFT_WRIST.value].y  # 왼손 손목 y좌표

        # 포즈 랜드마크 시각화
        mp_drawing.draw_landmarks(
            image,
            results.pose_landmarks,          # 검출된 랜드마크 정보
            mp_pose.POSE_CONNECTIONS        # 랜드마크 연결 정보
        )

    # 마지막에 좌우 반전 
    image = cv2.flip(image, 1)

    # 왼손이 위로 올라간 경우 텍스트 출력
    if left_wrist_y < TARGET_Y:
        cv2.putText(image, 'Success!', (30, 50),   # 텍스트 위치 설정
                    cv2.FONT_HERSHEY_SIMPLEX, 1,  # 글꼴과 크기 설정
                    (0, 255, 0), 2, cv2.LINE_AA)   # 초록색 글자 출력

    # 결과 영상 출력
    cv2.imshow('Mirror Pose Game', image)         # 실시간 영상 출력

    if cv2.waitKey(10) & 0xFF == ord('q'):        # 'q' 키를 누르면 종료
        break

# 자원 정리
cap.release()                    # 웹캠 연결 해제
cv2.destroyAllWindows()          # 모든 창 닫기
