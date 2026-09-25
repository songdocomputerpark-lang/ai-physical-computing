---
title: ADC
english: Analog-to-Digital Converter
aliases: [아날로그-디지털 변환기, 아날로그 디지털 변환기]
summary: Analog-to-Digital Converter(아날로그-디지털 변환기)의 줄임말로, 이어서 바뀌는 전압을 컴퓨터가 다루는 숫자로 바꾸는 장치예요.
related: [sensor, gpio]
group: 피지컬 컴퓨팅
---

ESP32의 ADC는 0V부터 약 3.3V까지의 전압을 0부터 4095까지(12비트)의 숫자로 바꿔요. 교과서의 4채널 터치 센서는 누른 패드마다 전압이 달라서, ADC 값이 어느 구간에 드는지로 누른 패드를 알아내요. 값이 이어서 바뀌는 센서를 읽을 때 써요.
