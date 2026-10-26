# ▶ 라이브러리 불러오기
import time         # time: 영상 프레임마다 시각을 붙이는 데 쓰는 라이브러리
import cv2          # OpenCV: 실시간 영상 처리 및 출력용 라이브러리
import mediapipe as mp # MediaPipe: 손 랜드마크 검출 라이브러리
from mediapipe.tasks.python import vision # MediaPipe 영상 인식 도구 모음
import pyautogui    # PyAutoGUI: 스크린샷 기능을 위한 라이브러리

# ▶ MediaPipe 손 인식 모델 초기화
options = vision.HandLandmarkerOptions(                                         # 손 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'), # 손 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                      # 영상 모드: 프레임을 차례로 넣어요
    num_hands=1,                                                                # 손 1개만 처리
    min_hand_detection_confidence=0.7)                                          # 최소 감지 신뢰도 설정
hands = vision.HandLandmarker.create_from_options(options)  # 손 인식 모델 준비
mp_draw = vision.drawing_utils  # 손 랜드마크를 그리기 위한 유틸리티 가져오기

# ▶ 웹캠 연결
cap = cv2.VideoCapture(0)  # 0번 카메라(내장 웹캠)와 연결

# ▶ 프레임 반복 처리 루프
while cap.isOpened():  # 웹캠이 열려있는 동안 계속 반복
    success, image = cap.read()  # 한 프레임 읽기
    if not success:              # 프레임을 못 읽었으면
        break                    # 반복 종료

    image = cv2.flip(image, 1)  # 좌우 반전 → 사용자 거울처럼 보기 위함
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  # BGR → RGB로 변환 (MediaPipe는 RGB 사용)

    # ▶ 손 인식 처리
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)  # MediaPipe가 읽는 사진 형식으로 감싸기
    result = hands.detect_for_video(mp_img, int(time.time() * 1000))     # 지금 시각(밀리초)과 함께 손 랜드마크 검출

    # ▶ 손이 인식된 경우 → 손 좌표 추출 및 제스처 판별
    if result.hand_landmarks:  # 손이 검출되면
        for hand_landmarks in result.hand_landmarks:  # 검출된 각 손마다 반복 (여기선 1개)
            mp_draw.draw_landmarks(image, hand_landmarks, vision.HandLandmarksConnections.HAND_CONNECTIONS) # 손 랜드마크와 연결선 그리기

            # 엄지손가락과 검지손가락 끝 지점의 좌표 가져오기
            thumb_tip = hand_landmarks[4]  # 4번 점: 엄지 끝(THUMB_TIP)
            index_tip = hand_landmarks[8]  # 8번 점: 검지 끝(INDEX_FINGER_TIP)

            # 제스처 판별: 엄지손가락 끝이 검지손가락 끝보다 위에 있으면 스크린샷 촬영
            if thumb_tip.y < index_tip.y:  # 엄지 Y좌표가 검지 Y좌표보다 작으면 (Y축은 아래로 갈수록 증가)
                pyautogui.screenshot("screenshot.png")  # 현재 화면 스크린샷을 "screenshot.png"로 저장
                cv2.putText(image, "Screenshot Captured!", (10, 70),  # 화면에 텍스트 출력
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    # ▶ 영상 출력 및 종료 조건 체크
    cv2.imshow("Hand Gesture Screenshot", image)  # "Hand Gesture Screenshot" 창에 결과 영상 띄우기
    if cv2.waitKey(5) & 0xFF == ord('q'):         # 5밀리초 대기 후 'q' 키 입력 시 종료
        break

# ▶ 자원 해제
hands.close()               # 손 인식 모델 닫기
cap.release()               # 웹캠 연결 해제
cv2.destroyAllWindows()     # 모든 OpenCV 창 닫기
