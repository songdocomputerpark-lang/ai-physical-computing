import cv2

cap=cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,1080)
width=cap.get(cv2.CAP_PROP_FRAME_WIDTH)
height=cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

while True:
    ret, frame=cap.read()
    if not ret : break
    cv2.imshow('Hand Tracking',frame)
    
    if cv2.waitKey(1)==27:break
cap.release()
cv2.destroyAllWindows()