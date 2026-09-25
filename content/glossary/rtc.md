---
title: RTC
english: Real-Time Clock
aliases: [실시간 시계]
summary: Real-Time Clock(실시간 시계)의 줄임말로, 보드 안에서 날짜와 시각을 세는 시계예요.
related: [esp32, microcontroller]
group: 피지컬 컴퓨팅
---

ESP32에서는 machine 모듈의 RTC로 시각을 맞추고 읽어요. datetime()은 연, 월, 일, 요일, 시, 분, 초와 초보다 작은 값까지 여덟 개 값을 한 묶음(튜플)으로 돌려줘요. 보드의 전원이 꺼지면 처음 값으로 돌아가서 다시 맞춰야 해요.
