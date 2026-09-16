# 라이브러리 불러오기
import cv2                        # OpenCV 모듈 불러오기
import mediapipe as mp            # MediaPipe 모듈 불러오기
import numpy as np                # NumPy 모듈 불러오기

# FaceMesh 모델 초기화하기
mp_face_mesh = mp.solutions.face_mesh    # FaceMesh 모듈 불러오기
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,             # 실시간 영상 모드 설정
    max_num_faces=1,                     # 최대 1명의 얼굴만 인식
    min_detection_confidence=0.5         # 얼굴 감지 신뢰도 설정
)                                        # FaceMesh 모델 초기화

# 마스크 이미지 불러오기
mask_image = cv2.imread("mask.png", cv2.IMREAD_UNCHANGED)  # 알파 채널 포함된 마스크 이미지 로드

# 웹캠 연결하기
cap = cv2.VideoCapture(0)               # 웹캠 연결

# 얼굴에 마스크를 합성하는 함수 정의
def overlay_mask_on_face(frame, landmarks, mask):           # 얼굴에 마스크 이미지를 합성하는 함수
    left_forehead = landmarks[10]                           # 이마 중심 좌표
    right_jaw = landmarks[152]                              # 턱 끝 좌표
    left_cheek = landmarks[234]                             # 왼쪽 뺨 좌표
    right_cheek = landmarks[454]                            # 오른쪽 뺨 좌표

    face_width = int(np.linalg.norm([
        left_cheek.x - right_cheek.x,
        left_cheek.y - right_cheek.y
    ]) * frame.shape[1])                                    # 얼굴 가로 길이 계산

    face_height = int(np.linalg.norm([
        left_forehead.x - right_jaw.x,
        left_forehead.y - right_jaw.y
    ]) * frame.shape[0])                                    # 얼굴 세로 길이 계산

    resized_mask = cv2.resize(mask, (face_width, face_height))  # 얼굴 크기에 맞게 마스크 이미지 크기 조절

    top_left_x = int(left_cheek.x * frame.shape[1])         # 마스크 시작 위치 x 좌표
    top_left_y = int(left_forehead.y * frame.shape[0])      # 마스크 시작 위치 y 좌표

    # 마스크 픽셀별로 원본 프레임에 합성
    for y in range(resized_mask.shape[0]):                  # 마스크 세로 방향 반복
        for x in range(resized_mask.shape[1]):              # 마스크 가로 방향 반복
            if top_left_y + y < frame.shape[0] and top_left_x + x < frame.shape[1]:  # 프레임 경계 확인
                alpha = resized_mask[y, x, 3] / 255.0        # 알파 채널 값 정규화
                for c in range(3):                           # RGB 채널 반복
                    frame[top_left_y + y, top_left_x + x, c] = (
                        alpha * resized_mask[y, x, c] +                         # 마스크 픽셀 색상
                        (1 - alpha) * frame[top_left_y + y, top_left_x + x, c] # 원본 프레임 색상
                    )
    return frame                                             # 합성된 프레임 반환

# 영상 처리 루프 시작
while cap.isOpened():                                       # 웹캠이 열려 있는 동안 반복
    ret, frame = cap.read()                                 # 프레임 읽기
    if not ret:
        break                                               # 프레임을 읽지 못하면 종료

    frame = cv2.flip(frame, 1)                              # 좌우 반전
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)      # BGR → RGB 색상 변환
    results = face_mesh.process(frame_rgb)                  # 얼굴 랜드마크 추출

    # 얼굴이 인식된 경우 마스크 합성
    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            landmarks = face_landmarks.landmark             # 전체 랜드마크 정보 가져오기
            frame = overlay_mask_on_face(frame, landmarks, mask_image)  # 얼굴에 마스크 합성

    cv2.imshow("Virtual Mask Filter", frame)                # 결과 영상 출력

    if cv2.waitKey(1) & 0xFF == ord('q'):                   # 'q' 키를 누르면 종료
        break

# 자원 정리
cap.release()                                               # 웹캠 해제
cv2.destroyAllWindows()                                     # 모든 창 닫기
