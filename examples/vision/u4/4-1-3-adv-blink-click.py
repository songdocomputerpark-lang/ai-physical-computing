# ==========================================
# 1. 라이브러리 가져오기 및 기본 설정
# ==========================================
import cv2          # 컴퓨터 비전 (카메라, 영상처리)
import mediapipe as mp  # 얼굴 인식 라이브러리
import pyautogui    # 마우스 자동 제어 라이브러리
import numpy as np  # 수학 계산을 위한 라이브러리 (EAR 계산용)
import time         # 시간 관련 함수 (클릭 간격 제어용)

pyautogui.FAILSAFE = False  # 마우스가 모서리에 가도 프로그램이 멈추지 않게 설정
pyautogui.PAUSE = 0.01      # 마우스 움직임 속도 조절 (0.01초 간격)

# ==========================================
# 2. 변수 선언 및 초기화
# ==========================================
screen_width, screen_height = pyautogui.size() # 컴퓨터 화면 크기 가져오기

face_move_range_x = 60  # # 얼굴 움직임 감도 좌우 움직임 범위
face_move_range_y = 30  # 상하 움직임 범위
reference_center = None     # 코의 기준 위치
calibration_frames = 30     # 기준점 설정에 필요한 프레임 수 (1초 정도)
frame_count = 0            # 현재까지 센 프레임 수
previous_mouse_x = None # 부드러운 마우스 움직임을 위한 변수
previous_mouse_y = None

# 눈깜박임 감지를 위한 변수들 추가
EAR_THRESHOLD = 0.1  # 눈깜박임 판단 기준값
left_eye_status = 0   # 왼쪽 눈 상태 (0: open, 1: close)
right_eye_status = 0  # 오른쪽 눈 상태 (0: open, 1: close)

# MediaPipe 얼굴 특징점 번호 정의
LEFT_EYE_POINTS = [33, 160, 158, 133, 153, 144]  # 왼쪽 눈의 6개 특징점
RIGHT_EYE_POINTS = [362, 385, 387, 263, 373, 380]  # 오른쪽 눈의 6개 특징점

# 마우스 클릭을 위한 변수들 추가
prev_left_eye_status = 0   # 이전 프레임의 왼쪽 눈 상태
prev_right_eye_status = 0  # 이전 프레임의 오른쪽 눈 상태
last_click_time = 0        # 마지막 클릭 시간 (연속 클릭 방지)
click_delay = 1.0          # 클릭 간격 (1초)

# ==========================================
# 3. EAR 계산 함수 추가
# ==========================================
def calculate_ear(eye_points, landmarks, frame_width, frame_height):
    """
    EAR(Eye Aspect Ratio) 계산하는 함수
    EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    """
    # 눈의 6개 특징점 좌표 가져오기
    points = []
    for point_id in eye_points:
        x = int(landmarks.landmark[point_id].x * frame_width)
        y = int(landmarks.landmark[point_id].y * frame_height)
        points.append([x, y])
    
    points = np.array(points)
    
    # EAR 계산
    # 세로 거리 1: 상단과 하단 사이 거리
    A = np.linalg.norm(points[1] - points[5])
    # 세로 거리 2: 상단과 하단 사이 거리
    B = np.linalg.norm(points[2] - points[4])
    # 가로 거리: 눈의 좌우 끝점 사이 거리
    C = np.linalg.norm(points[0] - points[3])
    
    # EAR 공식 적용
    ear = (A + B) / (2.0 * C)
    return ear

# ==========================================
# 4. 카메라 및 얼굴 인식 설정
# ==========================================
mp_face_mesh = mp.solutions.face_mesh # MediaPipe로 얼굴 특징점 찾는 도구 만들기
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,                # 최대 1명의 얼굴만 인식
    refine_landmarks=True,          # 정확한 특징점 찾기
    min_detection_confidence=0.5,   # 얼굴 감지 민감도 (0~1, 높을수록 정확)
    min_tracking_confidence=0.5     # 얼굴 추적 민감도 (0~1, 높을수록 정확)
)

cap = cv2.VideoCapture(0)# 카메라 연결하기 (0: 기본카메라, 1,2: 외장카메라)

