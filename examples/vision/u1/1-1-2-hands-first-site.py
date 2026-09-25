import cv2                                # OpenCV 라이브러리 임포트 (영상 처리용)
import mediapipe as mp                    # MediaPipe 라이브러리 임포트 (손 인식용)

hands = mp.solutions.hands.Hands()        # 손 인식 모델 초기화
draw = mp.solutions.drawing_utils         # 손 관절 랜드마크를 화면에 그려주는 유틸 도구

cap = cv2.VideoCapture(0)                 # 웹캠(카메라 0번 장치) 열기

while True:                               # 무한 루프를 통해 실시간 영상 처리
    ret, img = cap.read()                 # 프레임 읽기 (ret: 성공 여부, img: 이미지 프레임)
    if not ret:                           # 프레임을 읽지 못했을 경우, 루프 종료
        break
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)  # [사이트판] 색 순서를 BGR에서 RGB로 바꾼 사진(원고 14행이 쓰는 img_rgb)
    result = hands.process(img_rgb)             # 손 인식 실행하여 결과 객체 반환([사이트판] img 대신 img_rgb)

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

# ── 바꿔볼 것 3가지 ──
# 1. 4행을 hands = mp.solutions.hands.Hands(max_num_hands=1)로 바꿔 봐요. 재생 입력의 '두 손' 동작에서 빨간 점이 한 손에만 찍혀요.
# 2. 26행의 cv2.waitKey(1)을 cv2.waitKey(500)으로 바꿔 봐요. 화면이 0.5초에 한 번만 바뀌어 뚝뚝 끊겨 보여요.
# 3. 13행의 글자를 모두 지워 빈 줄로 만들고 실행해 봐요. 교과서 017쪽 코드와 똑같아져서 14행에서 NameError가 나요. 오류 풀이를 읽고 되돌려요.
# ── 왜 이런 결과가 나올까 ──
# 4행의 Hands()는 미리 학습된 손 인식 모델을 준비해요. 괄호를 비우면 손을 두 개까지 찾아요.
# 반복문은 프레임(사진 한 장)을 읽을 때마다 손을 다시 찾아요. 14행의 hands.process()가 손마다 관절 21곳의 위치(랜드마크)를 돌려주고, 18~22행이 그 점과 이음선을 그려요.
# 26행의 waitKey(1)은 1밀리초만 기다리고 다음 프레임으로 넘어가요. 500이면 0.5초씩 기다리니 1초에 두 장만 보여요.
# 손 인식 모델은 빨강, 초록, 파랑(RGB) 순서의 사진을 받아요. OpenCV는 파랑, 초록, 빨강(BGR) 순서로 읽으니 13행에서 순서를 바꿔 넘겨요.
