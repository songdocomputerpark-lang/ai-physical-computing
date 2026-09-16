import cv2
import mediapipe as mp
mp_hands=mp.solutions.hands
mp_drawing=mp.solutions.drawing_utils
hands=mp_hands.Hands(max_num_hands=1)

line_style=mp_drawing.DrawingSpec(
    color=(166,151,18),
    thickness=3
)

circle_style=mp_drawing.DrawingSpec(
    color=(161,114,31),
    thickness=2,
    circle_radius=3
)
cap=cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,1080)
width=cap.get(cv2.CAP_PROP_FRAME_WIDTH)
height=cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

while True:
    ret, frame=cap.read()
    frame=cv2.flip(frame,1)
    if not ret : break
    image=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results=hands.process(image)
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            finger_point=hand_landmarks.landmark[8]
            finger_x=int(finger_point.x*width)
            finger_y=int(finger_point.y*height)
            print(finger_x,finger_y)
            mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS,
                line_style,
                circle_style
            )
            cv2.circle(frame, (finger_x,finger_y),30,(255,255,255),10)
    cv2.imshow('Hand Tracking',frame)
    
    if cv2.waitKey(1)==27:break
cap.release()
cv2.destroyAllWindows()