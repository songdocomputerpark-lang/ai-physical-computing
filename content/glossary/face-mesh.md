---
title: 페이스 메시
english: Face Mesh
aliases: [얼굴 그물망, 얼굴 그물, FaceMesh, FaceLandmarker, 페이스 매시]
summary: 얼굴에서 특징점 468개를 찾아 번호를 붙이고 그물처럼 잇는 MediaPipe의 얼굴 인식 기능이에요.
related: [landmark, normalized-coordinates]
group: 영상 처리
---

MediaPipe의 페이스 메시는 사진 속 얼굴에서 눈, 코, 입, 얼굴 윤곽 둘레의 :용어[랜드마크] 468개를 찾아요. 최신 MediaPipe(1.2.0)의 얼굴 인식 도구 `FaceLandmarker`는 눈동자 둘레 점 10개를 더해 늘 478개를 돌려주고, 468번과 473번이 두 눈동자의 가운데예요(옛 사용법에서는 `refine_landmarks=True`로 해야 478개였어요). 점의 위치로 고개 방향, 입 벌림, 눈 깜빡임을 알아낼 수 있지만, 이 사이트에서는 누구인지 알아보는 데(얼굴 식별)에는 쓰지 않아요.
