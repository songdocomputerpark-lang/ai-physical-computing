import time                               # 시간 라이브러리 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision # MediaPipe 영상 인식 도구 모음

cam=cv2.VideoCapture(0)

cam.set(cv2.CAP_PROP_FRAME_WIDTH,1080)

options=vision.PoseLandmarkerOptions(                                                # 자세 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='pose_landmarker_lite.task'), # 자세 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO)                                           # 영상 모드: 프레임을 차례로 넣어요
pose=vision.PoseLandmarker.create_from_options(options)  # 자세 인식 모델 준비

mp_drawing=vision.drawing_utils           # 몸의 점을 화면에 그려 주는 도구
line_style=mp_drawing.DrawingSpec(
    color=(220,220,220),
    thickness=3
)
circle_style=mp_drawing.DrawingSpec(
    color=(166,114,31),
    thickness=2,
    circle_radius=3
)
cv2.namedWindow("Pose")

while cv2.getWindowProperty("Pose",cv2.WND_PROP_VISIBLE):
    check, frame=cam.read()
    if not check:break
    image=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
    mp_img=mp.Image(image_format=mp.ImageFormat.SRGB, data=image)  # MediaPipe가 읽는 사진 형식으로 감싸기
    results=pose.detect_for_video(mp_img, int(time.time()*1000))   # 지금 시각(밀리초)과 함께 자세 인식
    if results.pose_landmarks:
        mp_drawing.draw_landmarks(
            frame,
            results.pose_landmarks[0],    # 첫 번째 사람의 몸 점 33개
            vision.PoseLandmarksConnections.POSE_LANDMARKS,
            line_style,
            circle_style
        )
    cv2.imshow("Pose",frame)
    if cv2.waitKey(1)==27:break
pose.close()                              # 자세 인식 모델 닫기
cam.release()
cv2.destroyAllWindows()
