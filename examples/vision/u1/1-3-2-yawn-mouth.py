# ▶ 라이브러리 불러오기
import cv2                # OpenCV: 실시간 영상 처리 및 출력용 라이브러리
import mediapipe as mp    # MediaPipe: 얼굴 랜드마크 검출 라이브러리

# ▶ FaceMesh 모델 초기화
mp_face_mesh = mp.solutions.face_mesh  # MediaPipe face_mesh 모듈 가져오기
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1)  # 얼굴 1명만 처리하도록 설정

# ▶ 웹캠 연결
cap = cv2.VideoCapture(0)  # 0번 카메라(내장 웹캠)와 연결

# ▶ 입 주변 랜드마크 인덱스 설정
# 13, 14는 윗입술/아랫입술 중심점
# 19, 18은 입 상하 근처
# 78, 308은 입 좌우 양 끝
MOUTH_LANDMARKS = [13, 14, 19, 18, 78, 308]

# ▶ 프레임 반복 처리 루프
while cap.isOpened():  # 웹캠이 열려있는 동안 계속 반복
    ret, frame = cap.read()  # 한 프레임 읽기
    if not ret:              # 프레임을 못 읽었으면
        break                # 반복 종료

    frame = cv2.flip(frame, 1)  # 좌우 반전 → 사용자 거울처럼 보기 위함

    h, w, _ = frame.shape      # 프레임 높이(h), 너비(w) 정보 가져오기
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # BGR → RGB로 변환
    results = face_mesh.process(frame_rgb)              # 얼굴 랜드마크 검출

    # ▶ 얼굴이 인식된 경우 → 입 좌표 추출 및 시각화
    if results.multi_face_landmarks:  # 얼굴이 검출되면
        for face_landmarks in results.multi_face_landmarks:  # 얼굴마다 반복 (여기선 1명)
            for idx in MOUTH_LANDMARKS:  # 지정한 입 주변 랜드마크 인덱스 순회
                pt = face_landmarks.landmark[idx]       # idx번째 랜드마크 정보 가져오기
                x, y = int(pt.x * w), int(pt.y * h)     # 정규화된 좌표 → 실제 영상 좌표로 변환
                cv2.circle(frame, (x, y), 2, (0, 255, 255), -1)  # 해당 위치에 노란색 점 찍기

    # ▶ 영상 출력 및 종료 조건 체크
    cv2.imshow("Mouth Landmarks", frame)               # "Mouth Landmarks" 창에 결과 영상 띄우기
    if cv2.waitKey(1) & 0xFF == ord('q'):              # 키보드 'q' 입력 시 종료
        break

# ▶ 자원 해제
cap.release()               # 웹캠 연결 해제
cv2.destroyAllWindows()     # 모든 OpenCV 창 닫기
