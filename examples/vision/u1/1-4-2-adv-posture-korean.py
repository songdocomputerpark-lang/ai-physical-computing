# 라이브러리 불러오기
import cv2  # OpenCV 모듈 불러오기
import mediapipe as mp  # MediaPipe 모듈 불러오기
import numpy as np  # 수치 계산을 위한 NumPy 불러오기
from PIL import ImageFont, ImageDraw, Image  # 한글 출력을 위한 PIL 모듈 불러오기

# 포즈 인식 관련 모듈 불러오기
mp_pose = mp.solutions.pose  # Pose 모듈 불러오기
mp_drawing = mp.solutions.drawing_utils  # 랜드마크 시각화 유틸 불러오기
pose = mp_pose.Pose()  # Pose 모델 초기화

# 한글 폰트 설정
fontpath = "C:/Windows/Fonts/malgun.ttf"  # 시스템 내 맑은 고딕 폰트 경로
font = ImageFont.truetype(fontpath, 30)  # 폰트 크기 설정

# 웹캠 연결
cap = cv2.VideoCapture(0)  # 기본 웹캠 연결

# 자세 판단 기준 임계값 설정
THRESHOLD = 40  # 어깨 높이 차이 기준 (픽셀)

# 영상 처리 루프 시작
while cap.isOpened():  # 웹캠이 열려 있는 동안 반복
    ret, frame = cap.read()  # 프레임 읽기
    if not ret:
        break  # 프레임을 읽을 수 없으면 종료
    frame = cv2.flip(frame, 1)  # 좌우 반전

    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # BGR → RGB 색상 변환
    results = pose.process(image)  # 포즈 추정 수행
    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)  # 출력을 위해 다시 RGB → BGR로 색상 변환

    # 포즈가 감지되었을 때
    if results.pose_landmarks:
        h, w, _ = image.shape  # 이미지 높이, 너비 정보 가져오기
        landmarks = results.pose_landmarks.landmark  # 랜드마크 좌표 추출

        # 어깨 좌표 추출 및 픽셀 변환
        l_shoulder = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER]  # 왼쪽 어깨
        r_shoulder = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER]  # 오른쪽 어깨
        lx, ly = int(l_shoulder.x * w), int(l_shoulder.y * h)
        rx, ry = int(r_shoulder.x * w), int(r_shoulder.y * h)

        # 어깨 높이 차이 계산
        height_diff = abs(ly - ry)  # y좌표 차이 계산

        # 어깨를 연결하는 선 그리기
        cv2.line(image, (lx, ly), (rx, ry), (255, 255, 255), 2)  # 흰색 선

        # 각 어깨 위치에 빨간 점 표시
        cv2.circle(image, (lx, ly), 5, (0, 0, 255), -1)  # 왼쪽 어깨 점
        cv2.circle(image, (rx, ry), 5, (0, 0, 255), -1)  # 오른쪽 어깨 점

        pil_img = Image.fromarray(image)  # OpenCV → PIL 이미지 변환
        draw = ImageDraw.Draw(pil_img)  # PIL 드로잉 객체 생성

        if height_diff > THRESHOLD:
            draw.text((30, 50), "자세가 틀어졌습니다!", font=font, fill=(0, 255, 0))  # 경고 메시지 출력
        else:
            draw.text((30, 50), "바른 자세를 유지하고 있군요!", font=font, fill=(0, 255, 0))  # 정상 메시지 출력

        image = np.array(pil_img)  # PIL → OpenCV 이미지 복원

        # 전체 포즈 랜드마크 및 연결선 시각화
        mp_drawing.draw_landmarks(
            image,
            results.pose_landmarks,  # 랜드마크 좌표
            mp_pose.POSE_CONNECTIONS  # 연결선 정보
        )

    # 결과 영상 출력
    cv2.imshow('Posture Warning System', image)  # 실시간 영상 출력

    if cv2.waitKey(10) & 0xFF == ord('q'):  # 'q' 키를 누르면 종료
        break

# 자원 정리
cap.release()  # 웹캠 해제
cv2.destroyAllWindows()  # 모든 창 닫기
