---
title: BGR·RGB
english: Blue·Green·Red / Red·Green·Blue
aliases: [BGR, RGB, RGB·BGR]
summary: 컬러 픽셀의 색 숫자 3개를 적는 순서예요. RGB는 빨강·초록·파랑, BGR은 파랑·초록·빨강 순서예요.
related: [pixel, frame]
group: 영상 처리
---

OpenCV는 사진을 BGR 순서로 읽고, MediaPipe는 RGB 순서의 사진을 받아요. 그래서 웹캠 :용어[프레임]을 MediaPipe에 넘기기 전에 `cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)`로 순서를 바꿔요. 순서가 바뀐 채로 화면에 보여 주면 빨간 물체가 파랗게 보이는 것처럼 빨강과 파랑이 뒤바뀌어요.
