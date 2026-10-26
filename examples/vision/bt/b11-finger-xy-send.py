import time
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision
import bluetooth

# 블루투스 초기화
b = bluetooth.init("XX:XX:XX:XX:XX:XX")

# Mediapipe 손 인식 초기화(모델 파일 hand_landmarker.task는 이 코드와 같은 폴더)
options = vision.HandLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'),
    running_mode=vision.RunningMode.VIDEO,
    num_hands=1
)
hands = vision.HandLandmarker.create_from_options(options)
mp_drawing = vision.drawing_utils

# 손 추적 스타일 설정
line_style = mp_drawing.DrawingSpec(
    color=(166, 151, 18),
    thickness=3
)
circle_style = mp_drawing.DrawingSpec(
    color=(161, 114, 31),
    thickness=2,
    circle_radius=3
)

# 카메라 설정
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1080)
width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

while True:
    ret, frame = cap.read()
    frame = cv2.flip(frame, 1)
    if not ret:
        break

    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    # 사진 형식으로 감싸 지금 시각(밀리초)과 함께 손 인식
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=image)
    results = hands.detect_for_video(mp_img, int(time.time() * 1000))

    if results.hand_landmarks:
        for hand_landmarks in results.hand_landmarks:
            # 손가락 좌표 추출
            finger_point = hand_landmarks[8]
            finger_x = int(finger_point.x * width)
            finger_y = int(finger_point.y * height)

            # 좌표를 블루투스 메시지로 전송
            b.send(f"{finger_x},{finger_y}")

            print(f"Sent: {finger_x}, {finger_y}")

            # 손 랜드마크를 이미지에 그리기
            mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                vision.HandLandmarksConnections.HAND_CONNECTIONS,
                circle_style,
                line_style
            )

    # 영상 출력
    cv2.imshow('Hand Tracking', frame)

    # ESC 키를 누르면 종료
    if cv2.waitKey(1) == 27:
        break

hands.close()
cap.release()
cv2.destroyAllWindows()
