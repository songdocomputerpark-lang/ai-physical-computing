# 1차시 1-2: 기본 과제 (얼굴 인식 및 특징점 찾기)
import cv2
import mediapipe as mp

# MediaPipe의 얼굴 그물망(Face Mesh)과 그리기 관련 도구 준비
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils

# 웹캠을 비디오 소스로 사용
cap = cv2.VideoCapture(0)

# Face Mesh 모델 초기화
with mp_face_mesh.FaceMesh(
    max_num_faces=1, # 최대 1개의 얼굴만 인식
    refine_landmarks=True, # 눈, 입술 주변 랜드마크 더 정교하게
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5) as face_mesh:

    while True:
        success, frame = cap.read()
        if not success:
            break

        # 성능 향상을 위해 이미지를 읽기 전용으로 변경
        frame.flags.writeable = False
        # MediaPipe가 처리할 수 있도록 이미지 색상 순서 변경 (BGR -> RGB)
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 이미지에서 얼굴 특징점 처리
        results = face_mesh.process(image_rgb)

        # 다시 화면에 표시하기 위해 이미지 쓰기 허용 및 색상 복원 (RGB -> BGR)
        frame.flags.writeable = True
        frame = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        # 얼굴 특징점이 감지되었다면
        if results.multi_face_landmarks:
            for face_landmarks in results.multi_face_landmarks:
                # 얼굴에 그물망 그리기
                mp_drawing.draw_landmarks(
                    image=frame,
                    landmark_list=face_landmarks,
                    connections=mp_face_mesh.FACEMESH_TESSELATION, # 그물망 연결선
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing.DrawingSpec
                    (color=(0,255,0), thickness=1) # 초록색 선
                )

        cv2.imshow('Camera Feed', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()