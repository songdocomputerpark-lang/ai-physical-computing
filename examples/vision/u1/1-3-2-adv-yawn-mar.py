# ▶ 라이브러리 불러오기
import time               # time: 영상 프레임마다 시각을 붙이는 데 사용
import cv2                # OpenCV: 실시간 영상 처리 및 표시
import mediapipe as mp    # MediaPipe: 얼굴 랜드마크 검출
from mediapipe.tasks.python import vision  # MediaPipe 영상 인식 도구 모음
import math               # math.sqrt()로 거리 계산에 사용

# ▶ 입 모양 비율(MAR) 계산 함수 정의
def calculate_mar(mouth_landmarks):  # mouth_landmarks: 입 주변 6개 포인트 좌표 리스트
    # 위-아래 거리 두 개 계산
    vertical_1 = math.sqrt((mouth_landmarks[0][0] - mouth_landmarks[2][0])**2 +
                           (mouth_landmarks[0][1] - mouth_landmarks[2][1])**2)
    vertical_2 = math.sqrt((mouth_landmarks[1][0] - mouth_landmarks[3][0])**2 +
                           (mouth_landmarks[1][1] - mouth_landmarks[3][1])**2)
    # 좌-우 거리 계산
    horizontal = math.sqrt((mouth_landmarks[4][0] - mouth_landmarks[5][0])**2 +
                           (mouth_landmarks[4][1] - mouth_landmarks[5][1])**2)
    # MAR 계산: 평균 수직 길이 ÷ 수평 길이
    mar = (vertical_1 + vertical_2) / (2.0 * horizontal)
    return mar

# ▶ MediaPipe FaceLandmarker(얼굴 그물 인식) 초기화
options = vision.FaceLandmarkerOptions(                                          # FaceLandmarker 모델 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='face_landmarker.task'),  # 얼굴 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,    # 동영상 모드: 프레임을 차례로 넣어요
    num_faces=1,                              # 얼굴 1명만 인식
    min_face_detection_confidence=0.5         # 최소 얼굴 검출 신뢰도
)
face_mesh = vision.FaceLandmarker.create_from_options(options)  # 얼굴 인식 모델 준비

# ▶ OpenCV 웹캠 연결
cap = cv2.VideoCapture(0)  # 0번 카메라(내장 웹캠) 연결

# ▶ 하품 감지를 위한 변수 설정
MOUTH_LANDMARKS = [13, 14, 19, 18, 78, 308]  # 입 상하 중심 및 좌우 끝 포인트
MAR_THRESHOLD = 0.4                          # MAR이 이 값 이상이면 하품으로 판단
CONSECUTIVE_FRAMES = 5                       # 몇 프레임 이상 지속되면 하품으로 인정

yawn_frames = 0                              # 연속된 하품 상태 프레임 수
yawn_count = 0                               # 총 하품 횟수

# ▶ 하품 감지 실패 시 프레임 수 초기화 함수
def reset_yawn_frames():
    global yawn_frames
    yawn_frames = 0  # 연속 프레임 카운트 초기화

# ▶ 프레임 반복 처리 루프
while cap.isOpened():  # 웹캠이 열려있는 동안 반복
    ret, frame = cap.read()  # 프레임 읽기
    if not ret:              # 프레임을 못 읽었으면
        break                # 반복 종료

    frame = cv2.flip(frame, 1)                # 좌우 반전 → 사용자 거울처럼 보이게
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # BGR → RGB로 변환
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)    # MediaPipe가 읽는 사진 형식으로 감싸기
    results = face_mesh.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 얼굴 랜드마크 검출

    frame_height, frame_width, _ = frame.shape  # 프레임 크기 정보 가져오기

    # ▶ 얼굴이 인식된 경우
    if results.face_landmarks:  # 얼굴이 검출되었을 때
        for face_landmarks in results.face_landmarks:  # 얼굴마다 반복(여기선 1명)
            landmarks = face_landmarks  # 얼굴의 랜드마크 정보(점 478개의 리스트)

            try:
                # ▶ 입 좌표 추출
                mouth_points = [(int(landmarks[idx].x * frame_width),
                                 int(landmarks[idx].y * frame_height)) for idx in MOUTH_LANDMARKS]
                # ▶ MAR 계산
                mar = calculate_mar(mouth_points)
                # ▶ 현재 MAR 값 화면에 출력
                cv2.putText(frame, f"MAR: {mar:.2f}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

                # ▶ 하품 판단
                if mar > MAR_THRESHOLD:  # MAR이 기준값 이상이면
                    yawn_frames += 1     # 연속된 하품 상태 프레임 증가
                else:
                    if yawn_frames >= CONSECUTIVE_FRAMES:  # 연속된 프레임 수가 기준 이상이면
                        yawn_count += 1  # 하품 횟수 +1
                    reset_yawn_frames()  # 연속 카운트 초기화

                # ▶ 하품 횟수 화면에 출력
                cv2.putText(frame, f"Yawns: {yawn_count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

                # ▶ 입 랜드마크 시각화
                for point in mouth_points:
                    cv2.circle(frame, point, 2, (255, 0, 0), -1)

            except IndexError:
                # 랜드마크가 누락된 경우(일부 포인트 인식 실패) → 초기화
                reset_yawn_frames()

    # ▶ 영상 출력
    cv2.imshow("Yawn Detection", frame)  # 결과 영상 띄우기

    # ▶ 종료 조건: 'q' 키를 누르면 종료
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ▶ 자원 정리
face_mesh.close()           # 얼굴 인식 모델 닫기
cap.release()               # 웹캠 연결 해제
cv2.destroyAllWindows()     # 모든 OpenCV 창 닫기
