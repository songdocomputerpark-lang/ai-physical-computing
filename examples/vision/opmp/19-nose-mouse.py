import cv2
import mediapipe as mp
from collections import deque
import pyautogui as pg 


dq=deque(maxlen=30)

cam=cv2.VideoCapture(0)
cam.set(cv2.CAP_PROP_FRAME_WIDTH,1080)
width=cam.get(cv2.CAP_PROP_FRAME_WIDTH)
height=cam.get(cv2.CAP_PROP_FRAME_HEIGHT)

width2, height2=pg.size()
mp_face=mp.solutions.face_mesh
mp_drawing=mp.solutions.drawing_utils
face=mp_face.FaceMesh(refine_landmarks=True)

cv2.namedWindow("Face")

line_style=mp_drawing.DrawingSpec(color=(166,151,18), thickness=3)
circle_style=mp_drawing.DrawingSpec(color=(166,114,81), thickness=2)
while cv2.getWindowProperty("Face",cv2.WND_PROP_VISIBLE):
    check, frame=cam.read()
    frame=cv2.flip(frame,1)
    if not check:break
    image=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
    results=face.process(image)
    if results.multi_face_landmarks:
        lm=results.multi_face_landmarks[0]
        pg.moveTo(int(lm.landmark[5].x*width2),int(lm.landmark[5].y*height2))
       
        nose=(int(lm.landmark[1].x*width),int(lm.landmark[1].y*height))
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
            mp_face.FACEMESH_TESSELATION,
            line_style,
            circle_style
        )
        for idx in range(0, 468,5):
            coodrd=(int(lm.landmark[idx].x*width),int(lm.landmark[idx].y*height))
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