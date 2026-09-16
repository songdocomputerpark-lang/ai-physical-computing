import cv2                                # OpenCV 라이브러리 임포트 (영상 처리용)
import mediapipe as mp                    # MediaPipe 라이브러리 임포트 (손 인식용)

hands = mp.solutions.hands.Hands()        # 손 인식 모델 초기화
draw = mp.solutions.drawing_utils         # 손 관절 랜드마크를 화면에 그려주는 유틸 도구

cap = cv2.VideoCapture(0)                 # 웹캠(카메라 0번 장치) 열기

while True:                               # 무한 루프를 통해 실시간 영상 처리
    ret, img = cap.read()                 # 프레임 읽기 (ret: 성공 여부, img: 이미지 프레임)
    if not ret:                           # 프레임을 읽지 못했을 경우, 루프 종료
        break

    result = hands.process(img)                 # 손 인식 실행하여 결과 객체 반환

    if result.multi_hand_landmarks:                 # 손이 인식된 경우
        for hand in result.multi_hand_landmarks:    # 인식된 손 각각에 대해
            draw.draw_landmarks(                    # 이미지에 손 관절 및 연결선 그리기
                img,                                # 원본 이미지
                hand,                               # 손의 랜드마크 정보
                mp.solutions.hands.HAND_CONNECTIONS # 손 관절 연결 구조
            )
            
    cv2.imshow('Hand', img)                        # 손 랜드마크가 표시된 이미지 화면에 출력

    if cv2.waitKey(1) == ord('q'):                 # 'q' 키를 누르면 루프 종료
        break

cap.release()                                      # 카메라(웹캠) 자원 해제
cv2.destroyAllWindows()                            # 모든 OpenCV 창 닫기