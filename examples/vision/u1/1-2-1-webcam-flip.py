import cv2  # opencv 라이브러리 로드

video = cv2.VideoCapture(0)  # 웹캠 연결 (0번 장치 사용)
if not video.isOpened():  # 웹캠이 정상적으로 열렸는지 확인
    print("웹캠을 열 수 없습니다.")
    exit()
else:
    print("웹캠이 연결되었습니다.")

while True:
    ret, frame = video.read()  # 프레임 읽기
    if not ret:  # 프레임 읽기에 실패하면 종료
        print("프레임을 읽을 수 없습니다.")
        break

    frame = cv2.flip(frame, 1)  # 프레임 좌우 반전
    cv2.imshow('Webcam', frame)  # 프레임 출력

    if cv2.waitKey(30) == ord('q'):  # 30 ms마다 q 키를 누르는지 확인
        break

video.release()  # 웹캠 장치 해제
cv2.destroyAllWindows()  # 창 닫기