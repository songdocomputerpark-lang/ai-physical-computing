---
title: 픽셀 좌표계
english: Pixel Coordinate System
aliases: [화면 좌표계, 이미지 좌표계]
summary: 사진이나 화면의 위치를 픽셀 단위로 나타내는 좌표계예요. 원점 (0, 0)이 왼쪽 위에 있고 y는 아래로 갈수록 커져요.
related: [pixel, normalized-coordinates]
group: 영상 처리
---

수학 시간의 좌표 평면은 원점이 왼쪽 아래에 있고 y가 위로 갈수록 커지지만, OpenCV 같은 영상 처리 프로그램은 원점을 왼쪽 위에 두어요. 가로 640, 세로 480인 사진이면 x는 0부터 639까지, y는 0부터 479까지예요. MediaPipe가 주는 :용어[정규화 좌표]에 사진의 너비와 높이를 곱하면 픽셀 좌표가 돼요.
