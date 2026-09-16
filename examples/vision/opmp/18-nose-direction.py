import cv2  # OpenCV 라이브러리를 불러옵니다.
import mediapipe as mp  # MediaPipe 라이브러리를 불러옵니다.
from collections import deque  # deque 모듈을 collections에서 불러옵니다.
import pyautogui as pg  # pyautogui 라이브러리를 불러옵니다. (이 스크립트에서 사용되지는 않았습니다.)

dq = deque(maxlen=30)  # 최대 길이가 30인 deque 객체를 생성합니다.

cam = cv2.VideoCapture(0)  # 기본 카메라를 사용하여 비디오 캡처 객체를 생성합니다.
cam.set(cv2.CAP_PROP_FRAME_WIDTH, 1080)  # 카메라의 프레임 너비를 1080으로 설정합니다.
width = cam.get(cv2.CAP_PROP_FRAME_WIDTH)  # 설정된 프레임 너비를 가져옵니다.
height = cam.get(cv2.CAP_PROP_FRAME_HEIGHT)  # 현재 프레임의 높이를 가져옵니다.

mp_face = mp.solutions.face_mesh  # MediaPipe의 얼굴 메시 솔루션을 불러옵니다.
mp_drawing = mp.solutions.drawing_utils  # MediaPipe의 그리기 유틸리티를 불러옵니다.
face = mp_face.FaceMesh(refine_landmarks=True)  # 얼굴 메시 인식 객체를 생성하고, 랜드마크 세부 정보를 활성화합니다.

cv2.namedWindow("Face")  # "Face"라는 이름의 윈도우를 생성합니다.

line_style = mp_drawing.DrawingSpec(color=(166, 151, 18), thickness=3)  # 선 그리기 스타일을 설정합니다.
circle_style = mp_drawing.DrawingSpec(color=(166, 114, 81), thickness=2)  # 원 그리기 스타일을 설정합니다.
while cv2.getWindowProperty("Face", cv2.WND_PROP_VISIBLE):  # "Face" 윈도우가 보이는 동안 반복합니다.
    check, frame = cam.read()  # 카메라로부터 프레임을 읽어옵니다.
    frame = cv2.flip(frame, 1)  # 프레임을 좌우로 뒤집습니다.
    if not check: break  # 프레임 읽기에 실패하면 반복을 중단합니다.
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # BGR 이미지를 RGB 이미지로 변환합니다.
    results = face.process(image)  # 변환된 이미지에서 얼굴 랜드마크를 추출합니다.
    if results.multi_face_landmarks:  # 얼굴 랜드마크가 있으면 실행합니다.
        lm = results.multi_face_landmarks[0]  # 첫 번째 얼굴의 랜드마크를 가져옵니다.
        nose = (int(lm.landmark[1].x * width), int(lm.landmark[1].y * height))  # 코 위치를 계산합니다.
        cv2.circle(frame, nose, 1, (220, 220, 220), 1)  # 코 위치에 작은 원을 그립니다.

        dq.append(nose)  # 코의 위치를 deque에 추가합니다.
        print(dq)
        if len(dq) == 30:  # deque의 길이가 30이면 실행합니다.
            if dq[-1][0] - dq[0][0] > 0: direction1 = "right"  
            # deque의 마지막 요소와 첫 번째 요소를 비교하여 오른쪽 이동 판단합니다.
            elif dq[-1][0] - dq[0][0] < 0: direction1 = "left"  
            # 왼쪽 이동을 판단합니다.
            else: direction1 = ""  # 이동이 없는 경우입니다.
            cv2.putText(frame, direction1, (50, 50), cv2.FONT_HERSHEY_PLAIN, 1, (255, 255, 255), 1)  
            # 방향 텍스트를 화면에 출력합니다.
          
    cv2.imshow("Face", frame)  # 프레임을 "Face" 윈도우에 표시합니다.
    if cv2.waitKey(1) == 27: break  # ESC 키를 누르면 반복을 중단합니다.
