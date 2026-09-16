import cv2                 # OpenCV: 이미지 처리와 웹캠 사용
import mediapipe as mp     # MediaPipe: 손가락 추적
import numpy as np         # NumPy: 배열(이미지 도화지) 처리

# MediaPipe의 손 인식 모듈 초기화
mp_hands = mp.solutions.hands
hands = mp_hands.Hands()   # 기본 설정 (한 손만 인식)


canvas = None              # 손가락으로 그릴 도화지 (배경)
prev_x, prev_y = 0, 0      # 이전 프레임의 손가락 위치 (선을 그릴 때 사용)


cap = cv2.VideoCapture(0) # 웹캠 열기

while True:
    ret, frame = cap.read()      # 웹캠 프레임 읽기
    if not ret:
        break                    # 프레임 읽기 실패 시 종료

    frame = cv2.flip(frame, 1)   # 좌우 반전 (거울처럼 보이게)
    h, w, _ = frame.shape        # 프레임의 높이(h), 너비(w) 구하기

    # 도화지가 아직 없으면, 프레임과 같은 크기의 검은 화면 생성
    if canvas is None:
        canvas = np.zeros_like(frame)

    # 손 인식을 위해 색공간을 RGB로 변환
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb)  # 손 관절 인식 수행

    # 손이 화면에 감지되었을 경우
    if result.multi_hand_landmarks:
        # 첫 번째 손의 관절 리스트 가져오기
        lm = result.multi_hand_landmarks[0].landmark

        # 검지 손가락 끝(8번 랜드마크)의 x, y 위치 계산 (픽셀 좌표로 변환)
        x = int(lm[8].x * w)
        y = int(lm[8].y * h)
        
        # 이전 위치가 있다면, 이전 위치와 현재 위치를 선으로 연결
        if prev_x != 0 and prev_y != 0:
            cv2.line(canvas, (prev_x, prev_y), (x, y), (0, 255, 0), 3)

        # 현재 좌표를 다음 프레임을 위한 이전 좌표로 저장
        prev_x, prev_y = x, y
    else:
        # 손이 화면에 없으면 선 그리기 멈춤
        prev_x, prev_y = 0, 0


    # 실제 화면과 캔버스를 반반(0,5, 0.5) 합성해서 보여주기
    output = cv2.addWeighted(frame, 0.5, canvas, 0.5, 0)
    cv2.imshow("Draw", output)  # 화면 출력
    
    if cv2.waitKey(1) == ord('q'): # 'q' 키를 누르면 종료
        break

# 웹캠과 창 닫기
cap.release()
cv2.destroyAllWindows()