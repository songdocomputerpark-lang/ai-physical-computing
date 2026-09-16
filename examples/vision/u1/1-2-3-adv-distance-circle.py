# 필요한 라이브러리 불러오기
import cv2                      # OpenCV: 영상 처리 라이브러리
import mediapipe as mp          # MediaPipe: 손 인식 라이브러리
import math                     # 수학 계산을 위한 라이브러리 (거리 계산용)

# MediaPipe의 손 인식 도구 불러오기
mp_hands = mp.solutions.hands                  # 손을 인식하는 모듈
mp_drawing = mp.solutions.drawing_utils        # 인식된 손의 선과 점을 화면에 표시하는 도구

# Hands 객체 생성 (기본 설정 사용)
hands = mp_hands.Hands()

# 웹캠에서 영상 가져오기 (카메라 장치 번호 0번 사용)
cap = cv2.VideoCapture(0)

# 무한 반복문: 실시간 영상 처리
while True:
    ret, frame = cap.read()        # 한 프레임씩 읽어오기
    if not ret:                    # 프레임을 제대로 못 읽으면 종료
        break

    frame = cv2.flip(frame, 1)     # 좌우 반전 (거울처럼 보이게 함)
    h, w, _ = frame.shape          # 프레임의 높이(h), 너비(w) 저장
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # OpenCV의 BGR을 RGB로 변환 (MediaPipe는 RGB 사용)

    result = hands.process(rgb)    # 손의 랜드마크(관절 위치) 인식 처리

    # 손이 인식된 경우
    if result.multi_hand_landmarks:
        for hand in result.multi_hand_landmarks:
            # 손의 랜드마크(관절)와 연결선 그리기
            mp_drawing.draw_landmarks(frame, hand, mp_hands.HAND_CONNECTIONS)

            # 엄지(4번), 검지(8번) 끝의 랜드마크 가져오기
            thumb = hand.landmark[4]
            index = hand.landmark[8]

            # 랜드마크 좌표는 0~1 사이의 비율로 되어 있음 → 화면 크기에 맞게 변환
            x1, y1 = int(thumb.x * w), int(thumb.y * h)   # 엄지 위치
            x2, y2 = int(index.x * w), int(index.y * h)   # 검지 위치

            # 엄지와 검지 사이의 거리 계산 (유클리드 거리)
            distance = int(math.hypot(x2 - x1, y2 - y1))

            # 거리 값을 반지름으로 사용하여 화면 중앙에 원 그리기
            cx, cy = w // 2, h // 2        # 화면 중앙 좌표 계산
            cv2.circle(frame, (cx, cy), distance, (0, 255, 255), 3)  # 노란 원

            # 거리 값을 화면 왼쪽 위에 텍스트로 출력
            cv2.putText(frame, f'Distance: {distance}', (10, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

    # 결과 프레임 화면에 출력
    cv2.imshow('Circle with Distance', frame)

    # 키보드에서 'q' 키를 누르면 종료
    if cv2.waitKey(1) == ord('q'):
        break

# 사용한 자원 해제
cap.release()             # 카메라 장치 해제
cv2.destroyAllWindows()   # 모든 OpenCV 창 닫기