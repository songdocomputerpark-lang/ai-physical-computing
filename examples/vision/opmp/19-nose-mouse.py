import time                               # 시간 라이브러리 (영상 프레임마다 시각을 붙이는 데 사용)
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision # MediaPipe 영상 인식 도구 모음
from collections import deque
import pyautogui as pg 


dq=deque(maxlen=30)

cam=cv2.VideoCapture(0)
cam.set(cv2.CAP_PROP_FRAME_WIDTH,1080)
width=cam.get(cv2.CAP_PROP_FRAME_WIDTH)
height=cam.get(cv2.CAP_PROP_FRAME_HEIGHT)

width2, height2=pg.size()
mp_drawing=vision.drawing_utils           # 얼굴 점을 화면에 그려 주는 도구
options=vision.FaceLandmarkerOptions(                                           # 얼굴 인식 설정
    base_options=mp.tasks.BaseOptions(model_asset_path='face_landmarker.task'), # 얼굴 인식 모델 파일(이 코드와 같은 폴더)
    running_mode=vision.RunningMode.VIDEO,                                      # 영상 모드: 프레임을 차례로 넣어요
    num_faces=1)                                                                # 얼굴을 1개까지 찾기(점은 눈동자까지 478개)
face=vision.FaceLandmarker.create_from_options(options)  # 얼굴 인식 모델 준비

cv2.namedWindow("Face")

line_style=mp_drawing.DrawingSpec(color=(166,151,18), thickness=3)
circle_style=mp_drawing.DrawingSpec(color=(166,114,81), thickness=2)
while cv2.getWindowProperty("Face",cv2.WND_PROP_VISIBLE):
    check, frame=cam.read()
    if not check:break
    frame=cv2.flip(frame,1)
    image=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
    mp_img=mp.Image(image_format=mp.ImageFormat.SRGB, data=image)  # MediaPipe가 읽는 사진 형식으로 감싸기
    results=face.detect_for_video(mp_img, int(time.time()*1000))   # 지금 시각(밀리초)과 함께 얼굴 인식
    if results.face_landmarks:
        lm=results.face_landmarks[0]
        pg.moveTo(int(lm[5].x*width2),int(lm[5].y*height2))
       
        nose=(int(lm[1].x*width),int(lm[1].y*height))
        cv2.circle(frame,nose,1,(220,220,220),1)
        '''
        cv2.putText(
            frame,"1",nose,cv2.FONT_HERSHEY_PLAIN,1,(255,255,255),1
        )
        '''
        # 코 끝 좌표 저장
        dq.append(nose)

        # 덱이 가득 차면
        if len(dq)==30:
            # 덱 끝의 값과 처음 값을 비교하여 방향 결정
            
            if dq[-1][0]-dq[0][0]>0: direction1 = "right"
            elif dq[-1][0]-dq[0][0]<0: direction1 = "left"
            else: direction1 = ""
                # 코 끝 좌표의 변화에 따라 왼쪽 오른쪽 출력
            cv2.putText(frame,direction1,(50,50),cv2.FONT_HERSHEY_PLAIN,1,(255,255,255),1)
            
            '''
            if dq[-1][1]-dq[0][1]>0: direction2 = "down"
            elif dq[0][1]-dq[-1][1]<0: direction2 = "up"
            else: direction2 = ""
                # 위 아래 출력
            cv2.putText(frame,direction2,(50,100),cv2.FONT_HERSHEY_PLAIN,1,(255,255,255),1)	
            '''        
   
            
        
        '''
        mp_drawing.draw_landmarks(
            frame,
            lm,
            vision.FaceLandmarksConnections.FACE_LANDMARKS_TESSELATION,
            line_style,
            circle_style
        )
        for idx in range(0, 468,5):
            coodrd=(int(lm[idx].x*width),int(lm[idx].y*height))
            cv2.circle(frame, coodrd, 1, (255,255,255),1)
            cv2.putText(frame,
                        str(idx),
                        coodrd,
                        cv2.FONT_HERSHEY_PLAIN,
                        1,
                        (255,255,255),1)
            '''
    cv2.imshow("Face",frame)
    if cv2.waitKey(1)==27:break
face.close()                              # 얼굴 인식 모델 닫기
