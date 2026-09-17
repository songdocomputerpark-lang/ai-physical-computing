# ==========================================
# 1. 라이브러리 가져오기 및 기본 설정
# ==========================================
# 필요한 라이브러리들을 가져오기 (import)
import cv2          # 컴퓨터 비전 (카메라, 영상처리)
import mediapipe as mp  # 얼굴 인식 라이브러리
import pyautogui    # 마우스 자동 제어 라이브러리

# 마우스 제어 기본 설정
pyautogui.FAILSAFE = False  # 마우스가 모서리에 가도 프로그램이 멈추지 않게 설정
pyautogui.PAUSE = 0.01      # 마우스 움직임 속도 조절 (0.01초 간격)

# ==========================================
# 2. 변수 선언 및 초기화
# ==========================================
# 컴퓨터 화면 크기 가져오기
screen_width, screen_height = pyautogui.size()
print(f"내 컴퓨터 화면 크기: {screen_width} x {screen_height}")

# 얼굴 움직임 감도 설정 (숫자가 클수록 민감함)
face_move_range_x = 60  # 좌우 움직임 범위
face_move_range_y = 30  # 상하 움직임 범위

# 기준점을 저장할 변수들
reference_center = None     # 코의 기준 위치
calibration_frames = 30     # 기준점 설정에 필요한 프레임 수 (1초 정도)
frame_count = 0            # 현재까지 센 프레임 수

# ==========================================
# 3. 카메라 및 얼굴 인식 설정
# ==========================================
# MediaPipe로 얼굴 특징점 찾는 도구 만들기
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,                # 최대 1명의 얼굴만 인식
    refine_landmarks=True,          # 정확한 특징점 찾기
    min_detection_confidence=0.5,   # 얼굴 감지 민감도 (0~1, 높을수록 정확)
    min_tracking_confidence=0.5     # 얼굴 추적 민감도 (0~1, 높을수록 정확)
)

# 카메라 연결하기 (0: 기본카메라, 1,2: 외장카메라)
cap = cv2.VideoCapture(0)

