import time                # 시간 라이브러리 불러오기 (영상 장면마다 시각을 붙이는 데 사용)
import cv2                 # OpenCV 라이브러리 불러오기 (카메라 영상 처리)
import mediapipe as mp     # Mediapipe 라이브러리 불러오기 (손 인식)
from mediapipe.tasks.python import vision  # Mediapipe 영상 인식 도구 모음
import bluetooth           # 블루투스 통신을 위한 모듈 불러오기

# 블루투스 초기화 (ESP32 블루투스 주소 입력)
b = bluetooth.init("XX:XX:XX:XX:XX:XX")

# Mediapipe의 손 인식 기능 초기화 (손 인식 전용 도구)
options = vision.HandLandmarkerOptions(                                         # 손 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'), # 손 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                      # 영상 모드: 장면을 차례로 넣어요
    num_hands=1)                                                                # 최대 1개의 손만 인식하도록 설정
hands = vision.HandLandmarker.create_from_options(options)  # 손 인식 모델 준비
mp_drawing = vision.drawing_utils                           # 손 관절을 영상에 그려 주는 도구

# 손가락 관절을 선으로 연결할 때 선 스타일(색, 두께) 지정
line_style = mp_drawing.DrawingSpec(
    color=(166, 151, 18),   # 선 색상 (청록색 계열)
    thickness=3             # 선 두께
)

# 손가락 관절 점을 표시할 때 점 스타일(색, 크기) 지정
circle_style = mp_drawing.DrawingSpec(
    color=(161, 114, 31),   # 점 색상 (파란색 계열)
    thickness=2,            # 점의 테두리 두께
    circle_radius=3         # 점의 크기
)

# 카메라 실행
cap = cv2.VideoCapture(0)                # 0번 카메라(노트북 기본 웹캠) 사용
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1080)  # 영상의 가로 해상도 설정
width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)   # 영상 가로 크기 저장
height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) # 영상 세로 크기 저장

while True:   # 계속 반복
    ret, frame = cap.read()         # 카메라에서 한 장면 읽기
    frame = cv2.flip(frame, 1)      # 좌우 반전 (거울처럼 보이게)
    if not ret:                     # 카메라가 꺼지면 반복 종료
        break

    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # OpenCV 영상(BGR)을 Mediapipe가 쓰는 RGB로 변환
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=image)    # Mediapipe가 읽는 사진 형식으로 감싸기
    results = hands.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 손이 있는지 분석

    if results.hand_landmarks:   # 손이 인식되었을 때만 실행
        for hand_landmarks in results.hand_landmarks:
            # 손가락 좌표(검지 끝, 8번 점) 가져오기
            finger_point = hand_landmarks[8]
            finger_x = int(finger_point.x * width)   # x좌표 (화면 가로 비율 → 픽셀 좌표)
            finger_y = int(finger_point.y * height)  # y좌표 (화면 세로 비율 → 픽셀 좌표)

            # 손가락 좌표를 블루투스로 전송 (예: "320,200")
            b.send(f"{finger_x},{finger_y}")

            print(f"Sent: {finger_x}, {finger_y}")   # 전송한 값 콘솔에 출력

            # 손가락 관절과 연결선을 영상에 그리기
            mp_drawing.draw_landmarks(
                frame,                         # 출력할 영상
                hand_landmarks,                # 손 관절 좌표 데이터(점 21개)
                vision.HandLandmarksConnections.HAND_CONNECTIONS,  # 손가락 연결 정보
                circle_style,                  # 점 스타일 적용
                line_style                     # 선 스타일 적용
            )

    # 영상 화면에 출력 (창 이름: Hand Tracking)
    cv2.imshow('Hand Tracking', frame)

    # 키보드 ESC(27번)를 누르면 종료
    if cv2.waitKey(1) == 27:
        break

# 손 인식 모델, 카메라와 창 닫기
hands.close()
cap.release()
cv2.destroyAllWindows()
