# 라이브러리 불러오기
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

# 영상 처리 루프 시작
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("프레임을 가져올 수 없습니다.")
        continue

    # 좌우 반전 및 색상 변환
    frame = cv2.flip(frame, 1)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)    # MediaPipe가 읽는 사진 형식으로 감싸기
    results = face_mesh.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 얼굴 인식

    # 얼굴이 인식된 경우 랜드마크 출력
    if results.face_landmarks:
        for landmark in results.face_landmarks[0]:
            h, w = frame.shape[:2]
            x = int(landmark.x * w)
            y = int(landmark.y * h)
            cv2.circle(frame, (x, y), 1, (0, 255, 0), -1)

    # 결과 영상 출력
    cv2.imshow("FaceMesh Landmarks", frame)

    # 'q' 키를 누르면 종료
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# 자원 정리
face_mesh.close()        # 얼굴 인식 모델 닫기
cap.release()
cv2.destroyAllWindows()
