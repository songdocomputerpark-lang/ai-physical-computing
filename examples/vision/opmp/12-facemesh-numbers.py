import cv2
import mediapipe as mp

cam=cv2.VideoCapture(0)
cam.set(cv2.CAP_PROP_FRAME_WIDTH,1080)
width=cam.get(cv2.CAP_PROP_FRAME_WIDTH)
height=cam.get(cv2.CAP_PROP_FRAME_HEIGHT)


mp_face=mp.solutions.face_mesh
mp_drawing=mp.solutions.drawing_utils
face=mp_face.FaceMesh(refine_landmarks=True)

cv2.namedWindow("Face")

line_style=mp_drawing.DrawingSpec(color=(166,151,18), thickness=3)
circle_style=mp_drawing.DrawingSpec(color=(166,114,81), thickness=2)
while cv2.getWindowProperty("Face",cv2.WND_PROP_VISIBLE):
    check, frame=cam.read()
    if not check:break
    image=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
    results=face.process(image)
    if results.multi_face_landmarks:
        lm=results.multi_face_landmarks[0]
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
    cv2.imshow("Face",frame)
    if cv2.waitKey(1)==27:break