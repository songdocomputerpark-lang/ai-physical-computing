---
title: 디코딩
english: decoding
summary: 받은 바이트를 정해진 규칙에 따라 다시 글자 같은 원래 데이터로 바꾸는 일이에요. 인코딩을 거꾸로 하는 일이에요.
related: [encoding, byte, parsing]
group: 컴퓨터 기초
---

파이썬과 MicroPython에서는 `data.decode()`처럼 바이트 묶음의 `decode()`를 불러 문자열로 바꿔요. 보낸 쪽과 다른 규칙으로 디코딩하면 글자가 깨지거나 오류가 나요. 디코딩한 글자를 쉼표로 나누고 숫자로 바꾸는 일은 :용어[파싱]이라고 해요.
