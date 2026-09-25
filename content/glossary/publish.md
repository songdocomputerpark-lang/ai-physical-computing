---
title: 발행
english: publish
summary: MQTT에서 토픽을 붙여 중계 서버로 메시지를 보내는 일이에요. 보내는 쪽은 누가 받을지 몰라도 돼요.
related: [subscribe, topic, mqtt]
group: 통신
---

MicroPython에서는 `client.publish(토픽, 글)`로 발행해요. 같은 토픽을 구독한 기기가 여럿이면 한 번 발행한 메시지가 모두에게 가요. 동영상 채널에 새 영상을 올리면 구독한 사람 모두에게 알림이 가는 것과 비슷해요.
