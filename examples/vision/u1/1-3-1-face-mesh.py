# 라이브러리 불러오기
import cv2
import mediapipe as mp

# 웹캠 연결 및 FaceMesh 초기화
cap = cv2.VideoCapture(0)
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1)

# 영상 처리 루프 시작
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("프레임을 가져올 수 없습니다.")
        continue

    # 좌우 반전 및 색상 변환
    frame = cv2.flip(frame, 1)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)

    # 얼굴이 인식된 경우 랜드마크 출력
    if results.multi_face_landmarks:
        for landmark in results.multi_face_landmarks[0].landmark:
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
cap.release()
cv2.destroyAllWindows()
