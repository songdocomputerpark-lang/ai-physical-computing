# 학습 자료 라이선스 — CC BY-NC-SA 4.0

「AI 피지컬 컴퓨팅 오픈랩」(가칭)의 학습 자료는 **크리에이티브 커먼즈 저작자표시-비영리-동일조건변경허락 4.0 국제(CC BY-NC-SA 4.0)** 라이선스로 공개해요.
실습 예제 코드(`examples/`)는 2026-09-25부터 **MIT**로 넓혀 공개해요(운영자 결정 O13 — 아래 "예제 코드는 MIT").

- 저작자: 박상진·김석전
- 라이선스 요약(한국어): https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ko
- 법적 전문(한국어 공식 번역): https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.ko
- 법적 전문(영어): https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode

이 문서의 설명은 이해를 돕는 요약이에요. 법적 효력은 위의 법적 전문에만 있어요.

## 적용 범위

| 대상 | 들어 있는 것 |
|---|---|
| `content/` | 차시 본문·용어사전 같은 학습 자료. 교과서 원고와 수업 교안에서 옮긴 글·그림을 포함해요. |
| `public/images/` | 차시 그림(`public/images/lessons/` — 교과서 원고에서 꺼낸 그림과 출판사가 조판 때 넣은 삽화·컷(운영자 결정 O10) 포함)과 사이트가 직접 그린 그림 파일(`public/images/site/`). `src/` 컴포넌트 안에 코드(인라인 SVG)로 그린 그림은 사이트 프로그램에 속해 MIT를 따라요. |
| `public/teacher/handouts/` | 교사용 자료실의 가린 편집본 교안(PDF). 블루투스 통신 수업 교안과 PyAutoGUI 수업 슬라이드에서 개인정보를 지운 판이에요. |
| 안내 문서 | `README.md`, `MAINTENANCE.md`, `CONTRIBUTING.md`, `docs/` 폴더의 문서 |

사이트 프로그램(`src/`, `scripts/`, `tests/`와 사이트가 새로 쓴 소프트웨어)은 [LICENSE](LICENSE)의 MIT 라이선스를 따라요.

## 예제 코드는 MIT

`examples/`의 실습 예제 코드(교과서·수업 자료에서 옮긴 예제 코드와 그 사이트판, 사이트가 새로 쓴 체험·보충 예제, 예제 옆의 설명 파일 `.meta.yaml`)는 [LICENSE](LICENSE)의 **MIT** 라이선스로 공개해요(운영자 결정 O13, 2026-09-25). 수업·동아리·교재 제작 등 어디에든 고쳐 쓰고 나눠 줄 수 있고, 지켜야 할 것은 저작권 표시와 MIT 허락 문장을 함께 두는 것뿐이에요. 단, `third-party/` 폴더에 둔 다른 저작자의 파일(예: `examples/esp32/lib/third-party/i2c_lcd.py`)은 각자의 원래 조건을 따라요(`sources.yaml`과 출처 페이지).

## 제외되는 자료

`sources.yaml`(출처 등록부)에 개별 항목으로 표기된 **제3자 자료와 공개 라이브러리는 이 라이선스에서 제외**되고, 각자의 원래 조건을 따라요.

- 예: `examples/esp32/lib/third-party/`처럼 `third-party/` 폴더에 둔 파일, 원래 권리자가 따로 있는 그림, 글꼴(Pretendard, OFL-1.1), 검색 도구(Pagefind)가 만드는 파일
- `sources.yaml`의 분류(`category`)로는 `operator`(운영자 자체 자료)와 `self`(사이트 자체 제작)가 아닌 항목이에요. 원 권리자 문구는 등록부와 출처 페이지에 그대로 적어요.
- 전체 목록: [출처와 라이선스](https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/) · [제3자 권리 표기 자료 목록](https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/#credits-third-party)

## 할 수 있는 일

- **공유:** 자료를 복사해 나눠 주고, 인쇄하고, 수업에서 보여 줄 수 있어요.
- **변경:** 학교 상황에 맞게 고치거나, 다른 자료와 섞어 새 자료를 만들 수 있어요.

## 지켜야 할 조건

- **저작자표시(BY):** 출처와 라이선스 링크를 알맞게 적고, 고친 곳이 있으면 고쳤다고 밝혀요.
- **비영리(NC):** 돈을 벌거나 상업적 이익을 얻는 것이 주된 목적인 일에는 쓸 수 없어요.
- **동일조건변경허락(SA):** 고치거나 섞어 만든 자료를 나눌 때는 같은 라이선스(CC BY-NC-SA 4.0)로 공개해요.
- **추가 제한 금지:** 이 라이선스가 허락한 일을 다른 사람이 못 하도록 법적 조건이나 기술적 장치를 덧붙이면 안 돼요.

## 출처 표시 예

> 「AI 피지컬 컴퓨팅 오픈랩」, 박상진·김석전, https://songdocomputerpark-lang.github.io/ai-physical-computing/ , CC BY-NC-SA 4.0

고친 자료라면 끝에 "(원 자료를 고쳐 씀)"처럼 바꾼 사실을 덧붙여요.

## 알아 둘 점

- 초상권·프라이버시권 같은 인격권은 이 라이선스로 허락되지 않아요(법적 전문 제2조 b항 1호). 이 사이트는 학생·일반인의 얼굴·이름·연락처를 공개하지 않아요.
- 개인정보나 저작권 문제를 발견하면 [기여·문의](https://songdocomputerpark-lang.github.io/ai-physical-computing/contribute/) 페이지의 방법으로 알려 주세요. 개인정보 자체는 공개 이슈에 옮겨 적지 마세요.

## English summary

Learning materials in this repository (`content/`, `public/images/`, `public/teacher/handouts/`) and its documentation are licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode) by 박상진·김석전. Site software and the example code in `examples/` (since 2026-09-25) are licensed under the MIT License (see `LICENSE`). Third-party materials and open-source libraries listed individually in `sources.yaml` are excluded and remain under their original terms.
