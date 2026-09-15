---
title: GPIO
english: General Purpose Input/Output
aliases: [범용 입출력, GPIO 핀]
summary: General Purpose Input/Output(범용 입출력)의 줄임말로, 입력이나 출력을 코드로 정해서 쓰는 보드의 핀이에요.
related: [esp32, pwm, sensor]
group: 피지컬 컴퓨팅
---

출력으로 정하면 핀의 전압을 높게(1) 또는 낮게(0) 만들어 LED를 켜고 끌 수 있고, 입력으로 정하면 버튼이 눌렸는지 읽을 수 있어요. :용어[MicroPython]에서는 `Pin(2, Pin.OUT)`처럼 핀 번호와 방향을 정해요. 교과서의 ESP32 개발 보드는 내장 LED가 GPIO 2번에 연결돼 있어요.
