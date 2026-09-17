# 1차시 1-1: 동작 테스트 (웹캠 켜기)
import cv2

# 웹캠을 비디오 소스로 사용 (0은 기본 웹캠)
cap = cv2.VideoCapture(0) #웹캠이 여러개일 경우 1, 2로 변경

while True:
    # 웹캠에서 프레임(이미지)을 한 장씩 읽어옴
    # success는 성공 여부(True/False), frame은 읽어온 이미지
    success, frame = cap.read()
    if not success:
        break # 프레임을 읽어오지 못했다면 루프 종료

    # 'Camera Feed'라는 이름의 창에 현재 프레임을 보여줌
    cv2.imshow('Camera Feed', frame)

    # 'q' 키를 누르면 루프를 종료하고 창을 닫음
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# 사용이 끝난 비디오 소스와 창을 해제
cap.release()
cv2.destroyAllWindows()