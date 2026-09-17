# ▶ 라이브러리 불러오기
import cv2          # OpenCV: 실시간 영상 처리 및 출력용 라이브러리
import mediapipe as mp # MediaPipe: 손 랜드마크 검출 라이브러리
import pyautogui    # PyAutoGUI: 키보드/마우스 제어 (마우스 커서 이동) 라이브러리

# ▶ MediaPipe 손 인식 모델 초기화
mp_hands = mp.solutions.hands  # MediaPipe hands 모듈 가져오기
hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7) # 손 1개만 처리, 최소 감지 신뢰도 설정
mp_draw = mp.solutions.drawing_utils  # 손 랜드마크를 그리기 위한 유틸리티 가져오기

# ▶ 화면 해상도 가져오기
screen_width, screen_height = pyautogui.size() # 현재 모니터의 가로 및 세로 해상도 픽셀 값 가져오기

# ▶ 웹캠 연결
cap = cv2.VideoCapture(0)  # 0번 카메라(내장 웹캠)와 연결

# ▶ 프레임 반복 처리 루프
while cap.isOpened():  # 웹캠이 열려있는 동안 계속 반복
    success, image = cap.read()  # 한 프레임 읽기
    if not success:              # 프레임을 못 읽었으면
        break                    # 반복 종료

    image = cv2.flip(image, 1)  # 좌우 반전 → 사용자 거울처럼 보기 위함
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  # BGR → RGB로 변환 (MediaPipe는 RGB 사용)

    # ▶ MediaPipe 손 인식 실행
    result = hands.process(image_rgb)  # 손 랜드마크 검출

    # ▶ 손이 인식된 경우 → 검지손가락 좌표 추출 및 마우스 커서 이동
    if result.multi_hand_landmarks:  # 손이 검출되면
        for hand_landmarks in result.multi_hand_landmarks:  # 검출된 각 손마다 반복 (여기선 1개)
            # 손 랜드마크와 연결선 그리기
            mp_draw.draw_landmarks(image, hand_landmarks, mp_hands.HAND_CONNECTIONS)

            # 검지손가락 끝(INDEX_FINGER_TIP) 랜드마크의 좌표 가져오기
            index_tip = hand_landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_TIP]

            # 검지손가락의 정규화된 좌표(0.0~1.0)를 실제 화면 픽셀 좌표로 변환
            # 웹캠 영상의 크기가 아닌, 실제 모니터 해상도에 맞춰 변환하여 마우스 커서 이동
            finger_x = int(index_tip.x * screen_width)  # 검지 x 좌표를 화면 너비에 맞춰 변환
            finger_y = int(index_tip.y * screen_height) # 검지 y 좌표를 화면 높이에 맞춰 변환

            # ▶ 마우스 커서 이동
            pyautogui.moveTo(finger_x, finger_y)  # 계산된 픽셀 좌표로 마우스 커서 이동

    # ▶ 영상 출력 및 종료 조건 체크
    cv2.imshow("Mouse Control", image)  # "Mouse Control" 창에 결과 영상 띄우기

    # 'q' 키를 누르면 종료
    if cv2.waitKey(5) & 0xFF == ord('q'): # 5밀리초 대기 후 'q' 키 입력 시 종료
        break

# ▶ 자원 해제
cap.release()               # 웹캠 연결 해제
cv2.destroyAllWindows()     # 모든 OpenCV 창 닫기