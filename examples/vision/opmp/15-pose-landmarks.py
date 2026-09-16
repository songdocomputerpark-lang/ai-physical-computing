import cv2
import mediapipe as mp

cam=cv2.VideoCapture(0)

cam.set(cv2.CAP_PROP_FRAME_WIDTH,1080)

mp_pose=mp.solutions.pose
pose=mp_pose.Pose()

mp_drawig=mp.solutions.drawing_utils
line_style=mp_drawig.DrawingSpec(
    color=(220,220,220),
    thickness=3
)
circle_style=mp_drawig.DrawingSpec(
    color=(166,114,31),
    thickness=2,
    circle_radius=3
)
cv2.namedWindow("Pose")

while cv2.getWindowProperty("Pose",cv2.WND_PROP_VISIBLE):
    check, frame=cam.read()
    if not check:break
    image=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
    results=pose.process(image)
    if results.pose_landmarks:
        mp_drawig.draw_landmarks(
            frame,
            results.pose_landmarks,
            mp_pose.POSE_CONNECTIONS,
            line_style,
            circle_style
        )
    cv2.imshow("Pose",frame)
    if cv2.waitKey(1)==27:break
cam.release()
cv2.destoyAllWindows()