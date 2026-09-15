---
title: UART
english: Universal Asynchronous Receiver/Transmitter
aliases: [시리얼 통신, 직렬 통신]
summary: Universal Asynchronous Receiver/Transmitter의 줄임말로, 데이터를 한 비트씩 차례로 보내고 받는 통신 방식이에요.
related: [i2c, ble, driver]
group: 통신
---

한 장치의 TX(보내기) 핀을 다른 장치의 RX(받기) 핀에 엇갈려 연결해요. 두 장치는 보드레이트(baudrate)라는 전송 속도를 똑같이 맞춰야 글자가 깨지지 않아요. 컴퓨터와 ESP32 개발 보드가 USB 케이블로 주고받을 때도 보드의 USB-시리얼 변환 칩이 USB 신호를 UART로 바꿔 줘요.
