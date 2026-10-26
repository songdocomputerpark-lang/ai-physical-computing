# 라이브러리 불러오기
import time  # 시간 모듈 불러오기 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2  # OpenCV 모듈 불러오기
import mediapipe as mp  # MediaPipe 모듈 불러오기
from mediapipe.tasks.python import vision  # MediaPipe 영상 인식 도구 모음 불러오기

# 웹캠 연결 및 FaceLandmarker(얼굴 그물 인식) 초기화
cap = cv2.VideoCapture(0)  # 웹캠 연결
options = vision.FaceLandmarkerOptions(  # 얼굴 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='face_landmarker.task'),  # 얼굴 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,  # 영상 모드: 프레임을 차례로 넣어요
    num_faces=1)  # 최대 1명 얼굴만 인식
face_mesh = vision.FaceLandmarker.create_from_options(options)  # 얼굴 인식 모델 준비

# 영상 처리 루프 시작
while cap.isOpened():  # 웹캠이 열려 있는 동안 반복
    ret, frame = cap.read()  # 프레임 읽기
    if not ret:
        break  # 프레임을 읽을 수 없으면 종료

    frame = cv2.flip(frame, 1)  # 좌우 반전
    h, w, _ = frame.shape  # 영상의 높이(h)와 너비(w) 정보 저장
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # BGR → RGB 색상 변환
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)  # MediaPipe가 읽는 사진 형식으로 감싸기
    results = face_mesh.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 얼굴 랜드마크 추출

    # 얼굴이 인식된 경우 랜드마크 출력
    if results.face_landmarks:  # 얼굴이 인식된 경우
        for face_landmarks in results.face_landmarks:
            landmarks = face_landmarks  # 얼굴 랜드마크 정보(점 478개의 리스트)

            # 얼굴 주요 좌표 추출
            left = landmarks[234]  # 얼굴 왼쪽 경계점
            right = landmarks[454]  # 얼굴 오른쪽 경계점
            top = landmarks[10]  # 얼굴 위쪽 경계점
            bottom = landmarks[152]  # 얼굴 아래쪽 경계점

            # 정규화 좌표 → 픽셀 좌표로 변환
            x1, y1 = int(left.x * w), int(top.y * h)  # 좌상단 점
            x2, y2 = int(right.x * w), int(bottom.y * h)  # 우하단 점

            # 얼굴 박스 시각화
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)  # 초록 사각형 그리기

    # 결과 영상 출력
    cv2.imshow("Face Bounding Box", frame)  # 실시간 영상 출력

    if cv2.waitKey(1) & 0xFF == ord('q'):  # 'q' 키를 누르면 종료
        break

# 자원 정리
face_mesh.close()  # 얼굴 인식 모델 닫기
cap.release()  # 웹캠 해제
cv2.destroyAllWindows()  # 모든 창 닫기
