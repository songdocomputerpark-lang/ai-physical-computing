---
title: 중계 서버
english: broker
aliases: [브로커, MQTT 브로커]
summary: MQTT에서 메시지를 받아, 그 토픽을 구독한 기기들에 나눠 주는 가운데 컴퓨터예요. 브로커라고도 해요.
related: [mqtt, topic, communication-prefix]
group: 통신
---

기기들은 서로 직접 잇지 않고 모두 중계 서버에 붙어요. 학습용 공개 중계 서버는 비밀번호 없이 누구나 붙을 수 있어서, 토픽 이름을 아는 사람이면 누구든 메시지를 보고 보낼 수 있어요. 그래서 이름, 연락처, 사진 같은 개인정보는 보내지 않고, 받은 명령은 LED 같은 표시 장치에만 써요.
