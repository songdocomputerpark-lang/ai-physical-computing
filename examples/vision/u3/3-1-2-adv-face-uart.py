import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision  # MediaPipe 영상 인식 도구 모음
import serial
import time

uart = serial.Serial('COM10', 115200)
time.sleep(2)

options = vision.FaceDetectorOptions(                                                    # 얼굴 찾기 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='blaze_face_short_range.tflite'), # 얼굴 찾기 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                               # 영상 모드: 프레임을 차례로 넣어요
    min_detection_confidence=0.5)                                                        # 50% 넘게 확실할 때만 얼굴로 보기
face_detection = vision.FaceDetector.create_from_options(options)                        # 얼굴 찾기 모델 준비

cap = cv2.VideoCapture(0)
face_present = False

while True:
    ret, frame = cap.read()
    if not ret:
        continue

    frame = cv2.flip(frame, 1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)               # MediaPipe가 읽는 사진 형식으로 감싸기
    results = face_detection.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 얼굴 찾기

    detected = len(results.detections) > 0                                      # 찾은 얼굴이 하나라도 있으면 True

    if detected != face_present:
        face_present = detected
        if detected:
            uart.write(b'a')
            print("Face detected → a 전송")
        else:
            uart.write(b'b')
            print("Face lost → b 전송")

    if results.detections:
        for detection in results.detections:
            bbox = detection.bounding_box                                       # 얼굴 네모(픽셀 단위 위치와 크기)
            x, y, w, h = bbox.origin_x, bbox.origin_y, bbox.width, bbox.height
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

    cv2.imshow('Face Detection', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

face_detection.close()                                                          # 얼굴 찾기 모델 닫기
cap.release()
cv2.destroyAllWindows()
uart.close()                                                                    # 시리얼 포트 닫기
