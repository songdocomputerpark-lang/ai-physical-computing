---
title: 신뢰도
english: Confidence
aliases: [검출 신뢰도, 확신도]
summary: 인공지능이 자기 판단을 얼마나 확신하는지를 0부터 1 사이의 수로 나타낸 값이에요.
related: [landmark, threshold]
group: 인공지능
---

MediaPipe Hands의 `min_detection_confidence=0.5`는 "이것은 손이다"라는 확신이 0.5(50%)를 넘을 때만 손으로 인정한다는 뜻이에요. 기준을 낮추면 손이 아닌 물체도 손으로 잘못 알아보고, 높이면 확실할 때만 인정해서 어둡거나 손을 옆으로 세우면 놓치기 쉬워요.
