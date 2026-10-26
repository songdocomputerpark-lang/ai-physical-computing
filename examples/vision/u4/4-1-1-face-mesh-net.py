# 1차시 1-2: 기본 과제 (얼굴 인식 및 특징점 찾기)
import time                               # 시간 라이브러리 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision # MediaPipe 영상 인식 도구 모음

# MediaPipe의 얼굴 그물망(Face Mesh) 설정과 그리기 관련 도구 준비
options = vision.FaceLandmarkerOptions(                                         # 얼굴 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='face_landmarker.task'), # 얼굴 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                      # 영상 모드: 프레임을 차례로 넣어요
    num_faces=1, # 최대 1개의 얼굴만 인식 (눈동자 점까지 늘 478개를 찾아요)
    min_face_detection_confidence=0.5,
    min_tracking_confidence=0.5)
mp_drawing = vision.drawing_utils   # 특징점과 연결선을 그려 주는 도구

# 웹캠을 비디오 소스로 사용
cap = cv2.VideoCapture(0)

# Face Mesh 모델 초기화 (with 문이 끝나면 모델이 저절로 닫혀요)
with vision.FaceLandmarker.create_from_options(options) as face_mesh:

    while True:
        success, frame = cap.read()
        if not success:
            break

        # 성능 향상을 위해 이미지를 읽기 전용으로 변경
        frame.flags.writeable = False
        # MediaPipe가 처리할 수 있도록 이미지 색상 순서 변경 (BGR -> RGB)
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 이미지에서 얼굴 특징점 처리
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)    # MediaPipe가 읽는 사진 형식으로 감싸기
        results = face_mesh.detect_for_video(mp_img, int(time.time() * 1000)) # 지금 시각(밀리초)과 함께 얼굴 특징점 찾기

        # 다시 화면에 표시하기 위해 이미지 쓰기 허용 및 색상 복원 (RGB -> BGR)
        frame.flags.writeable = True
        frame = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        # 얼굴 특징점이 감지되었다면 (얼굴이 없으면 빈 리스트라 건너뜀)
        if results.face_landmarks:
            for face_landmarks in results.face_landmarks:
                # 얼굴에 그물망 그리기
                mp_drawing.draw_landmarks(
                    image=frame,
                    landmark_list=face_landmarks,
                    connections=vision.FaceLandmarksConnections.FACE_LANDMARKS_TESSELATION, # 그물망 연결선
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing.DrawingSpec
                    (color=(0,255,0), thickness=1) # 초록색 선
                )

        cv2.imshow('Camera Feed', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
