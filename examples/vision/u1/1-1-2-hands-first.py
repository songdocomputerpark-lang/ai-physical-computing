import time                               # 시간 라이브러리 임포트 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2                                # OpenCV 라이브러리 임포트 (영상 처리용)
import mediapipe as mp                    # MediaPipe 라이브러리 임포트 (손 인식용)
from mediapipe.tasks.python import vision # MediaPipe 영상 인식 도구 모음

options = vision.HandLandmarkerOptions(                                         # 손 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'), # 손 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                      # 영상 모드: 프레임을 차례로 넣어요
    num_hands=2)                                                                # 손을 2개까지 찾기
hands = vision.HandLandmarker.create_from_options(options)  # 손 인식 모델 초기화
draw = vision.drawing_utils                                 # 손 관절 랜드마크를 화면에 그려주는 유틸 도구

cap = cv2.VideoCapture(0)                 # 웹캠(카메라 0번 장치) 열기

while True:                               # 무한 루프를 통해 실시간 영상 처리
    ret, img = cap.read()                 # 프레임 읽기 (ret: 성공 여부, img: 이미지 프레임)
    if not ret:                           # 프레임을 읽지 못했을 경우, 루프 종료
        break

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)                       # 색 순서를 BGR에서 RGB로 바꾼 사진
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)    # MediaPipe가 읽는 사진 형식으로 감싸기
    result = hands.detect_for_video(mp_img, int(time.time() * 1000))     # 지금 시각(밀리초)과 함께 손 인식 실행

    for hand in result.hand_landmarks:              # 인식된 손 각각에 대해 (손이 없으면 건너뜀)
        draw.draw_landmarks(                        # 이미지에 손 관절 및 연결선 그리기
            img,                                    # 원본 이미지
            hand,                                   # 손의 랜드마크 정보(점 21개)
            vision.HandLandmarksConnections.HAND_CONNECTIONS  # 손 관절 연결 구조
        )

    cv2.imshow('Hand', img)                        # 손 랜드마크가 표시된 이미지 화면에 출력

    if cv2.waitKey(1) == ord('q'):                 # 'q' 키를 누르면 루프 종료
        break

hands.close()                                      # 손 인식 모델 닫기
cap.release()                                      # 카메라(웹캠) 자원 해제
cv2.destroyAllWindows()                            # 모든 OpenCV 창 닫기

# ── 바꿔볼 것 3가지 ──
# 1. 9행의 num_hands=2를 num_hands=1로 바꿔 봐요. 재생 입력의 '두 손' 동작에서 빨간 점이 한 손에만 찍혀요.
# 2. 33행의 cv2.waitKey(1)을 cv2.waitKey(500)으로 바꿔 봐요. 화면이 0.5초에 한 번만 바뀌어 뚝뚝 끊겨 보여요.
# 3. 7행의 'hand_landmarker.task'를 'hand.task'로 바꾸고 실행해 봐요. 10행에서 FileNotFoundError가 나요. 오류 풀이를 읽고 되돌려요.
# ── 왜 이런 결과가 나올까 ──
# 10행은 6~9행의 설정대로 미리 학습된 손 인식 모델(hand_landmarker.task)을 준비해요. num_hands=2라 손을 두 개까지 찾아요.
# 반복문은 프레임(사진 한 장)을 읽을 때마다 손을 다시 찾아요. 22행의 hands.detect_for_video()가 손마다 관절 21곳의 위치(랜드마크)를 돌려주고, 25~29행이 그 점과 이음선을 그려요.
# 33행의 waitKey(1)은 1밀리초만 기다리고 다음 프레임으로 넘어가요. 500이면 0.5초씩 기다리니 1초에 두 장만 보여요.
# 손 인식 모델은 빨강, 초록, 파랑(RGB) 순서의 사진을 받아요. OpenCV는 파랑, 초록, 빨강(BGR) 순서로 읽으니 20행에서 순서를 바꾸고 21행에서 MediaPipe 사진 형식으로 감싸 넘겨요.
