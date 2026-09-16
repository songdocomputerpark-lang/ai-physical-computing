import cv2
import mediapipe as mp  # 미디어파이프 라이브러리를 mp로 명명하여 사용

# MediaPipe Hands 초기화
mp_hands = mp.solutions.hands  # mp.solutions.hands를 mp_hands로 명명하여 사용
hands = mp_hands.Hands(static_image_mode=False, 
                       max_num_hands=1, 
                       min_detection_confidence=0.5)  # 손 인식을 위한 설정 초기화

mp_drawing = mp.solutions.drawing_utils  # mp_drawing으로 명명하여 사용

video = cv2.VideoCapture(0) # 웹캠 연결

while True:
    ret, frame = video.read()  # 프레임 읽기
    if not ret: # 프레임 읽기에 실패하면 종료
        break

    frame = cv2.flip(frame, 1)  # 좌우 반전 (거울 모드)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb_frame)  # 손 인식

    if result.multi_hand_landmarks:  # 여러 손의 랜드마크가 감지되었는지 확인
        for hand_landmarks in result.multi_hand_landmarks: # 손 관절(랜드마크)마다 반복
            # 손 관절(랜드마크)와 연결선을 그리기
            mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

    cv2.imshow('Hand Tracking', frame)  # 프레임 출력

    if cv2.waitKey(30) == ord('q'):   # 30 ms마다 q 키를 누르는지 확인
        break

video.release()   # 웹캠 장치 해제
cv2.destroyAllWindows() # 창 닫기