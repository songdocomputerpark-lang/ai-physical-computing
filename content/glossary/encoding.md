---
title: 인코딩
english: encoding
summary: 글자처럼 사람이 읽는 데이터를 정해진 규칙에 따라 바이트로 바꾸는 일이에요. 통신으로 보내기 전에 해요.
related: [decoding, byte, ascii]
group: 컴퓨터 기초
---

파이썬에서는 `"a".encode()`처럼 문자열의 `encode()`를 불러 바이트로 바꿔요. 규칙(문자 코드)을 따로 정하지 않으면 UTF-8을 써요. 받는 쪽은 같은 규칙으로 디코딩해야 원래 글자를 되찾을 수 있어요.