# ==========================================
# 5. 메인 프로그램 루프 (계속 반복되는 부분)
# ==========================================
while cap.isOpened():  # 카메라가 켜져있는 동안 계속 반복
    
    # ------------------------------------------
    # 5-1. 카메라에서 영상 가져오기
    # ------------------------------------------
    success, frame = cap.read()  # 카메라에서 한 장면(프레임) 가져오기
    if not success:              # 카메라에서 영상을 못 가져오면
        break                    # 프로그램 종료

    frame = cv2.flip(frame, 1) # 거울처럼 보이게 좌우 반전 (셀카 모드)
    h, w, _ = frame.shape  # 영상의 높이(h)와 너비(w) 저장
    
    # ------------------------------------------
    # 5-2. 얼굴 특징점 찾기
    # ------------------------------------------
    results = face_mesh.process(cv2.cvtColor(frame, # 얼굴 특징점 감지 (RGB 색상으로 변환 후 처리)
                                             cv2.COLOR_BGR2RGB))

    if results.multi_face_landmarks:  # 얼굴이 감지되었을 때만 실행
        face_landmarks = results.multi_face_landmarks[0]  # 첫 번째 얼굴 정보 가져오기
        
        # ------------------------------------------
        # 6. 코와 눈의 좌표 계산하기  # 특정 특징점 번호로 좌표 가져오기
        # ------------------------------------------
        nose = face_landmarks.landmark[6]    # 코 특징점 (번호: 6)
        left_eye = face_landmarks.landmark[468]   # 왼쪽 눈 특징점 (번호: 468)
        right_eye = face_landmarks.landmark[473]  # 오른쪽 눈 특징점 (번호: 473)
        
        coordinates = [  # 비율 좌표(0~1)를 실제 픽셀 좌표로 변환
            ("Nose", int(nose.x * w), int(nose.y * h)),          # 코 좌표
            ("eye_L", int(left_eye.x * w), int(left_eye.y * h)), # 왼쪽 눈 좌표
            ("eye_R", int(right_eye.x * w), int(right_eye.y * h)) # 오른쪽 눈 좌표
        ]
        
        nose_x = int(nose.x * w)  # 코 x좌표 변환  # 코 좌표 계산하기 (마우스 제어의 기준점)
        nose_y = int(nose.y * h)  # 코 y좌표 변환
        
        # ------------------------------------------
        # 7. 눈깜박임 감지 (EAR 계산)  
        # ------------------------------------------
        # 왼쪽 눈 EAR 계산
        left_ear = calculate_ear(LEFT_EYE_POINTS, face_landmarks, w, h)
        # 오른쪽 눈 EAR 계산  
        right_ear = calculate_ear(RIGHT_EYE_POINTS, face_landmarks, w, h)
        
        # 눈깜박임 상태 판단 (EAR이 0.1 이하이면 눈을 감은 것으로 판단)
        left_eye_status = 1 if left_ear <= EAR_THRESHOLD else 0
        right_eye_status = 1 if right_ear <= EAR_THRESHOLD else 0
        
        current_time = time.time()  # 현재 시간
        
        # 깜박임 감지: 이전 프레임에서 눈이 떠있었고(0), 현재 프레임에서 감겼다면(1) 깜박임
        left_blink = (prev_left_eye_status == 0 and left_eye_status == 1)
        right_blink = (prev_right_eye_status == 0 and right_eye_status == 1)
        
        # 클릭 간격 체크 (연속 클릭 방지)
        if current_time - last_click_time > click_delay:
            # 양쪽 눈 동시 깜박임 → 우클릭
            if left_blink and right_blink:
                pyautogui.click(button='right')
                print("우클릭 실행!")
                last_click_time = current_time
            
            # 왼쪽 눈만 깜박임 → 더블클릭
            elif left_blink and not right_blink:
                pyautogui.doubleClick()
                print("더블클릭 실행!")
                last_click_time = current_time
        
        # 다음 프레임을 위해 현재 상태 저장
        prev_left_eye_status = left_eye_status
        prev_right_eye_status = right_eye_status
        
        # ------------------------------------------
        # 8. 특징점을 화면에 표시하기
        # ------------------------------------------
        for name, x, y in coordinates:  # 코와 눈에 빨간색 점 그리기
            cv2.circle(frame, (x, y), 5, (0, 0, 255), -1)  # 빨간색 원
        
        cv2.circle(frame, (nose_x, nose_y), 8, (0, 255, 0), -1)  # 초록색 원
        
        # ------------------------------------------
        # 9. 기준점 설정하기 (처음 30프레임 동안)
        # ------------------------------------------
        if frame_count < calibration_frames:  # 아직 기준점을 설정하는 중이면
            if reference_center is None:  # 처음이면
                reference_center = [nose_x, nose_y]  # 현재 코 위치를 기준점으로
            else:  # 두 번째부터는
                # 이전 평균과 현재 값을 합쳐서 새로운 평균 계산
                reference_center[0] = (reference_center[0] * frame_count + nose_x) / (frame_count + 1)
                reference_center[1] = (reference_center[1] * frame_count + nose_y) / (frame_count + 1)
            
            frame_count += 1  # 프레임 카운터 증가
            
            # 기준점 설정 중임을 화면에 표시
            cv2.putText(frame, f"Calibrating... {frame_count}/{calibration_frames}", 
                       (10, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        
        # ------------------------------------------
        # 10. 마우스 제어하기 (기준점 설정 완료 후)
        # ------------------------------------------
        else:  # 기준점으로부터 얼마나 움직였는지 계산
            move_x = nose_x - reference_center[0]  # x축 이동량
            move_y = nose_y - reference_center[1]  # y축 이동량
            
            # 코 움직임을 화면 좌표로 변환 (새로운 마우스 위치 계산)
            new_mouse_x = move_x / face_move_range_x * screen_width + screen_width // 2
            new_mouse_y = move_y / face_move_range_y * screen_height + screen_height // 2
            
            # 마우스가 화면 밖으로 나가지 않도록 제한
            if new_mouse_x < 0 or new_mouse_x >= screen_width:  # x좌표가 화면 밖이면
                new_mouse_x = max(0, min(screen_width - 1, new_mouse_x))  # 화면 안으로 제한
            if new_mouse_y < 0 or new_mouse_y >= screen_height:  # y좌표가 화면 밖이면
                new_mouse_y = max(0, min(screen_height - 1, new_mouse_y))  # 화면 안으로 제한
            
            # 부드러운 움직임 적용: 
            if (previous_mouse_x is None or 
                previous_mouse_y is None):  # 첫 번째 프레임에서는 이전 위치가 없으므로 
                # 현재 위치를 그대로 사용
                smooth_mouse_x = new_mouse_x
                smooth_mouse_y = new_mouse_y
            else:
                # 부드러운 움직임 공식 적용  # 새 위치 = (이전 위치 × 0.7) + (현재 위치 × 0.3)
                smooth_mouse_x = (previous_mouse_x * 0.7 + 
                                 new_mouse_x * 0.3)
                smooth_mouse_y = (previous_mouse_y * 0.7 + 
                                 new_mouse_y * 0.3)
            
            pyautogui.moveTo(int(smooth_mouse_x),  # 마우스를 부드럽게 계산된 위치로 이동
                            int(smooth_mouse_y))
            
            previous_mouse_x = smooth_mouse_x  # 현재 위치를 다음 프레임을 위해 저장
            previous_mouse_y = smooth_mouse_y
            
            # 기준점을 파란색 십자 모양으로 표시
            cv2.drawMarker(frame, (int(reference_center[0]), int(reference_center[1])), 
                          (255, 0, 0), cv2.MARKER_CROSS, 15, 2)
        
        # ------------------------------------------
        # 11. 좌표 정보와 눈깜박임 상태를 화면에 출력하기
        # ------------------------------------------
        y_offset = 30  # 글자 시작 위치
        # 코 좌표를 초록색으로 강조 표시
        cv2.putText(frame, f"Nose_Control: X={nose_x}, Y={nose_y}", 
                   (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        y_offset += 25
        
        # 눈깜박임 상태 표시 (새로 추가된 부분)
        cv2.putText(frame, f"Left Eye: {left_eye_status} (EAR: {left_ear:.3f})", 
                   (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
        y_offset += 25
        cv2.putText(frame, f"Right Eye: {right_eye_status} (EAR: {right_ear:.3f})", 
                   (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
        
    # ------------------------------------------
    # 12. 사용 안내 및 화면 출력
    # ------------------------------------------
    cv2.putText(frame, "Left Eye Blink: Double Click, Both Eyes: Right Click", 
               (10, h - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(frame, "Press 'r' to recalibrate, 'q' to quit", 
               (10, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    cv2.imshow('Nose Mouse Control + Eye Blink Detection', frame)

    # ------------------------------------------
    # 13. 키보드 입력 처리
    # ------------------------------------------
    key = cv2.waitKey(5) & 0xFF  # 키보드 입력 받기 (5ms 대기)
    
    if key == ord('q'):      # 'q' 키를 누르면
        break                # 프로그램 종료
    elif key == ord('r'):    # 'r' 키를 누르면
        reference_center = None  # 기준점 리셋
        frame_count = 0         # 프레임 카운터 리셋
        # 기준점 재설정 시 이전 마우스 위치도 초기화
        previous_mouse_x = None
        previous_mouse_y = None
        print("기준점을 다시 설정합니다...")
        # 눈깜박임 관련 변수들도 초기화
        prev_left_eye_status = 0
        prev_right_eye_status = 0
        last_click_time = 0
        
# ==========================================
# 14. 프로그램 종료 처리 # 사용한 자원들 정리하기
# ==========================================
cap.release()           # 카메라 연결 해제
cv2.destroyAllWindows() # 모든 창 닫기
print("프로그램이 종료되었습니다.")