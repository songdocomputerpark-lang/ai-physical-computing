---
title: 알파 채널
english: Alpha Channel
aliases: [투명도 채널]
summary: 그림의 픽셀마다 얼마나 불투명한지를 적은 네 번째 숫자예요. 0이면 완전히 투명하고 255면 완전히 불투명해요.
related: [channel, pixel]
group: 영상 처리
---

컬러 사진의 픽셀은 파랑, 초록, 빨강 세 :용어[채널]로 색을 나타내는데, PNG 같은 그림은 여기에 알파 채널을 더해 투명한 곳을 표시할 수 있어요. 두 그림을 겹칠 때는 결과 = 위 그림 색 × a + 아래 그림 색 × (1 − a)(a = 알파 ÷ 255)로 섞어요. OpenCV는 `cv2.imread(파일, cv2.IMREAD_UNCHANGED)`로 읽어야 알파 채널까지 읽어요.
