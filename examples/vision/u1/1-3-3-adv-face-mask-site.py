# 1-3-3 심화 실습(사이트판): 얼굴에 가면 그림 씌우기
# 교과서 코드와 결과는 같지만, 픽셀을 하나씩 세는 부분을 numpy 한 번 계산으로 바꿔 실습실에서도 영상이 끊기지 않아요.
# @lesson 1-3-3
# @tags 얼굴, 필터, 이미지 합성, 사이트판
#
# 교과서 원본은 examples/vision/u1/1-3-3-adv-face-mask.py예요(줄 번호가 교과서와 같아요).
# 바뀐 곳에는 모두 "[사이트판]"이라고 적어 두었어요(PD-10).

# 라이브러리 불러오기
import cv2                        # OpenCV 모듈 불러오기
import mediapipe as mp            # MediaPipe 모듈 불러오기
import numpy as np                # NumPy 모듈 불러오기

# FaceMesh 모델 초기화하기
mp_face_mesh = mp.solutions.face_mesh    # FaceMesh 모듈 불러오기
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,             # 실시간 영상 모드 설정
    max_num_faces=1,                     # 최대 1명의 얼굴만 인식
    min_detection_confidence=0.5         # 얼굴 감지 신뢰도 설정
)                                        # FaceMesh 모델 초기화

# 마스크 이미지 불러오기 — 실습실이 작업 폴더에 넣어 준 사이트 그림이에요(파일 패널에서 볼 수 있어요)
mask_image = cv2.imread("mask.png", cv2.IMREAD_UNCHANGED)  # 알파 채널 포함된 마스크 이미지 로드

# 웹캠 연결하기
cap = cv2.VideoCapture(0)               # 웹캠 연결

# 얼굴에 마스크를 합성하는 함수 정의
def overlay_mask_on_face(frame, landmarks, mask):           # 얼굴에 마스크 이미지를 합성하는 함수
    left_forehead = landmarks[10]                           # 이마 중심 좌표
    right_jaw = landmarks[152]                              # 턱 끝 좌표
    left_cheek = landmarks[234]                             # 왼쪽 뺨 좌표
    right_cheek = landmarks[454]                            # 오른쪽 뺨 좌표

    face_width = int(np.linalg.norm([
        left_cheek.x - right_cheek.x,
        left_cheek.y - right_cheek.y
    ]) * frame.shape[1])                                    # 얼굴 가로 길이 계산

    face_height = int(np.linalg.norm([
        left_forehead.x - right_jaw.x,
        left_forehead.y - right_jaw.y
    ]) * frame.shape[0])                                    # 얼굴 세로 길이 계산

    # [사이트판] 얼굴이 너무 작거나 화면 밖이면 그냥 넘어가요(원본은 여기서 cv2.resize 오류가 나요)
    if face_width < 2 or face_height < 2:
        return frame

    resized_mask = cv2.resize(mask, (face_width, face_height))  # 얼굴 크기에 맞게 마스크 이미지 크기 조절

    top_left_x = int(left_cheek.x * frame.shape[1])         # 마스크 시작 위치 x 좌표
    top_left_y = int(left_forehead.y * frame.shape[0])      # 마스크 시작 위치 y 좌표

    # [사이트판] 화면 안에 들어오는 만큼만 잘라요(원본의 if 두 줄과 같은 일을 미리 한 번에 해요)
    x0 = max(0, top_left_x)
    y0 = max(0, top_left_y)
    x1 = min(frame.shape[1], top_left_x + resized_mask.shape[1])
    y1 = min(frame.shape[0], top_left_y + resized_mask.shape[0])
    if x1 <= x0 or y1 <= y0:
        return frame
    piece = resized_mask[y0 - top_left_y:y1 - top_left_y, x0 - top_left_x:x1 - top_left_x]

    # [사이트판] 원본은 픽셀마다 3중 반복(세로 × 가로 × 색 3개)으로 섞었어요. 같은 계산을 numpy가 한 번에 하면 90배쯤 빨라요
    #            (200×250 가면 한 장: 파이썬 반복 0.6~3.1초 → numpy 0.007~0.035초, 2026-09-16 실습실 브라우저에서 잰 값.
    #             컴퓨터가 바쁠수록 둘 다 느려지지만 배수는 비슷하고, 결과 그림은 같아요).
    alpha = piece[:, :, 3:4].astype("float32") / 255.0      # 알파 채널 값 정규화(0.0~1.0)
    background = frame[y0:y1, x0:x1].astype("float32")      # 원본 프레임의 같은 자리
    frame[y0:y1, x0:x1] = (alpha * piece[:, :, :3] + (1 - alpha) * background).astype("uint8")
    return frame                                             # 합성된 프레임 반환

# 영상 처리 루프 시작
while cap.isOpened():                                       # 웹캠이 열려 있는 동안 반복
    ret, frame = cap.read()                                 # 프레임 읽기
    if not ret:
        break                                               # 프레임을 읽지 못하면 종료

    frame = cv2.flip(frame, 1)                              # 좌우 반전
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)      # BGR → RGB 색상 변환
    results = face_mesh.process(frame_rgb)                  # 얼굴 랜드마크 추출

    # 얼굴이 인식된 경우 마스크 합성
    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            landmarks = face_landmarks.landmark             # 전체 랜드마크 정보 가져오기
            frame = overlay_mask_on_face(frame, landmarks, mask_image)  # 얼굴에 마스크 합성

    cv2.imshow("Virtual Mask Filter", frame)                # 결과 영상 출력

    if cv2.waitKey(1) & 0xFF == ord('q'):                   # 'q' 키를 누르면 종료
        break

# 자원 정리
cap.release()                                               # 웹캠 해제
cv2.destroyAllWindows()                                     # 모든 창 닫기

# ── 바꿔볼 것 3가지 ──
# 1. mask.png 대신 내 그림을 씌워 봐요. 오른쪽 파일 패널의 [파일 넣기]로 투명 배경 PNG를 넣고 23행의 파일 이름을 그 이름으로 바꿔요.
# 2. alpha에 0.5를 곱해 보세요(alpha = piece[:, :, 3:4].astype("float32") / 255.0 * 0.5). 가면이 반투명해져요.
# 3. 이마(10번) 대신 눈(159번) 좌표를 top_left_y에 써 보세요. 가면이 얼마나 내려가나요?
#
# ── 왜 이런 결과가 나올까 ──
# 가면 그림은 색 3개(BGR)에 투명도(알파) 한 개가 더 있는 네 겹 그림이에요. 알파가 0이면 뒤 영상이 그대로 보이고, 255면 가면 색만 보여요.
# 그래서 "가면 색 × 알파 + 원래 색 × (1 - 알파)"를 픽셀마다 계산하면 가면이 자연스럽게 얹혀요.
# 원본 코드는 이 계산을 파이썬 반복문으로 픽셀마다 했는데, 브라우저 안 파이썬에서는 한 장에 0.6초에서 3초쯤 걸려 영상이 뚝뚝 끊겨요.
# numpy는 같은 계산을 배열 전체에 한 번에 시켜서(벡터 연산) 훨씬 빨라요 — 계산 결과는 똑같아요.
