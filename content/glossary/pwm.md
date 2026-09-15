---
title: PWM
english: Pulse Width Modulation
aliases: [펄스 폭 변조]
summary: Pulse Width Modulation(펄스 폭 변조)의 줄임말로, 신호를 아주 빠르게 켰다 껐다 하며 켜진 시간의 비율로 세기를 조절하는 방법이에요.
related: [gpio, actuator]
group: 피지컬 컴퓨팅
---

켜진 시간의 비율을 듀티비(duty cycle)라고 하는데, 듀티비가 크면 LED가 밝아지고 작으면 어두워져요. 켜고 끄기를 아주 빠르게 되풀이해서 눈에는 깜빡임 대신 밝기 차이로 보여요. ESP32에서는 PWM으로 LED 밝기, 서보모터 각도, 팬 모터 속도를 조절해요.
