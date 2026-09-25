---
title: 페이스 메시
english: Face Mesh
aliases: [얼굴 그물망, 얼굴 그물, FaceMesh, 페이스 매시]
summary: 얼굴에서 특징점 468개를 찾아 번호를 붙이고 그물처럼 잇는 MediaPipe의 얼굴 인식 기능이에요.
related: [landmark, normalized-coordinates]
group: 영상 처리
---

MediaPipe의 페이스 메시는 사진 속 얼굴에서 눈, 코, 입, 얼굴 윤곽 둘레의 :용어[랜드마크] 468개를 찾아요. `refine_landmarks=True`로 하면 눈동자 둘레 점 10개가 더해져 478개가 되고, 468번과 473번이 두 눈동자의 가운데예요. 점의 위치로 고개 방향, 입 벌림, 눈 깜빡임을 알아낼 수 있지만, 이 사이트에서는 누구인지 알아보는 데(얼굴 식별)에는 쓰지 않아요.
