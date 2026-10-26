import time                               # 시간 라이브러리 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision # MediaPipe 영상 인식 도구 모음
mp_drawing=vision.drawing_utils           # 손 관절을 화면에 그려 주는 도구
options=vision.HandLandmarkerOptions(                                           # 손 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'), # 손 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                      # 영상 모드: 프레임을 차례로 넣어요
    num_hands=1)                                                                # 손을 1개까지 찾기
hands=vision.HandLandmarker.create_from_options(options)  # 손 인식 모델 준비

line_style=mp_drawing.DrawingSpec(
    color=(166,151,18),
    thickness=3
)

circle_style=mp_drawing.DrawingSpec(
    color=(161,114,31),
    thickness=2,
    circle_radius=3
)
cap=cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,1080)
width=cap.get(cv2.CAP_PROP_FRAME_WIDTH)
height=cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

compare=[(2,4,17),(5,8,0),(9,12,0),(13,16,0),(17,20,0)]
while True:
    ret, frame=cap.read()
    if not ret : break
    frame=cv2.flip(frame,1)
    image=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img=mp.Image(image_format=mp.ImageFormat.SRGB, data=image)  # MediaPipe가 읽는 사진 형식으로 감싸기
    results=hands.detect_for_video(mp_img, int(time.time()*1000))  # 지금 시각(밀리초)과 함께 손 인식
    if results.hand_landmarks:
        for hand_landmarks in results.hand_landmarks:
            h1=hand_landmarks
            folding=""
            finger_point=hand_landmarks[8]
            finger_x=int(finger_point.x*width)
            finger_y=int(finger_point.y*height)
            print(finger_x,finger_y)
            mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                vision.HandLandmarksConnections.HAND_CONNECTIONS,
                line_style,
                circle_style
            )
            cv2.circle(frame, (finger_x,finger_y),30,(255,255,255),10)
        for mcp, tip, comp in compare:
            tip_dist=(h1[comp].x-h1[tip].x)**2+(h1[comp].y-h1[tip].y)**2
            mcp_dist=(h1[comp].x-h1[mcp].x)**2+(h1[comp].y-h1[mcp].y)**2
            folding+="01"[tip_dist>mcp_dist]
        folding+=","
        cv2.putText(
            frame,
            folding,
            (50,50),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0,0,0),
            2
        )
    cv2.imshow('Hand Tracking',frame)

    if cv2.waitKey(1)==27:break
hands.close()                             # 손 인식 모델 닫기
cap.release()
cv2.destroyAllWindows()
