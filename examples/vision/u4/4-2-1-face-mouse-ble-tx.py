# calculate_ear(): EAR 계산만 담당
# process_eye_blinks(): 눈깜박임 로직만 처리
# control_mouse(): 마우스 제어만 담당
# update_reference_point(): 기준점 설정만 처리
# reset_all_variables(): 변수 초기화만 담당
# draw_ui(): UI 그리기만 담당
# prepare_and_send_ble_data(): 데이터 전송만 담당
import cv2
import mediapipe as mp
import pyautogui
import numpy as np
import time, bluetooth  #블루투스 라이브러리 호출

# ===== 기본 설정 =====
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.01
screen_width, screen_height = pyautogui.size()
print(f"화면 크기: {screen_width} x {screen_height}")

# ===== 마우스 제어 변수 =====
face_move_range_x = 60
face_move_range_y = 30
reference_center = None
calibration_frames = 30
frame_count = 0
previous_mouse_x = None
previous_mouse_y = None

# ===== 눈깜박임 감지 변수 =====
EAR_THRESHOLD = 0.1
LONG_BLINK_THRESHOLD = 0.4
last_click_time = 0
click_delay = 1.0

left_eye_was_closed = False
right_eye_was_closed = False
both_eyes_were_closed = False
left_eye_close_start = 0
right_eye_close_start = 0
both_eyes_close_start = 0

# ===== MediaPipe 설정 =====
LEFT_EYE_POINTS = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_POINTS = [362, 385, 387, 263, 373, 380]

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# ===== 블루투스 설정 =====
BLUETOOTH_DEVICE_ADDRESS = "XX:XX:XX:XX:XX:XX"#실제주소로 대체할것
ble_bridge = None
try:
    print(f"'{BLUETOOTH_DEVICE_ADDRESS}'에 연결을 시도합니다...")
    # 라이브러리의 init 함수를 호출
    ble_bridge = bluetooth.init(BLUETOOTH_DEVICE_ADDRESS)
except Exception as e:
    print(f"블루투스 초기화 실패: {e}")
    ble_bridge = None

# ===== 함수 정의 =====
def calculate_ear(eye_points, landmarks, w, h):
    points = []
    for point_id in eye_points:
        x = int(landmarks.landmark[point_id].x * w)
        y = int(landmarks.landmark[point_id].y * h)
        points.append([x, y])
    
    points = np.array(points)
    A = np.linalg.norm(points[1] - points[5])
    B = np.linalg.norm(points[2] - points[4])
    C = np.linalg.norm(points[0] - points[3])
    
    return (A + B) / (2.0 * C)

def process_eye_blinks(left_ear, right_ear):
    global left_eye_was_closed, right_eye_was_closed, both_eyes_were_closed
    global left_eye_close_start, right_eye_close_start, both_eyes_close_start
    global last_click_time
    
    current_time = time.time()
    left_closed = left_ear <= EAR_THRESHOLD
    right_closed = right_ear <= EAR_THRESHOLD
    both_closed = left_closed and right_closed
    
    double_click_triggered = False
    right_click_triggered = False
    
    # 왼쪽 눈 처리 (더블클릭)
    if left_closed and not left_eye_was_closed:
        left_eye_close_start = current_time
        left_eye_was_closed = True
    elif not left_closed and left_eye_was_closed:
        duration = current_time - left_eye_close_start
        left_eye_was_closed = False
        
        if (duration >= LONG_BLINK_THRESHOLD and 
            not both_eyes_were_closed and
            current_time - last_click_time > click_delay):
            pyautogui.doubleClick()
            print(f"더블클릭! ({duration:.2f}초)")
            last_click_time = current_time
            double_click_triggered = True
    
    # 오른쪽 눈 처리 (단일 감지, 기능 없음)
    if right_closed and not right_eye_was_closed:
        right_eye_close_start = current_time
        right_eye_was_closed = True
    elif not right_closed and right_eye_was_closed:
        right_eye_was_closed = False
    
    # 양쪽 눈 동시 처리 (우클릭)
    if both_closed and not both_eyes_were_closed:
        both_eyes_close_start = current_time
        both_eyes_were_closed = True
    elif not both_closed and both_eyes_were_closed:
        duration = current_time - both_eyes_close_start
        both_eyes_were_closed = False
        
        if (duration >= LONG_BLINK_THRESHOLD and
            current_time - last_click_time > click_delay):
            pyautogui.click(button='right')
            print(f"우클릭! ({duration:.2f}초)")
            last_click_time = current_time
            right_click_triggered = True

    return double_click_triggered, right_click_triggered