# ==========================================
# 4. 메인 프로그램 루프 (계속 반복되는 부분)
# ==========================================
while cap.isOpened():  # 카메라가 켜져있는 동안 계속 반복
    
    # ------------------------------------------
    # 4-1. 카메라에서 영상 가져오기
    # ------------------------------------------
    success, frame = cap.read()  # 카메라에서 한 장면(프레임) 가져오기
    if not success:              # 카메라에서 영상을 못 가져오면
        break                    # 프로그램 종료

    # 거울처럼 보이게 좌우 반전 (셀카 모드)
    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape  # 영상의 높이(h)와 너비(w) 저장
    
    # ------------------------------------------
    # 4-2. 얼굴 특징점 찾기
    # ------------------------------------------
    # 얼굴 특징점 감지 (RGB 색상으로 변환 후 처리)
    results = face_mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

    # 얼굴이 감지되었을 때만 실행
    if results.multi_face_landmarks:
        face_landmarks = results.multi_face_landmarks[0]  # 첫 번째 얼굴 정보 가져오기
        
        # ------------------------------------------
        # 4-3. 코와 눈의 좌표 계산하기
        # ------------------------------------------
        # 특정 특징점 번호로 좌표 가져오기
        nose = face_landmarks.landmark[6]    # 코 특징점 (번호: 6)
        left_eye = face_landmarks.landmark[468]   # 왼쪽 눈 특징점 (번호: 468)
        right_eye = face_landmarks.landmark[473]  # 오른쪽 눈 특징점 (번호: 473)
        
        # 비율 좌표(0~1)를 실제 픽셀 좌표로 변환
        coordinates = [
            ("Nose", int(nose.x * w), int(nose.y * h)),          # 코 좌표
            ("eye_L", int(left_eye.x * w), int(left_eye.y * h)), # 왼쪽 눈 좌표
            ("eye_R", int(right_eye.x * w), int(right_eye.y * h)) # 오른쪽 눈 좌표
        ]
        # 코 좌표 계산하기 (마우스 제어의 기준점)
        # 코는 얼굴에서 가장 안정적으로 추적할 수 있는 특징점
        nose_x = int(nose.x * w)  # 코 x좌표 변환
        nose_y = int(nose.y * h)  # 코 y좌표 변환
        
        # ------------------------------------------
        # 4-4. 특징점을 화면에 표시하기
        # ------------------------------------------
        # 코와 눈에 빨간색 점 그리기
        for name, x, y in coordinates:
            cv2.circle(frame, (x, y), 5, (0, 0, 255), -1)  # 빨간색 원
        
        # 코를 초록색 원으로 강조 표시 (마우스 제어 기준점)
        cv2.circle(frame, (nose_x, nose_y), 8, (0, 255, 0), -1)  # 초록색 원
        
        # ------------------------------------------
        # 4-5. 기준점 설정하기 (처음 30프레임 동안)
        # ------------------------------------------
        if frame_count < calibration_frames:  # 아직 기준점을 설정하는 중이면
            # 기준점 계산 (여러 프레임의 평균값 구하기)
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
        # 4-6. 마우스 제어하기 (기준점 설정 완료 후)
        # ------------------------------------------
        else:
            # 기준점으로부터 얼마나 움직였는지 계산
            move_x = nose_x - reference_center[0]  # x축 이동량
            move_y = nose_y - reference_center[1]  # y축 이동량
            
            # 코 움직임을 화면 좌표로 변환
            mouse_x = move_x / face_move_range_x * screen_width + screen_width // 2
            mouse_y = move_y / face_move_range_y * screen_height + screen_height // 2
            
            # 마우스가 화면 밖으로 나가지 않도록 제한 (OR 연산 사용)
            if mouse_x < 0 or mouse_x >= screen_width:  # x좌표가 화면 밖이면
                mouse_x = max(0, min(screen_width - 1, mouse_x))  # 화면 안으로 제한
            if mouse_y < 0 or mouse_y >= screen_height:  # y좌표가 화면 밖이면
                mouse_y = max(0, min(screen_height - 1, mouse_y))  # 화면 안으로 제한
            
            # 마우스를 계산된 위치로 이동
            pyautogui.moveTo(int(mouse_x), int(mouse_y))
            
            # 기준점을 파란색 십자 모양으로 표시
            cv2.drawMarker(frame, (int(reference_center[0]), int(reference_center[1])), 
                          (255, 0, 0), cv2.MARKER_CROSS, 15, 2)
        
        # ------------------------------------------
        # 4-7. 좌표 정보를 화면에 출력하기
        # ------------------------------------------
        y_offset = 30  # 글자 시작 위치
        
        # 코와 눈의 좌표를 화면 왼쪽 위에 표시
        for name, x, y in coordinates:
            cv2.putText(frame, f"{name}: X={x}, Y={y}", (10, y_offset), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            y_offset += 25  # 다음 줄로 이동
        
        # 코 좌표를 초록색으로 강조 표시
        cv2.putText(frame, f"Nose_Control: X={nose_x}, Y={nose_y}", 
                   (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        
        # 기준점 좌표 표시 (설정되었을 때만)
        if reference_center:
            cv2.putText(frame, f"Pole: X={int(reference_center[0])}, Y={int(reference_center[1])}", 
                       (10, y_offset + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

    # ------------------------------------------
    # 4-8. 사용 안내 및 화면 출력
    # ------------------------------------------
    # 키 사용법을 화면 하단에 표시
    cv2.putText(frame, "Press 'r' to recalibrate, 'q' to quit", 
               (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    # 최종 결과를 화면에 보여주기
    cv2.imshow('Nose Mouse Control', frame)

    # ------------------------------------------
    # 4-9. 키보드 입력 처리
    # ------------------------------------------
    key = cv2.waitKey(5) & 0xFF  # 키보드 입력 받기 (5ms 대기)
    
    if key == ord('q'):      # 'q' 키를 누르면
        break                # 프로그램 종료
    elif key == ord('r'):    # 'r' 키를 누르면
        reference_center = None  # 기준점 리셋
        frame_count = 0         # 프레임 카운터 리셋
        print("기준점을 다시 설정합니다...")

# ==========================================
# 5. 프로그램 종료 처리
# ==========================================
# 사용한 자원들 정리하기
cap.release()           # 카메라 연결 해제
cv2.destroyAllWindows() # 모든 창 닫기
print("프로그램이 종료되었습니다.")

# ==========================================
# 프로그램 전체 작동 순서 요약:
# ==========================================
# 1단계: 카메라에서 실시간으로 사진을 가져온다
# 2단계: 가져온 사진에서 얼굴을 찾는다
# 3단계: 찾은 얼굴에서 코와 양쪽 눈의 위치를 계산한다
# 4단계: 30프레임 동안 코의 기준 위치를 설정한다
# 5단계: 기준 위치로부터 코가 얼마나 움직였는지 계산한다
# 6단계: 코의 움직임을 마우스 움직임으로 변환한다
# 7단계: 마우스를 계산된 위치로 이동한다
# 8단계: 코 좌표와 기준점 정보를 화면에 표시한다
# 9단계: 'q' 키를 누를 때까지 1~8단계를 계속 반복한다
# 10단계: 'r' 키를 누르면 기준점을 다시 설정한다