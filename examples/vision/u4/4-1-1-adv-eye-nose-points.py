# 1차시 1-3: 심화 과제 (특정 지점에 점 찍기)
import time                               # 시간 라이브러리 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision # MediaPipe 영상 인식 도구 모음

options = vision.FaceLandmarkerOptions(                                         # 얼굴 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='face_landmarker.task'), # 얼굴 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                      # 영상 모드: 프레임을 차례로 넣어요
    num_faces=1,                                                                # 얼굴을 1개만 찾기 (점은 늘 478개)
    min_face_detection_confidence=0.5,
    min_tracking_confidence=0.5)

cap = cv2.VideoCapture(0)

with vision.FaceLandmarker.create_from_options(options) as face_mesh:

    while True:
        success, frame = cap.read()
        if not success:
            break

        # 화면 좌우 반전
        frame = cv2.flip(frame, 1)

        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)    # MediaPipe가 읽는 사진 형식으로 감싸기
        results = face_mesh.detect_for_video(mp_img, int(time.time() * 1000)) # 지금 시각(밀리초)과 함께 얼굴 특징점 찾기

        # 얼굴 특징점이 감지되었다면
        if results.face_landmarks:
            for face_landmarks in results.face_landmarks:
                # 랜드마크 좌표는 0~1 사이의 비율 값이므로,
                # 실제 픽셀 좌표로 변환 필요
                h, w, _ = frame.shape

                # 인중(인덱스 6) 좌표
                nose_tip = face_landmarks[6]
                nose_x, nose_y = int(nose_tip.x * w), int(nose_tip.y * h)

                # 왼쪽 눈 중심 부근(인덱스 468) 좌표
                left_eye = face_landmarks[468]
                le_x, le_y = int(left_eye.x * w), int(left_eye.y * h)

                # 오른쪽 눈 중심 부근(인덱스 473) 좌표
                right_eye = face_landmarks[473]
                re_x, re_y = int(right_eye.x * w), int(right_eye.y * h)

                # 해당 좌표에 빨간색 원 그리기
                cv2.circle(frame, (nose_x, nose_y), 5, (0, 0, 255), -1) # 코
                cv2.circle(frame, (le_x, le_y), 5, (0, 0, 255), -1)     # 왼쪽 눈
                cv2.circle(frame, (re_x, re_y), 5, (0, 0, 255), -1)     # 오른쪽 눈

        cv2.imshow('Camera Feed', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
