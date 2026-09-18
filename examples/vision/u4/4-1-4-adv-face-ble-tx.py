import cv2
import mediapipe as mp
import time
from bluetooth import init as bluetooth_init

# 블루투스 연결
bluetooth_client = bluetooth_init("XX:XX:XX:XX:XX:XX")# 실제 주소로 변경
time.sleep(2)

# MediaPipe & 카메라
face_mesh = mp.solutions.face_mesh.FaceMesh(max_num_faces=1)
cap = cv2.VideoCapture(0)
last_send = 0

while True:
    ret, frame = cap.read()
    if not ret: break
    
    frame = cv2.flip(frame, 1)
    results = face_mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    
    if results.multi_face_landmarks:
        nose = results.multi_face_landmarks[0].landmark[6]
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

cap.release()
cv2.destroyAllWindows()
bluetooth_client.disconnect()