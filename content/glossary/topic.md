---
title: 토픽
english: topic
summary: MQTT 메시지에 붙이는 이름표예요. esp32-01/tx처럼 빗금(/)으로 나눠 적고, 같은 토픽을 쓰는 기기끼리 메시지가 오가요.
related: [mqtt, publish, subscribe, communication-prefix]
group: 통신
---

토픽은 보내는 쪽과 받는 쪽의 약속이라 한 글자만 달라도 메시지가 닿지 않아요. 구독할 때 `esp32-01/#`처럼 #을 쓰면 `esp32-01/` 아래의 토픽을 모두 받아요. 이 사이트는 보드 번호와 방향(tx는 보드가 보냄, rx는 보드가 받음)으로 토픽 이름을 지어요.
