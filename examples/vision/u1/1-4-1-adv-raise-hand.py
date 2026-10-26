# 라이브러리 불러오기
import time                        # 시간 모듈 불러오기 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2                         # OpenCV 모듈 불러오기
import mediapipe as mp            # MediaPipe 모듈 불러오기
from mediapipe.tasks.python import vision  # MediaPipe 영상 인식 도구 모음 불러오기

# 랜드마크 시각화 도구 불러오기
mp_drawing = vision.drawing_utils  # 랜드마크 시각화 유틸 불러오기

# 포즈 모델 초기화 및 웹캠 연결
options = vision.PoseLandmarkerOptions(                                              # 자세 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='pose_landmarker_lite.task'), # 자세 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO)                                           # 영상 모드: 프레임을 차례로 넣어요
pose = vision.PoseLandmarker.create_from_options(options)  # Pose 모델 초기화
cap = cv2.VideoCapture(0)        # 웹캠 연결

# 성공 조건 기준 설정
TARGET_Y = 0.3    # 왼손 y 좌표가 이 값보다 작으면 성공으로 판단 @slider 0.05 0.95 0.05
left_wrist_y = 1.0    # 첫 장면에 사람이 없어도 52행에서 비교할 수 있게 처음 값(화면 맨 아래)을 정해 둬요

# 영상 처리 루프 시작
while cap.isOpened():  # 웹캠이 열려 있는 동안 반복
    ret, frame = cap.read()  # 프레임 읽기
    if not ret:
        break  # 프레임을 읽을 수 없으면 종료

    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)   # BGR → RGB 색상 변환

    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=image)   # MediaPipe가 읽는 사진 형식으로 감싸기
    results = pose.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 포즈 추정 수행

    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)  # 출력을 위해 다시 RGB → BGR로 색상 변환

    # 포즈가 감지된 경우
    if results.pose_landmarks:
        landmarks = results.pose_landmarks[0]  # 첫 번째 사람의 33개 랜드마크 좌표 가져오기

        # 왼손 손목의 y좌표 추출
        left_wrist_y = landmarks[vision.PoseLandmark.LEFT_WRIST.value].y  # 왼손 손목 y좌표

        # 포즈 랜드마크 시각화
        mp_drawing.draw_landmarks(
            image,
            landmarks,                       # 검출된 랜드마크 정보
            vision.PoseLandmarksConnections.POSE_LANDMARKS  # 랜드마크 연결 정보
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
pose.close()                     # 자세 인식 모델 닫기
cap.release()                    # 웹캠 연결 해제
cv2.destroyAllWindows()          # 모든 창 닫기

# ── 바꿔볼 것 3가지 ──
# 1. 실행한 채로 조절 패널의 TARGET_Y 막대를 0.3에서 0.6으로 옮겨 봐요. Success!가 더 오래 떠요. 0.2까지 줄이면 어떻게 될까요?
# 2. 39행의 LEFT_WRIST를 RIGHT_WRIST로 바꿔 봐요. 재생 입력의 '손 들기' 동작에서는 Success!가 뜨지 않아요.
# 3. 52행의 < 를 > 로 바꿔 봐요. 이번에는 손을 내리고 있을 때 Success!가 떠요.
# ── 왜 이런 결과가 나올까 ──
# 39행은 몸의 점 33개 가운데 15번 점(왼쪽 손목)의 y 좌표를 꺼내요. y는 영상 맨 위가 0, 맨 아래가 1이에요.
# 그래서 손을 번쩍 들수록 y가 작아져요. 52행은 그 값이 TARGET_Y보다 작을 때만 Success!를 써요.
# TARGET_Y를 크게 하면 기준선이 아래로 내려가 손을 조금만 들어도 성공이 되고, 작게 하면 더 높이 들어야 해요.
# 19행은 사람이 안 보이는 장면에서도 52행이 비교할 값이 있게 처음 값 1.0(화면 맨 아래)을 정해 둬요. 이 줄이 없으면 NameError가 나요.
