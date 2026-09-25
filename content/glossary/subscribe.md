---
title: 구독
english: subscribe
summary: MQTT에서 중계 서버에 "이 토픽의 메시지를 나에게 전해 줘"라고 미리 알려 두는 일이에요.
related: [publish, topic, mqtt]
group: 통신
---

MicroPython에서는 `client.set_callback(함수)`로 메시지가 오면 부를 함수를 먼저 정하고, `client.subscribe(토픽)`로 구독해요. 그다음 반복문에서 `client.check_msg()`를 불러야 온 메시지를 처리해요. 함수를 정하지 않고 구독하면 오류가 나요.
