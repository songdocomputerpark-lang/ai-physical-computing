import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision  # MediaPipe 영상 인식 도구 모음
import time
from bluetooth import init as bluetooth_init

# 블루투스 연결
bluetooth_client = bluetooth_init("XX:XX:XX:XX:XX:XX")# 실제 주소로 변경
time.sleep(2)

# MediaPipe & 카메라
options = vision.FaceLandmarkerOptions(                                         # 얼굴 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='face_landmarker.task'), # 얼굴 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                      # 영상 모드: 프레임을 차례로 넣어요
    num_faces=1)                                                                # 얼굴을 1개만 찾기
face_mesh = vision.FaceLandmarker.create_from_options(options)  # 얼굴 인식 모델 준비
cap = cv2.VideoCapture(0)
last_send = 0

while True:
    ret, frame = cap.read()
    if not ret: break
    
    frame = cv2.flip(frame, 1)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))  # RGB로 바꿔 MediaPipe 사진 형식으로 감싸기
    results = face_mesh.detect_for_video(mp_img, int(time.time() * 1000))  # 지금 시각(밀리초)과 함께 얼굴 찾기
    
    if results.face_landmarks:
        nose = results.face_landmarks[0][6]  # 첫 번째 얼굴의 6번 점(코)
        x, y = int(nose.x * frame.shape[1]), int(nose.y * frame.shape[0])
        
        # 0.5초마다 전송 - CSV 포맷으로 전송
        if time.time() - last_send > 0.5:
            bluetooth_client.send(f"DATA,{x},{y}")
            print(f"전송: {x},{y}")
            last_send = time.time()
        
        cv2.circle(frame, (x, y), 5, (0, 255, 0), -1)
        cv2.putText(frame, f"X:{x} Y:{y}", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    
    # 연결 상태 표시
    status = "Connected" if bluetooth_client.connected else "Disconnected"
    cv2.putText(frame, f"BT: {status}", (10, 70), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0))
                
    cv2.imshow('BLE Test', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

face_mesh.close()  # 얼굴 인식 모델 닫기
cap.release()
cv2.destroyAllWindows()
bluetooth_client.disconnect()