def control_mouse(nose_x, nose_y):
    global previous_mouse_x, previous_mouse_y
    
    move_x = nose_x - reference_center[0]
    move_y = nose_y - reference_center[1]
    
    new_x = move_x / face_move_range_x * screen_width + screen_width // 2
    new_y = move_y / face_move_range_y * screen_height + screen_height // 2
    
    new_x = max(0, min(screen_width - 1, new_x))
    new_y = max(0, min(screen_height - 1, new_y))
    
    if previous_mouse_x is None:
        smooth_x, smooth_y = new_x, new_y
    else:
        smooth_x = previous_mouse_x * 0.7 + new_x * 0.3
        smooth_y = previous_mouse_y * 0.7 + new_y * 0.3
    
    pyautogui.moveTo(int(smooth_x), int(smooth_y))
    previous_mouse_x, previous_mouse_y = smooth_x, smooth_y
    return smooth_x, smooth_y

def update_reference_point(nose_x, nose_y):
    global reference_center, frame_count
    
    if reference_center is None:
        reference_center = [nose_x, nose_y]
    else:
        reference_center[0] = (reference_center[0] * frame_count + nose_x) / (frame_count + 1)
        reference_center[1] = (reference_center[1] * frame_count + nose_y) / (frame_count + 1)
    
    frame_count += 1

def reset_all_variables():
    global reference_center, frame_count, previous_mouse_x, previous_mouse_y
    global left_eye_was_closed, right_eye_was_closed, both_eyes_were_closed
    global left_eye_close_start, right_eye_close_start, both_eyes_close_start
    global last_click_time
    
    reference_center = None
    frame_count = 0
    previous_mouse_x = None
    previous_mouse_y = None
    left_eye_was_closed = False
    right_eye_was_closed = False
    both_eyes_were_closed = False
    left_eye_close_start = 0
    right_eye_close_start = 0
    both_eyes_close_start = 0
    last_click_time = 0

def draw_ui(frame, nose_x, nose_y, left_ear, right_ear, h):
    cv2.circle(frame, (nose_x, nose_y), 8, (0, 255, 0), -1)
    
    if frame_count >= calibration_frames:
        cv2.drawMarker(frame, (int(reference_center[0]), int(reference_center[1])), 
                      (255, 0, 0), cv2.MARKER_CROSS, 15, 2)
    
    cv2.putText(frame, f"Nose: X={nose_x}, Y={nose_y}", 
               (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
    cv2.putText(frame, f"Left EAR: {left_ear:.3f}", 
               (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
    cv2.putText(frame, f"Right EAR: {right_ear:.3f}", 
               (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
    
    if frame_count < calibration_frames:
        cv2.putText(frame, f"Calibrating... {frame_count}/{calibration_frames}", 
                   (10, h - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
    
    cv2.putText(frame, "Left Eye 0.3s+: Double Click, Both Eyes 0.3s+: Right Click", 
               (10, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(frame, "Press 'r' to recalibrate, 'q' to quit", 
               (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

def prepare_and_send_ble_data(ble_device, mouse_x, mouse_y,
                              is_double_click, is_right_click):
    """마우스 좌표와 클릭 이벤트를 받아 BLE로 데이터를 전송합니다."""
    if ble_device and ble_device.connected:
        # 데이터 포맷: "x,y,double_click,right_click" (클릭 발생 시 1, 아니면 0)
        click_type = f"{1 if is_double_click else 0},{1 if is_right_click else 0}"
        data_string = f"DATA,{int(mouse_x)},{int(mouse_y)},{click_type}"
        ble_device.send(data_string)

# ===== 메인 실행 =====
cap = cv2.VideoCapture(0)

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape
    
    results = face_mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

    # 현재 프레임의 마우스 좌표와 클릭 상태 초기화
    mouse_x, mouse_y = previous_mouse_x, previous_mouse_y
    if mouse_x is None or mouse_y is None:
        mouse_x, mouse_y = screen_width // 2, screen_height // 2

    is_double_click = False
    is_right_click = False

    if results.multi_face_landmarks:
        face_landmarks = results.multi_face_landmarks[0]
        
        nose = face_landmarks.landmark[6]
        nose_x, nose_y = int(nose.x * w), int(nose.y * h)
        
        left_ear = calculate_ear(LEFT_EYE_POINTS, face_landmarks, w, h)
        right_ear = calculate_ear(RIGHT_EYE_POINTS, face_landmarks, w, h)
        
        is_double_click, is_right_click = process_eye_blinks(left_ear, right_ear)
        
        if frame_count < calibration_frames:
            update_reference_point(nose_x, nose_y)
        else:
            mouse_x, mouse_y = control_mouse(nose_x, nose_y)
        
        # UI 그리기
        draw_ui(frame, nose_x, nose_y, left_ear, right_ear, h)

        # 블루투스로 데이터 전송
        prepare_and_send_ble_data(ble_bridge, mouse_x, mouse_y, is_double_click, is_right_click)

    cv2.imshow('Face Mouse Control with BLE', frame)

    key = cv2.waitKey(5) & 0xFF
    if key == ord('q'):
        break
    elif key == ord('r'):
        reset_all_variables()
        print("기준점 재설정...")

# ===== 프로그램 종료 처리 =====
cap.release()
cv2.destroyAllWindows()
print("프로그램 종료")

if ble_bridge:
    print("블루투스 연결을 해제합니다.")
    ble_bridge.disconnect()
