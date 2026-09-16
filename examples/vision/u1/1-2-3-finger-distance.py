import cv2                      # 비디오 처리용 OpenCV 라이브러리
import mediapipe as mp          # 손 인식을 위한 MediaPipe 라이브러리
import math                     # 유클리드 거리 계산을 위한 수학 라이브러리

mp_hands = mp.solutions.hands               # 손 인식 모듈 객체
mp_drawing = mp.solutions.drawing_utils     # 손 관절 시각화를 위한 도구

hands = mp_hands.Hands()                    # 손 인식 객체 생성

cap = cv2.VideoCapture(0)  # 웹캠(0번 장치) 연결

while True:
    ret, frame = cap.read()               # 프레임 읽기
    if not ret:
        break                             # 실패 시 루프 종료

    frame = cv2.flip(frame, 1)            # 좌우 반전
    h, w, _ = frame.shape         		  # 영상 크기
    
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # RGB 변환

    result = hands.process(rgb)           # 손 랜드마크 추출

    if result.multi_hand_landmarks:       # 손이 감지된 경우
        for hand in result.multi_hand_landmarks:
            mp_drawing.draw_landmarks(frame, hand, mp_hands.HAND_CONNECTIONS)

            thumb = hand.landmark[4]      # 엄지 끝
            index = hand.landmark[8]      # 검지 끝
            
            x1, y1 = int(thumb.x * w), int(thumb.y * h) # 픽셀 좌표계로 변환
            x2, y2 = int(index.x * w), int(index.y * h) # 픽셀 좌표계로 변환

            distance = math.hypot(x2 - x1, y2 - y1)  # 유클리드 거리 계산

            cv2.line(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)  # 선 그리기
            
            # 거리 출력
            cv2.putText(frame, f'Distance: {int(distance)}', (10, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)  

    cv2.imshow('Hand Tracking', frame)      # 출력 화면
    if cv2.waitKey(1) == ord('q'):          # 'q' 키 누르면 종료
        break

cap.release()             # 카메라 종료
cv2.destroyAllWindows()   # 모든 창 닫기