---
title: 포즈 트래킹
english: Pose Tracking
aliases: [자세 추적, 포즈 추적, 포즈트레킹]
summary: 카메라 영상에서 사람의 관절 위치를 찾아 따라가며 자세와 동작을 알아보는 기술이에요.
related: [landmark, normalized-coordinates]
group: 영상 처리
---

MediaPipe Pose는 영상 속 사람 한 명의 몸에서 어깨, 팔꿈치, 손목, 무릎 같은 :용어[랜드마크] 33곳을 찾아요. 손목의 y 좌표가 기준보다 작아지면 손을 들었다고 판단하는 것처럼, 관절의 좌표를 비교해 동작을 알아봐요. 운동 앱의 자세 분석이나 몸짓으로 하는 게임에 쓰여요.
