---
title: MQTT
summary: 작은 기기들이 인터넷에서 가운데의 중계 서버를 거쳐 짧은 메시지를 주고받도록 정한 통신 약속이에요.
related: [broker, topic, publish, subscribe]
group: 통신
---

보내는 기기는 메시지에 :용어[토픽]이라는 이름표를 붙여 중계 서버로 보내고(발행), 받는 기기는 받고 싶은 토픽을 중계 서버에 미리 알려 둬요(구독). 중계 서버는 토픽이 맞는 기기에만 메시지를 나눠 줘서, 보내는 쪽은 받는 쪽이 누구인지 몰라도 돼요. MicroPython에서는 `umqtt.simple` 모듈의 `MQTTClient`로 써요.
