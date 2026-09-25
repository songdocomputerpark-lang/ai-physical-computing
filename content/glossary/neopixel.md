---
title: 네오픽셀
english: NeoPixel
aliases: [네오픽셀 링, 스마트 RGB LED]
summary: 작은 제어 칩이 든 RGB LED라서, 데이터 선 하나로 여러 LED의 색을 하나하나 따로 정할 수 있어요.
related: [gpio, bgr-rgb]
group: 피지컬 컴퓨팅
---

LED마다 번호가 있어 코드에서 np[0], np[1]처럼 색을 적고, np.write()를 불러야 실제 불빛이 바뀌어요. 색은 빨강, 초록, 파랑의 밝기를 0부터 255까지의 숫자 세 개로 적어요. 교과서 키트는 LED 16개가 둥글게 붙은 링을 쓰고, 무드등이나 알림 불빛처럼 색과 움직임으로 알려 주는 장치에 많이 쓰여요.
