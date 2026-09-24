# 유지보수 안내

사이트를 혼자서도 고치고 늘릴 수 있게 정리한 안내예요.
지금은 **틀(초안)**이에요. 차시 화면이 생기는 단계와 사이트를 다듬는 단계(Phase 6)에서 실제로 따라 해 보며 고쳐요.
사이트·저장소 주소와 명령어 목록은 [README.md](README.md)에 있어요.

## 1. 새 차시 더하기 — 마크다운 1개 + 예제 1개

코드를 고치지 않고 파일 두 개만 더하면 새 차시가 생기게 만들어요.
push한 뒤 2분 안에 새 차시 주소가 열리는 것이 목표예요(Phase 6에서 실제로 잴 거예요).

### 1-1. 파일 두 개 만들기

| 파일 | 위치 규칙 | 예 |
|---|---|---|
| 차시 본문 | `content/lessons/u대단원번호/차시번호.md` | `content/lessons/u2/2-1-1.md` |
| 예제 코드 | `examples/실습실/u대단원번호/차시번호-짧은이름.py` | `examples/esp32/u2/2-1-1-touch-led.py` |

- 파일·폴더 이름은 영문 소문자·숫자·하이픈(-)만 써요. 예제 파일 이름에는 밑줄(_)도 돼요.
- 한글, 띄어쓰기, 대문자는 파일 이름에 쓰지 않아요. 보충 차시는 `v1.md`처럼 소문자로 써요.
- 차시 주소는 `/learn/u대단원번호/파일이름/`이에요(예: `content/lessons/u2/2-1-1.md` → `/learn/u2/2-1-1/`). 대단원 번호는 폴더가 아니라 설정 칸의 `unit`이 정하니, 폴더(`u2`)와 `unit: 2`를 같게 적어요. 다르면 빌드 기록에 경고가 남아요.

### 1-2. 차시 파일 맨 위(설정 칸, frontmatter) 적기

```yaml
---
title: 터치 센서를 누르면 LED가 켜져요
unit: 2
order: 1
standards: ["12인피02-01"]
duration: 50
lab: esp32
virtual_ok: true
difficulty: 1
examples:
  - file: esp32/u2/2-1-1-touch-led.py
    parts:
      - { type: builtin_led, pin: 2 }
      - { type: touch_digital, pin: 17 }
quiz:
  - q: 내장 LED는 몇 번 핀에 연결되어 있나요?
    choices: ["0번", "2번", "21번"]
    answer: 1
---
```

| 필드 | 꼭 적나요? | 뜻 |
|---|---|---|
| `title` | 꼭 | 차시 제목 |
| `unit` | 꼭 | 대단원 번호 1~4 |
| `order` | 꼭 | 단원 안 순서. 사이에 넣을 때는 2.5처럼 소수도 돼요 |
| `label` | | 차시 번호. 예: `2-1-1`, `V4`. 차례표(`src/components/lesson/curriculum.ts`)와 같게 적으면 배우기 목록의 "준비 중" 카드 자리가 링크 카드로 바뀌어요 |
| `description` | | 차시 제목 아래에 보이는 한 줄 소개 |
| `pages` | | 교과서 쪽. 예: `"008~012"` |
| `materials` | | 준비물 목록. 비워 두면 "따로 준비할 것 없음"으로 보여요 |
| `standards` | | 성취기준 코드 목록. 확인되지 않았으면 `[]`로 두면 화면에 "성취기준 코드 확인 중"이 보여요 |
| `duration` | | 걸리는 시간(분) |
| `lab` | | 따라하기에 쓰는 실습실: `vision`, `esp32`, `iot` |
| `virtual_ok` | | 가상 보드만으로 끝까지 할 수 있으면 `true` |
| `difficulty` | | 난이도 1(쉬움)~3(어려움) |
| `examples` | | 예제 파일(`examples/` 뒤의 경로)과 배선(`parts`) |
| `quiz` | | 확인 퀴즈. `answer`는 보기의 순번이고 첫 보기가 0이에요 |
| `kind` | | `textbook`(기본)·`supplement`(보충)·`reading`(읽기 자료)·`review`(대단원 마무리) |
| `draft` | | 아직 공개하지 않을 초안이면 `true` |

- 전체 규칙은 `src/config/content-schemas.ts`에 있어요.
- 틀리게 적으면 빌드가 차시 파일 이름과 함께 한국어로 알려 줘요. 예: "차시 제목(title)을 적어요."

### 1-3. 본문 쓰기

- 본문은 8칸을 `##` 제목으로 순서대로 써요: `## 학습목표` → `## 왜 배울까` → `## 핵심 개념` → `## 따라하기` → `## 바꿔보기` → `## 도전 과제` → `## 확인 퀴즈` → `## 교사용`(`docs/PLAN.md` §2.6). 칸이 빠지거나 순서가 바뀌면 빌드 기록에 `[차시 틀]` 경고가 남지만 빌드는 계속돼요. 더 엄격한 검사 도구는 뒤 단계(P5-02)에서 만들어요.
- 따라하기 예제 자리에는 `::예제`, 확인 퀴즈 자리에는 `::퀴즈`를 한 줄에 따로 적어요. 적지 않으면 그 칸 끝에 저절로 붙어요. 예제 파일과 퀴즈 내용은 맨 위 설정 칸(`examples`, `quiz`)에 적어요.
- 그림은 사이트 뿌리 주소로 적어요. 예: `![픽셀 격자 그림](/images/lessons/u1/pixel-grid.webp)`. 차시 페이지가 사이트 주소 앞부분(`/ai-physical-computing`)을 붙여 줘요.
- 용어사전에 있는 낱말은 `:용어[픽셀]`처럼 적고, 조사는 대괄호 밖에 붙여요(`:용어[픽셀]은`). 처음 나온 곳만 굵은 링크와 풀이 툴팁이 돼요. 보이는 말이 사전 표제어와 다르면 `:용어[화소]{항목=pixel}`처럼 파일 이름을 적어요. 사전에 없는 낱말은 빌드 기록에 `[용어 표시]` 경고만 남아요.
- 새 낱말은 `content/glossary/영문-이름.md` 파일 하나로 더해요. 적는 법은 용어사전 페이지 맨 아래 교사용 안내에 있어요.
- 한 문단은 3문장 이내로, 전문 용어는 처음 나올 때 괄호로 풀어요.
- 낱말을 나열할 때는 가운뎃점(·) 대신 쉼표를 써요. 예: "손·얼굴·몸" → "손, 얼굴, 몸"(이유는 7절).
- 설명 상자는 콜론 세 개로 열고 닫아요.

```md
:::왜그럴까
임계값보다 밝은 픽셀만 흰색이 되기 때문이에요.
:::

:::교사용
학생들이 자주 막히는 곳: 핀 번호를 코드와 다르게 꽂는 경우
:::
```

- 쓸 수 있는 상자: 왜그럴까·바꿔보기·도전·힌트·정답·확인·오류·주의·참고·교사용
- 상자 안에 상자를 넣을 때는 **바깥** 상자에 콜론을 하나 더(`::::`) 써요.
- 모르는 상자 이름(오타)은 상자로 바뀌지 않고 글자 그대로 보이며, 빌드 기록에 경고가 남아요.
- 교사용·정답 상자 안의 글은 사이트 검색 결과에 나오지 않아요(학생 검색에 지도 글·정답이 보이지 않게).

### 1-4. 올리기

**방법 A — 내 컴퓨터에서 git으로**

```bash
git add content/lessons/u2/2-1-1.md examples/esp32/u2/2-1-1-touch-led.py
git commit -m "2-1-1 차시 추가: 터치 센서로 LED 켜기"
git push
```

- `git add .`은 쓰지 않아요. 원본 자료가 섞이지 않게 파일 경로를 적어요.
- 커밋할 때 저장소 안전 검사가 자동으로 돌아요.

**방법 B — GitHub 웹 화면에서**

저장소에서 폴더로 들어가 파일을 추가하고 커밋해요. 이때는 커밋 전 검사가 돌지 않지만, 배포 전에 같은 검사가 한 번 더 돌아요.

### 1-5. 반영 확인

1. 저장소의 **Actions** 탭에서 "사이트 배포" 실행이 초록색 체크가 될 때까지 기다려요.
2. 새 차시 주소를 열어요. 주소 모양: `https://songdocomputerpark-lang.github.io/ai-physical-computing/learn/u2/2-1-1/`(대단원 번호와 파일 이름). 배우기 목록(`/learn/`)에도 카드가 생겨요.
3. 이미 열어 둔 페이지는 브라우저 캐시 때문에 최대 10분 늦게 바뀔 수 있어요. 강력 새로고침(<kbd>Ctrl</kbd>+<kbd>F5</kbd>)을 해 봐요.

## 2. 예제 코드 옮기기와 실습실 예제 더하기

- 교과서·수업 자료의 예제는 원본 압축 파일에서 줄 끝만 바꿔 그대로 옮기고, 원본과 줄 수·문법을 대조해요(`docs/PLAN.md` PD-33). 코드 추출 사본은 줄 끝이 망가져 있어 쓰지 않아요.
- **옮기는 도구:** `scripts/examples-manifest.yaml`의 `examples:`에 항목(코드 id, zip 이름, zip 안 경로, 대상 경로 `examples/…py`, 저작자 `operator`/`third_party`, 사이드카 씨앗 `meta`)을 적고 `npm run examples:import`(운영자 PC — 원본 폴더가 저장소 뿌리에 있음. 다른 컴퓨터는 `npm run examples:import -- --materials <원본 폴더>`)를 실행해요. 줄 끝을 LF로 바꿔 쓰고, 파이썬 3의 `ast.parse`로 문법을 확인하고, 줄 수·SHA-256을 목록에 기록해요. 원본 결함으로 문법 오류가 나는 파일(f074)은 `expect_syntax_error: true`. `npm run examples:verify`(원본 없이 기록과 대조)는 `npm test`에 들어 있어 기록과 다르게 고친 파일을 잡아요. 자세한 규칙은 `src/lab/README.md` 6절.
- **옮긴 예제의 제목·설명:** 코드 파일에는 머리말을 넣지 않고(줄 번호 보존) 옆의 **사이드카** `<이름>.meta.yaml`에 적어요(`title`·`description`·`lesson`·`page`·`tags`·`packages`). 처음 한 번은 도구가 만들고 그 뒤로는 손으로 고쳐요(도구가 덮어쓰지 않아요). 다른 저작자의 파일은 `third-party/` 폴더 아래에만 두고 `sources.yaml`에 항목을 따로 만들어요.
- 옮긴 코드 파일은 고치지 않아요. 사이트판이 필요하면 파일을 따로 두고(`…-site.py`, PD-10), 한 줄 안에서 고칠 때는 끝에 `# [사이트판] 고친 이유` 주석을 붙여 줄 번호가 밀리지 않게 해요.
- **흉내 모듈(import mediapipe·pyautogui 같은 것) 더하기:** `src/lab/modules/<id>/` 폴더 하나(`manifest.ts`·`index.ts`·`apc_<이름>.py`·`panel.astro`)를 두면 등록 파일을 고치지 않아도 실습실이 찾아요. 규약·훅·테스트 방법·금지 사항은 `src/lab/README.md` 4절, 예시는 `src/lab/modules/hello/`.
- **영상처리 실습실 예제 더하기:** `examples/vision/` 아래에 `.py` 파일 하나를 두면 실습실의 [예제 불러오기] 목록에 저절로 들어가요(코드 수정 없음).
  - 첫 줄 주석(`# 첫 실습: …`)이 목록에 보이는 제목, 둘째 줄 주석이 한 줄 설명이에요. `# @slider`·`# @lesson` 같은 규약 주석은 설명으로 쓰지 않아요. 사이트가 만든 예제의 머리말 규약 전체(`# @lesson 차시`, `# @tags 낱말`, 코드 끝의 "바꿔볼 것 3가지"·"왜 이런 결과가 나올까" 상자)는 `src/lab/README.md` 2절에 있어요. 원본 자료에서 옮긴 예제에는 머리말을 넣지 않아요(줄 번호를 지키려고).
  - 파일 이름(영문 소문자·숫자·하이픈)이 예제 id가 되고, 하위 폴더가 있으면 `폴더-파일` 순으로 이어요(`u1/v4-blur-edge.py` → `u1-v4-blur-edge`).
  - 차시 파일(frontmatter)에서 같은 경로(`vision/u1/v4-blur-edge.py`)를 적으면 [실습실에서 열기]가 그 예제를 고른 채 실습실을 열어요. 실습실 위에는 거꾸로 "이 예제가 나오는 차시" 링크가 생겨요(차시 frontmatter의 `examples`, 없으면 사이드카 `lesson`·머리말 `# @lesson`이 가리키는 차시가 있을 때).
  - 차시 본문에 실습실 주소를 손으로 적을 때(`…/labs/vision/?example=vision/u1/…py`)는 경로를 정확히 적어요. 없는 파일이면 실습실이 첫 예제를 열면서 "링크에 적힌 예제를 찾지 못했어요"라고 알리고, `npm run check:links`가 `example-not-found`로 잡아요.
  - 새 하위 폴더(예: `examples/vision/u5/`)를 만들면 [예제 불러오기] 목록의 묶음 이름을 `src/lab/vision/examples.ts`의 `EXAMPLE_GROUPS`에 한 줄 더해요(안 더하면 폴더 이름 그대로 맨 뒤에 묶여요).
  - 카메라·창 코드는 PC용 그대로 써요(`cv2.VideoCapture(0)`, `cap.read()`, `cv2.imshow`, `cv2.waitKey(1) & 0xFF == ord('q')`). 실습실이 웹캠이나 샘플 입력을 연결해요.
  - **조절 막대 만들기:** 값을 정하는 줄 끝에 `# @slider 최소 최대 간격`을 붙이면(예: `threshold = 100  # @slider 0 255 1`) 실습실 오른쪽 아래 조절 패널에 슬라이더가 생겨요. `mode = "edge"  # @select edge blur gray`는 고르기 상자, `show = True  # @toggle`은 켜기·끄기예요. 들여쓰기 없는 줄에서만 되고, 규약 앞뒤에 적은 말은 설명으로 보여요. 슬라이더를 움직이면 코드의 숫자가 함께 바뀌고 실행 중이면 코드가 그 값을 다음에 쓸 때(영상처리는 다음 프레임, 가상 보드는 다음 반복)부터 반영돼요. 잘못 쓰면 패널에 한국어 경고가 나와요(`src/lab/README.md` 1절).

  - **예제를 더하면 스모크 테스트가 한 번 돌려 봐요:** `npm run test:e2e`의 `tests/e2e/examples-smoke.spec.ts`가 옮긴 예제 전부를 실습실에서 한 번씩 실행해 파이썬 오류로 끝나지 않는지 봐요. 원본이 **일부러 오류로 끝나는 예제**(오류 읽기 연습)는 사이드카에 이렇게 적어 두면 그대로 통과해요.

    ```yaml
    smoke:
      outcome: error        # ok | stopped | error (적지 않으면 "오류만 아니면 통과")
      error: AttributeError # 콘솔에 보여야 하는 오류 이름
      input: replay         # sample | replay | webcam (적지 않으면 tags로 고름)
      seconds: 6            # 지켜보는 시간(기본 3.5초)
      skip: "왜 지금은 안 돌리는지"
    ```

    새로 옮긴 예제만 먼저 돌려 보려면 코드 id를 적어요: `SMOKE_ONLY=f090,f091 npx playwright test tests/e2e/examples-smoke.spec.ts --project=desktop`(개발 서버에 대고 돌릴 때는 앞에 `PW_BASE_URL=http://localhost:4321/ai-physical-computing/`).

- **ESP32 실습실 예제 더하기(가상 보드):** `examples/esp32/` 아래에 `.py` 파일 하나를 두면 [예제 불러오기] 목록에 들어가요(원본에서 옮긴 교과서 예제는 `examples/esp32/u2/` 같은 단원 폴더와 사이드카). 보드에 붙은 내장 LED(GPIO2)·BOOT 버튼(GPIO0) 말고 **바깥 부품을 쓰면 배선을 적어요** — 그러면 보드 아래에 부품과 선(배선도)이 그려지고, 코드가 배선과 다르게 핀을 쓰면 실습실이 한국어로 알려 줘요.
  - 사이트가 만든 예제: 파일 머리말에 부품 하나당 한 줄 `# @part touch-digital 17`(핀이 여러 개인 부품은 `# @part rgb-led r=27 g=32 b=33`).
  - 원본에서 옮긴 예제: 사이드카에 `parts: [{ part: touch-digital, pin: 17 }]`(이관 목록 `meta`에 적어 두면 도구가 사이드카로 옮겨요).
  - 차시 파일(frontmatter)의 `examples:` 항목에 `parts: [{ type: touch_digital, pin: 17 }]`처럼 적으면 그것이 가장 먼저 쓰여요.
  - 지금 가상 보드가 아는 부품 이름: `touch-digital`(터치 센서, 기본 17번), `vibration-motor`(진동 모터, 기본 19번 — 원고에 핀이 없어 사이트가 정한 핀). 아직 없는 부품을 적으면 "가상 보드에 아직 없어요"라는 주의가 보이고 그 부품은 그려지지 않아요. 부품 이름·검사 목록 전체는 `src/lab/README.md` 7.4·7.5절이에요.
  - **실습 방법**도 적어 두면 보드 그림 위에 "이 예제 실습 방법"으로 보여요: 사이트가 만든 예제는 코드 끝에 `# ── 실습 방법 ──` 상자(줄마다 한 단계), 옮긴 예제는 사이드카에 `practice: ["[실행]을 눌러요.", "터치 센서를 누르고 있어요."]`.
  - 새 부품은 `src/lab/modules/board/parts/<부품 이름>/part.ts` 폴더 하나와 테스트 파일 `tests/unit/lab/board-part-<부품 이름>.test.ts`로 더해요(등록 파일 수정 없음).

## 2-1. 오류 풀이 항목 더하기

실습실에서 파이썬 오류가 나면 콘솔 위에 "오류 풀이" 카드가 열리고, 같은 글이 [문제 해결 → 파이썬 오류 사전](https://songdocomputerpark-lang.github.io/ai-physical-computing/help/errors/)에도 나와요. 항목은 **파일 하나**에 모여 있어 코드를 고치지 않고 더할 수 있어요.

1. 실습실 콘솔이나 카드의 **마지막 줄**(예: `NameError: name 'total' is not defined`)을 그대로 적어 둬요.
2. `content/help/errors/errors.yaml`의 `entries:` 끝에 항목 하나를 더해요. 꼭 필요한 것은 `id`·`group`·`title`·`meaning`·`fix`와 `types`(예외 종류) 또는 `patterns`(메시지 정규식) 가운데 하나예요. 필드 설명은 그 파일 맨 위에 있어요.
3. `npx vitest run tests/unit/errors`로 형식 검사를 돌려요(빌드도 같은 검사를 하고, 틀리면 어디가 틀렸는지 한국어로 알려 줘요).
4. 끝이에요. 새 항목은 사전 페이지와 실습실 카드에 함께 나와요.

같은 오류에 여러 항목이 맞으면 점수(종류 2 + 메시지 패턴 4 + 트레이스백 패턴 4 + `priority`)가 높은 항목이 뽑혀요. 학생이 읽는 글이라 영문 이름 뒤에 조사 자리(`{name:을/를}`)는 쓰지 않아요("을(를)"로 보여요).

**고칠 것이 없는 안내**(예: [정지]로 멈춤)는 항목에 `level: notice`를 적어요. 그러면 카드와 사전이 빨간 오류 상자 대신 파란 안내 상자로 그려요 — 고1은 글보다 색을 먼저 읽어서, 정상 종료를 빨간 카드로 보여 주면 고장으로 오해해요.

**항목 수를 문서에 적을 때**는 `content/help/errors/errors.yaml`의 `entries`(풀이)·`groups`(묶음) 길이를 세요. 사전 페이지 맨 위에도 "오류 풀이 N개"로 나와요.

Pyodide 판을 올렸다면 `node --experimental-wasm-jspi tests/unit/errors/helpers/pyodide-traceback-run.mjs . --write`로 채집본(`tests/unit/errors/fixtures/tracebacks.json`)을 다시 만든 뒤 테스트를 돌려요.

## 2-2. 가상 보드에 부품 더하기 — 폴더 하나

ESP32 실습실의 가상 보드에 부품(센서·LED·화면 등)을 더할 때는 **폴더 하나**만 만들면 돼요. 등록 파일을 고칠 필요가 없어요(사이트가 폴더를 저절로 찾아요).

1. `src/lab/modules/board/parts/<부품 id>/part.ts`를 만들어요. 부품 id는 영문 소문자·하이픈이고(예: `touch-digital`), 파일은 부품 정의 하나를 내보내요 — 이름·설명·핀 역할·크기·그림(`render`)·모습 값(`visual`)이에요. 칸 설명과 본보기는 `src/lab/README.md` 7.5·7.9에 있어요.
2. 부품이 파이썬 쪽에서 할 일이 있으면(예: I2C 주소에 대답하기) 같은 폴더에 `apc_part_<이름>.py`를 두고 정의의 `python` 칸에 적어요. 학생이 `import`하는 드라이버(예: `neopixel.py`)도 같은 폴더에 둬요.
3. 그림은 **직접 그린 SVG**만 써요(업체 이름·로고·제품 사진 금지). 색만으로 알리지 않고 글자도 함께 적어요(예: "켜짐"·"꺼짐").
4. `tests/unit/lab/board-part-<부품 id>.test.ts`를 만들어요. 이 파일이 없으면 `npm test`가 막아요(도우미 `tests/unit/lab/helpers/board-snapshot.ts`).
5. `npx vitest run tests/unit/lab/board-parts.test.ts`로 규칙 검사를 돌리고, 예제 사이드카의 `parts:`에 부품을 적어 실습실에서 눈으로 봐요.
6. 실물 보드로 확인할 것이 있으면(핀 번호·극성·소리) `docs/PLAN.md` 부록 B-2에 줄을 더하고 `src/lab/esp32/check/items.ts`에 점검 항목을 더해요(아래 2-3).
7. 실물 보드에서 학생이 `import`할 드라이버 파일이 필요하면(예: OLED의 `ssd1306.py`) `examples/esp32/lib/`에 그 파일을 두세요. 부품 폴더 안의 드라이버는 **가상 보드에만** 있어서, [실제 보드]에서는 사이트가 "이 파일을 보드에 먼저 올려야 해요"라고만 알려요(`src/lab/esp32/board-libraries.ts`의 `VIRTUAL_ONLY_MODULES`).

## 2-3. 실물 점검 도우미에 항목 더하기

[실물 점검 도우미](https://songdocomputerpark-lang.github.io/ai-physical-computing/labs/esp32/check/)는 키트 보드가 사이트 예제대로 움직이는지 선생님이 하나씩 확인하는 화면이에요. 항목은 **파일 하나**에 모여 있어요.

1. `src/lab/esp32/check/items.ts`의 `CHECK_ITEMS`에 항목 하나를 더해요: `id`·`b2`(부록 B-2 번호)·`title`·`why`·`minutes`(예상 시간, 추정)·`wiring`(배선, 없으면 `[]`)·`code`(보낼 코드)·`questions`(예/아니오로 답할 것).
2. `code`는 **실물 MicroPython에서 도는 코드만** 써요(사이트 흉내 이름 금지). 끝없는 반복(`while True`)을 쓰지 않고, 눈으로 볼 시간이 필요하면 `seconds`로 지켜본 뒤 [정지]가 되게 해요.
3. `wiring`은 예제 사이드카의 `parts:`와 같은 모양이라, 적으면 배선 그림이 저절로 그려져요.
4. 움직이거나 빛을 내는 부품(팬·서보·레이저)이면 `prepare` 끝에 안전 안내를 한 줄 적어요(예: "팬이 도는 동안 날개에 손대지 않고, 프로펠러 주변을 비워 둬요.").
5. `npx vitest run tests/unit/esp32-check`로 규칙 검사(코드·글·배선·라이브러리)를 돌려요.

## 3. 그림 넣기와 출처 등록

### 3-1. 원고 그림 넣기 — 목록에 적기 → 도구로 꺼내기 → 눈 확인 기록 → 대체 글

교과서 원고·블루투스 교안·PyAutoGUI 슬라이드의 그림은 **원고 이미지 추출 도구로만** 꺼내요(`docs/PLAN.md` §9.3, PD-18). 도구는

- 차시마다 따로인 **그림 목록**에 적은 그림만 꺼내요(적지 않은 그림은 꺼내지 않아요).
- 픽셀만 새 WebP 파일로 다시 저장해, 원본 그림에 붙어 있던 정보(촬영 기기, 작업 컴퓨터 경로, 원본 파일 이름 = 메타데이터)를 지워요. 저장한 뒤 파일을 다시 열어 한 번 더 확인해요.
- 얼굴·화면 속 경로·기기 주소·학교명이 있는 **제외 쪽**(`scripts/image-exclusions.yaml`)은 목록에 적어도 꺼내지 않아요.
- 원본 그림의 이름표·제작자 표기를 읽어 **다른 사람의 권리가 있는 그림**(출판사 삽화, 스톡 그림)을 알려 줘요.
- OpenCV 얼굴 검출(사이트와 같은 OpenCV 4.11)로 얼굴처럼 보이는 곳을 경고해요. 경고일 뿐이라 사람이 한 장씩 보는 눈 확인을 대신하지 않아요.

**준비:** 원본 폴더(운영자 PC는 저장소 뿌리에 이미 있어요. 다른 컴퓨터는 비공개 자료 저장소의 `originals/`를 `--materials <폴더>`로 알려 줘요), PyMuPDF·Pillow·numpy가 깔린 파이썬 3(다른 파이썬을 쓰려면 `APC_PYTHON`, 예: `APC_PYTHON="py -3.11"`), 얼굴 검사용 OpenCV 휠(`npm test`를 한 번 돌리면 `.cache/pyodide-packages/`에 받아져요 — 도구는 스스로 내려받지 않아요).

1. **쪽 보기:** `npm run images:show -- U1 14`를 실행하면 `.cache/lesson-images/show/U1-014.png`(이 컴퓨터에만 있고 git에 올라가지 않아요)가 생겨요. 쪽 위에 50pt 격자, 그림 번호(`image …`, 주황), 권리 표기가 붙은 그림 자리(보라)가 그려지고, 터미널에 같은 내용이 표로 나와요.
   - 원본 약칭: `U1`(교과서 I단원), `U2A`·`U2B`·`U2C`(II단원), `U3`(III단원), `BT`(블루투스 교안), `PPT`(PyAutoGUI 슬라이드).
   - 쪽 번호: 교과서는 **인쇄 쪽 번호**(쪽 아래에 찍힌 번호, 예: 14), 교안은 PDF 쪽 번호, 슬라이드는 슬라이드 번호.
2. **목록에 적기:** 차시 md 바로 옆에 `<차시 파일 이름>.images.yaml`을 만들어요. 예: `content/lessons/u1/1-1-2.md` → `content/lessons/u1/1-1-2.images.yaml`. 본보기는 그 두 차시의 목록 파일이에요.

   ```yaml
   images:
     - name: cnn-stages                  # 파일 이름(영문 소문자·숫자·하이픈) → public/images/lessons/1-1-2/…/cnn-stages.webp
       use: 1-1-2 핵심 개념 — CNN 단계 그림(원고 014쪽)   # 어느 차시 어느 칸에 쓰는지
       alt: 고양이 그림을 입력으로 받아 … 고양이라고 예측하는 CNN 단계 그림   # 대체 글(아래 5번)
       from:
         source: U1
         page: 14                          # 인쇄 쪽
         region: [62, 476, 528, 712]       # 그 쪽의 왼쪽 위가 (0, 0)인 pt 좌표 [x0, y0, x1, y1]
       third_party: publisher            # 다른 사람의 권리가 있는 그림일 때만(아래 설명)
   ```

   - `region`(권장): 쪽에 **보이는 그대로** 그려서 꺼내요. 미리 보기의 격자에서 좌표를 읽어요.
   - `image: 697`: PDF 안의 그림을 통째로 꺼내요. 쪽에서 카드 뒤에 가려진 부분까지 나올 수 있어서, 미리 보기에 `(hidden?)`이 붙거나 표에 "쪽에 보이는 모습과 달라요"라고 나온 그림은 `region`으로 꺼내요. PPT는 `picture: 2`(슬라이드 안 그림 순번)로 꺼내요.
   - 고를 수 있는 칸: `crop`(꺼낸 그림에서 다시 자를 픽셀 영역), `dpi`(region을 그리는 해상도, 기본 220 — 작은 그림은 300), `max_width`(기본 960px), `quality`(기본 85), `lossless: true`, 장식 그림이면 `decorative: true`와 `alt: ""`.
   - 한 차시가 결과 폴더 이름을 바꿔야 할 때만 맨 위에 `folder:`를 적어요. 단원마다 같은 파일 이름을 쓰는 대단원 마무리(`review.md`)는 `folder: u1-review`처럼 적어요.
   - **다른 사람의 권리가 있는 그림(`third_party`):** 도구가 원본 그림의 이름표·제작자 표기를 읽어 "third_party: …을(를) 적어요"라고 알려 주면 그대로 적어요. 출판사가 조판할 때 넣은 삽화·컷(이름표 "인피컴_…(삽)"·"인피컴_…(컷)")은 `publisher`예요(운영자 할 일 13번 기본값). 지금 `sources.yaml`에 있는 키는 `publisher`·`visual-generation`·`bashta`이고, 처음 보는 권리자면 도구가 알려 주는 모양대로 `sources.yaml`에 항목을 하나 더해요(`paths: public/images/lessons/*/third-party/<키>/**`). 도구가 알려 주지 않아도 로봇 마스코트·단원 표지 그림처럼 출판사가 그린 것으로 보이면 `publisher`로 적어요.
3. **꺼내기:** `npm run images:extract -- 1-1-2`(그림 몇 장만: `-- 1-1-2 --only cnn-stages`). 결과는 `public/images/lessons/1-1-2/<name>.webp`, 제3자 그림은 `public/images/lessons/1-1-2/third-party/<키>/<name>.webp`예요. 도구가 목록의 그 항목에 `file`·`width`·`height`·`bytes`·`sha256`·`checks`를 적어요(손으로 고치지 않아요). 같은 컴퓨터에서 같은 설정으로 다시 꺼내면 같은 파일이 나와요(PyMuPDF·Pillow 판이 다른 컴퓨터에서는 조금 다른 파일이 나올 수 있어요 — `checks.tool`에 판이 적혀 있어요).
4. **눈 확인 기록:** 새로 꺼낸 그림을 **한 장씩 열어** 얼굴·이름·화면 속 경로·파일 이름·기기 주소·학교명이 없는지 보고, 그 항목 끝에 적어요. 도구가 마지막에 적는 모양을 보여 줘요. `checks.faces`가 0이 아니면 그 자리(`face_boxes`)를 꼭 봐요 — 조각상·무늬를 얼굴로 볼 때도 많지만, 사람 얼굴이면 쓰지 않아요.

   ```yaml
       reviewed:
         by: claude
         date: 2026-09-25
         result: 통과 — CNN 단계 도식과 고양이 그림만 있음. 사람·이름·화면 속 경로·파일명·기기 주소·학교명 없음
   ```

   그림을 다시 꺼내 내용이 바뀌면 도구가 이 기록을 지워요. 다시 보고 적어요.
5. **본문에 넣기와 대체 글:** 목록의 `alt`를 그대로 옮겨 `![고양이 그림을 입력으로 받아 … CNN 단계 그림](/images/lessons/1-1-2/third-party/publisher/cnn-stages.webp)`처럼 적어요. 대체 글은 그림을 볼 수 없는 사람이 듣는 글이라 "그림"이라는 말보다 **무엇이 보이는지와 그 뜻**을 한 문장으로 적어요. 장식 그림은 `![](…)`처럼 비워요.
6. **검사와 커밋:** `npm run images:check`(원본 없이 목록·파일·sha256·메타데이터·`sources.yaml` 연결을 봐요. `npm test`에도 들어 있어요) → 목록 파일과 그림을 **함께** 스테이징해요. 예: `git add content/lessons/u1/1-1-2.images.yaml public/images/lessons/1-1-2/`. 커밋 전 저장소 검사는 **스테이징된** 목록에서 눈 확인 기록을 읽어요(목록을 빼고 그림만 올리면 막혀요).

**제외 쪽(`scripts/image-exclusions.yaml`, INVENTORY §6):** 차시를 쓰는 사람은 이 파일을 고치지 않아요(운영자가 할 일 4·7번에 답했을 때만 고쳐요).

- `never` — 어떤 경우에도 꺼내지 않아요: 블루투스 교안 p1(표지 학교명)·p5(홍보 이미지 속 인물)·학급 게시물 화면, 원고 021쪽.
- `region` — 얼굴·경로·기기 주소가 있는 쪽(원고 013·015·016·029·033·034·035·037·040·156·194·197·198·200·202·204·206쪽, 교안 p6·p9·p51·p58·p72·p74·p75·p76·p80·p84·p91): 그 부분을 뺀 `region`에 `privacy_override: 무엇을 잘라 냈는지`를 적어야 꺼내요. 그림 번호(`image`)로는 꺼낼 수 없어요. 얼굴이 있는 쪽은 **엄격 얼굴 검사**를 해서, 얼굴처럼 보이는 곳이 하나라도 나오면 도구가 그림을 지우고 멈춰요(끄는 방법 없음). 2026-09-25에 해 보니 015쪽 강아지·고양이 사진, 016쪽 엄지 든 손 사진·자세 랜드마크 그림도 이 검사에 걸렸어요 — 그런 그림은 사이트가 그린 그림(INVENTORY §5.3)으로 대신해요.

### 3-2. 그 밖의 그림(사이트가 그린 그림, 화면 찍기 등)

1. **위치:** 사이트가 직접 그린 그림(SVG)은 `public/images/site/`나 보충 차시 도해 폴더 `public/images/lessons/supplement/`에 둬요. 파일 이름은 영문 소문자·숫자·하이픈으로 써요.
2. **눈으로 확인:** 사진·그림(png·jpg·webp 등, 사진이 든 SVG 포함)은 저장소 어느 폴더에 두든 한 장씩 열어 얼굴·이름·화면 속 경로·파일 이름·기기 주소·학교명이 없는지 보고 기록해요. 차시 그림 폴더에 두는 그림은 그 차시의 그림 목록에 `origin:`(어디서 왔는지)과 `file:`을 적어 `npm run images:extract -- <차시>`로 크기·sha256을 기록하고, 차시 밖 그림은 `scripts/image-allowlist.yaml`에 적어요. 기록이 없으면 커밋이 막혀요. 글이나 코드 파일 안에 `data:` 주소로 넣은 사진도 마찬가지예요(되도록 그림 파일로 빼요).

   ```yaml
   images:
     - path: public/images/site/pixel-grid.png
       reviewed:
         by: 확인한 사람
         date: 2026-09-20
         result: 통과 — 얼굴·이름·경로·파일명·기기 주소·학교명 없음
   ```

3. **메타데이터:** 저장소 검사는 그림 안에 남은 메타데이터(WebP의 EXIF·XMP·ICC, PNG의 글 조각, JPEG의 EXIF·XMP·ICC·주석)도 막아요. 편집기에서 "메타데이터 없이 저장"하거나 WebP로 다시 저장해요. avif·tif·heic는 확인할 수 없어 막혀요.
4. **출처:** 교과서 원고·교안의 그림과 사이트가 그린 그림은 이미 등록된 항목에 들어가요. 다른 사람이 만든 그림은 `third-party/` 폴더에 넣고 `sources.yaml`에 항목을 새로 만들어요.
5. **설명 글:** 본문에 그림을 넣을 때는 그림을 볼 수 없는 사람을 위한 설명(대체 텍스트)을 꼭 적어요.
6. 5MB가 넘는 파일과 `.pdf`·`.pptx` 파일은 저장소 검사가 막아요. 꼭 필요하면 `scripts/repo-allowlist.yaml`에 이유와 함께 적어요.

## 4. 외부 자료·라이브러리 등록(`sources.yaml`)

- 외부 자료는 쓰기 **전에** 등록해요. 적는 필드와 예시는 `sources.yaml` 맨 위 설명에 있어요.
- 분류(`category`)가 `operator`(운영자 자료)·`self`(사이트 자체 제작)면 사이트 라이선스를 따르고, 나머지(`library`·`third_party`·`stack`·`reference`)는 사이트 라이선스에서 빠지고 원래 조건을 따라요.
- 빌드하면 출처와 라이선스 페이지(`/credits/`)가 자동으로 바뀌어요.
- npm 패키지를 새로 넣을 때는 ① `npm install 이름@정확한버전`으로 설치하고 ② `sources.yaml`에 항목을 만들고(라이선스는 `node_modules/이름/LICENSE`로 확인) ③ 라이선스가 고지를 요구하면(MIT 등) 고지 원문을 `public/licenses/이름.txt`로 옮겨 `notice`에 적어요. `npm run build`가 끝나면 번들에 함께 들어간 다른 패키지 이름을 알려 주니, 그 패키지도 항목에 더해요(전이 의존성).
- 고지 원문에 저작자 이메일이 있으면 저장소 검사(커밋 전 훅)가 막아요. 그 파일만 `scripts/repo-allowlist.yaml`의 `privacy_exceptions`에 경로·`kinds: [email]`·이유를 적어요(`public/licenses/` 아래 파일과 `package-lock.json`만 허용돼요 — 잠금 파일은 npm이 다른 패키지의 deprecated 안내문을 그대로 기록하는데 거기에 그 패키지 저작자의 공개 주소가 들어올 수 있어요. 운영자·학생 정보는 어떤 경우에도 예외로 두지 않아요).

## 4-1. 로딩·캐시와 오프라인(P2-05)

- **같은 사이트 예비본:** 학교 네트워크가 jsDelivr를 막아도 실습이 열리게, 빌드가 `public/vendor/pyodide/<판>/`에 파이썬 파일 7개(25.9MB)를 채워요(`npm run pyodide:fallback`, `npm run build` 앞에서 자동). 저장소에는 넣지 않아요. Pyodide 판을 올리면 `src/lab/loader/pyodide-files.ts`의 표(이름·크기·SHA-256)도 함께 고쳐야 해요 — 안 고치면 스크립트와 단위 테스트가 막아요.
- **서비스 워커:** `npm run build` 뒤 `dist/sw.js`가 생겨요(`npm run sw`로 따로도 만들 수 있어요). 캐시 이름·용량 한도·사전 캐시 예산은 `src/lab/loader/constants.ts` 한 곳이에요. 사전 캐시가 예산(700KB)을 넘으면 빌드가 멈춰요.
- **수업 전 교실 컴퓨터 준비:** 영상처리 실습실 준비 패널의 **[이 컴퓨터에 실습 파일 미리 받기]**를 한 번 누르면 약 26MB를 받아 두어 수업 중에는 인터넷 없이도 실습실이 열려요.
- **문제가 생기면:** 주소 끝에 `?sw=off`를 붙여 열면 서비스 워커 등록을 풀고 이 사이트 캐시를 모두 지워요. 다시 켜려면 `?sw=on`.
- **받은 파일 확인:** 서비스 워커는 파이썬 엔진 파일 7개를 받을 때 크기와 **SHA-256**을 표(`src/lab/loader/pyodide-files.ts`)와 대조해요. 학교 차단 장비가 보낸 안내문처럼 내용이 다른 파일은 저장하지 않고 다른 위치(jsDelivr ↔ 같은 사이트 예비본)에서 다시 받아요. 표에 없는 파일(학생 코드가 더 받는 패키지)은 Pyodide가 자체 목록(`pyodide-lock.json`)으로 확인해요.

## 4-2. 음성 인식 설정(교사용, P2-13)

- **기본은 글자 입력이에요.** 음성 예제(`speech_recognition`)를 실행하면 말 대신 문장을 적어 보내요. 마이크 권한 창이 갑자기 뜨지 않아요.
- **내 기기 안 인식:** 브라우저가 기기 안에서 한국어를 알아들을 수 있는지는 실습실 음성 패널의 [기기 안 인식 되는지 확인]이나 [사이트 설정](https://songdocomputerpark-lang.github.io/ai-physical-computing/settings/)의 [확인]을 **눌렀을 때만** 물어봐요. 그 기능이 없는 일부 크로미움 계열 브라우저는 물어보는 것만으로 탭이 오류로 닫혀서(PROGRESS 미해결 38번) 페이지를 열 때 저절로 묻지 않아요. 되는 브라우저면 "기기 안 인식" 선택지가 생기고, 그 방식은 음성을 밖으로 보내지 않아요 — 브라우저가 이 설정을 받아들이지 않으면 인식을 시작하지 않고 글자 입력으로 바꾸라고 알려요.
- **서버 인식:** 교사가 그 브라우저에서 `/settings/`의 "서버 음성 인식 허용"을 켤 때만 선택지가 생겨요(음성이 브라우저 회사 서버로 가요). 14세 미만 학생 수업에서는 켜지 않아요. [이 컴퓨터에서 내 기록 지우기]를 누르면 다시 꺼져요.

## 4-3. 블록 모드에 블록 더하기(P3-06)

ESP32 실습실 코드 칸 위의 [블록]을 누르면 블록을 끌어 놓아 코드를 만들 수 있어요. 새 블록은 세 곳에 한 줄씩 더하면 돼요.

1. `src/lab/blocks/blocks.ts`에 블록 모양(한국어 `message0`·`tooltip`)을 더해요.
2. `src/lab/blocks/codegen.ts`에 그 블록이 만들 파이썬 한 줄을 더해요. **기다리기·반복은 생성기의 `waitLine()`·`whileHeader()`·`forHeader()`만 써요**(블록 전용 호환 모드의 실행판이 저절로 따라오고 줄 수가 같아야 해요).
3. `src/lab/blocks/toolbox.ts`의 칸에 블록 이름을 더해요. 바깥 부품을 쓰는 블록이면 `src/lab/blocks/catalog.ts`의 부품 표에 한 줄(부품 폴더 id·기본 핀·변수 이름·설정 줄)을 더해요.
4. `npx vitest run tests/unit/blocks`로 검사해요 — 도구 상자의 모든 블록에 한국어 글·코드 함수가 있는지, 만든 코드가 파이썬으로 컴파일되는지, 두 판의 줄 수가 같은지, 부품 폴더가 있는지를 봐요.

## 4-4. 펌웨어 판 올리기(P3-09)

1. https://micropython.org/download/ESP32_GENERIC/ 에서 새 `.bin`을 받아 `public/firmware/v<판>/`에 둬요(옛 판 폴더는 지워요).
2. `public/firmware/manifest.json`의 `version`·`releaseDate`·`path`·`size`·`sha256`(PowerShell `Get-FileHash -Algorithm SHA256`)·`sourceUrl`·`checked`를 고쳐요.
3. `NOTICE.txt`를 새 판 폴더로 옮겨 판·해시를 고치고, `sources.yaml` 항목의 `paths`·`notice`·`fetched`를 고쳐요.
4. `src/lab/serial/banner.ts`의 `SITE_FIRMWARE_VERSION`도 같은 판으로 고쳐요(실습실이 "옛 펌웨어예요"를 알리는 기준이에요).
5. `npx vitest run tests/unit/firmware/` → `npm run build` → 보드 한 대로 [펌웨어 굽기 시작]을 확인해요.

## 4-5. 보드 준비 페이지 고치기(P3-10)

1. 드라이버·근거 주소가 바뀌면 `src/components/start/board/links.ts`만 고치고 머리말의 확인 기록·`LINKS_CHECKED_ON`을 바꿔요(`tests/e2e/start.spec.ts`도 이 주소를 읽어요).
2. 키트 부품 이름은 `src/components/start/board/kit-parts.ts`만 고쳐요(줄 수를 바꾸면 `tests/e2e/start.spec.ts`의 16줄 검사와 `start-board-data.test.ts`도 함께).
3. "포트 선택 창에 보드가 안 보여요" 안내(`PortHelp.astro`) 안에는 `<details>`를 넣지 않아요. 그 글과 "충전 전용 케이블로는 연결되지 않아요"는 페이지에 한 번만 써요(브라우저 테스트가 하나로 셈).
4. `npx vitest run tests/unit/firmware/` → `npx vitest run --config tests/unit/firmware/vitest.container.config.mjs` → `npx playwright test tests/e2e/start.spec.ts tests/e2e/start-board.spec.ts`.

## 4-6. 통신 실습 더하기 — 예제·대시보드 위젯·통신 블록(Phase 4)

통신 실습은 **컴퓨터 쪽**(영상처리 실습실)과 **보드 쪽**(ESP32 실습실) 두 화면이 짝을 이뤄요. 규약 전체는 `src/lab/README.md` 9절이에요.

**통신 예제 더하기**

1. 컴퓨터 쪽 예제는 `examples/vision/…`, 보드 쪽 예제는 `examples/esp32/…`에 `.py` 하나씩 둬요(2절과 같은 규칙 — 목록·갤러리에 저절로 들어가요). 한 차시에 두 쪽 예제를 함께 적어도 돼요. 차시의 [실습실에서 열기]는 **파일의 첫 폴더**(`vision/`·`esp32/`)로 실습실을 골라요. 틀린 실습실로 가는 링크는 `npm run check:links`가 `example-wrong-lab`으로 잡아요.
2. 보드 쪽 배선: USB-UART 변환기는 `# @part uart rx=17 tx=16`(원고 배선 그림과 같은 교차 결선 — 코드는 `UART(2, tx=17, rx=16)`), 블루투스는 `# @part ble 12`(무선은 보드 안, 12번은 `ESP32BLE.py`의 상태 LED)예요.
3. 갤러리 거르기용 태그를 사이드카나 차시에 적어요: `comm: [uart]`(uart·ble·wifi·mqtt·tab), `unit`, `difficulty`(1~3), `virtual_ok: true`(가상 보드로 끝까지 되면).
4. 사이트가 새로 쓰는 컴퓨터 쪽 예제는 `import bridge`로 보내요 — `bridge.send(값)`(값이 바뀔 때만 보내요), `bridge.event("클릭")`(한 번 일어난 일 — 합쳐지지 않아요), `bridge.send_bytes(바이트)`, 받기는 `bridge.receive()`. **통로(같은 컴퓨터 탭·블루투스·USB·MQTT)는 코드에 적지 않고** 화면의 [보내기] 패널에서 골라요. 원본에서 옮긴 예제의 `import serial`·`import bluetooth`는 그대로 둬요(사이트의 흉내가 받아요).
5. [보내기] 패널의 "한 화면에 가상 보드 열기" 목록에 보드 예제를 올리려면 `src/lab/modules/vision-bridge/index.ts`의 `BOARD_EXAMPLES`에 한 줄, 컴퓨터 쪽 예제를 열 때 먼저 고를 짝은 `BOARD_PAIR_OF`에 한 줄 더해요. 4단원 통합 화면(`/labs/unit4/`)에 짝을 보이려면 `src/lab/unit4/examples.ts`의 `PAIRS`에 한 줄이에요.
6. **MQTT 토픽**은 짧게(`esp32-01/rx`) 적어요. 가상 보드는 우리 반 접두어(무작위 12글자)를 앞에 붙여 줘요. **실물 보드는 붙이지 못하니** 실물에 올릴 코드에는 토픽 앞에 대시보드·MQTT 칸의 접두어를 직접 적어요(템플릿 `examples/esp32/templates/mqtt-pub-sub.py` 주석). 실물 보드가 공개 중계 서버에서 받는 코드는 **LED·LCD 표시만**, 허용 목록과 20바이트 검사를 넣어요. 레이저·팬·서보처럼 움직이는 장치는 공개 중계 서버 수신에 잇지 않아요(PD-29).
7. 학생 얼굴·이름·기기 주소(블루투스 주소 등)는 예제·사이드카·화면 찍기에 넣지 않아요. 주소가 꼭 보여야 하면 `XX:XX:XX:XX:XX:XX`로 적어요.
8. 확인: 예제 스모크(사이드카 `smoke`)가 한 번씩 돌려 봐요. 두 화면이 이어지는지는 `tests/e2e/bridge-vision-board.spec.ts`·`scenario-f.spec.ts`를 본떠 검사를 더해요(같은 접두어 `?bridge=<12글자>`로 두 탭을 열어요 — 글자는 l·o·0·1을 빼고 골라요).

**대시보드 위젯 더하기**(`/labs/iot/dashboard/`)

1. `src/lab/dashboard/defaults.ts`의 `WIDGET_KINDS` 표에 한 줄(종류 이름·한국어 이름·설명·기본 크기)을 더해요.
2. `src/lab/dashboard/widgets.ts`의 `createWidgetView`에 그 종류의 몸통 그리기와 값 받기 한 갈래를 더해요. 저장·끌어 옮기기·키보드로 옮기기는 저절로 따라와요.
3. 화면 글은 `src/lab/dashboard/messages.ts`(`dashText`) 한 곳에만 적어요. 그래프·게이지처럼 그림이면 라이브러리 없이 SVG로 그려요(`chart.ts`·`gauge.ts` 참고). 색만으로 알리지 않고 글자도 함께 보여요.
4. `npx vitest run tests/unit/dashboard` → `npx playwright test tests/e2e/dashboard.spec.ts --project=desktop`.

**통신 블록 더하기**(ESP32 실습실 블록 모드의 "통신" 칸)

1. 블록 모양(한국어 글·도움말)은 `src/lab/blocks/comm/blocks.ts`, 만들 파이썬 줄은 `src/lab/blocks/comm/codegen.ts`, 도구 상자 칸은 `src/lab/blocks/comm/toolbox.ts`에 더해요. 기다리기·반복 규칙은 4-3과 같아요.
2. 핀·속도·보드 이름·중계 서버 같은 기본값은 `src/lab/blocks/comm/plan.ts`의 `COMM_UART`·`COMM_BLE_NAME`·`COMM_MQTT`·`COMM_WIFI` 한 곳에서 가져다 써요(차시 글·대시보드와 값이 어긋나지 않게). 부품이 필요한 블록은 같은 파일의 부품 계획에 한 줄을 더해요 — 여러 블록이 함께 쓰는 부품 표 `src/lab/blocks/catalog.ts`는 고치지 않아요.
3. 미리 만든 블록 묶음(예제 불러오기 목록)은 `src/lab/blocks/comm/presets.ts`의 `COMM_BLOCK_PRESETS`에 더해요.
4. `npx vitest run tests/unit/blocks` → `npx playwright test tests/e2e/esp32-comm-blocks.spec.ts --project=desktop`.

## 5. 배포 확인

- **Actions** 탭의 "사이트 배포"는 저장소 안전 검사와 빌드를 나란히 돌린 뒤 배포해요. 세 작업이 모두 초록색이면 성공이에요.
- `PROGRESS.md`나 `.agent/`만 바꾼 push는 배포와 "테스트"를 돌리지 않아요. 대신 **"저장소 검사"** 워크플로가 경로에 상관없이 늘 돌아 개인정보 모양·원본 형식을 봐요(그 파일들도 push하면 곧바로 공개 저장소에 올라가니까요).
- **"테스트"** 워크플로(단위 테스트·타입 검사·브라우저 테스트·링크 검사)는 배포와 따로 돌아요. 여기서 빨간 X가 나도 사이트는 배포되지만, 무엇이 깨졌는지 알려 주니 확인해요. 실패하면 실행 화면 아래 결과물(playwright-report)에 화면 기록이 남아요.
- 사이트 첫 화면: https://songdocomputerpark-lang.github.io/ai-physical-computing/

## 6. 빌드가 실패했을 때

1. **Actions** 탭에서 빨간 X가 붙은 실행을 열고, 실패한 작업(저장소 안전 검사 또는 빌드)의 빨간 단계를 펼쳐요.
2. 기록의 한국어 메시지로 원인을 찾아요.

   | 메시지 | 뜻 | 고치는 법 |
   |---|---|---|
   | `[출처 검사] 실패` | `sources.yaml`에 없는 파일·패키지가 있거나, 한 파일이 저작자가 다른 두 항목에 걸렸어요 | 메시지에 적힌 파일을 등록하거나 빼요 |
   | `[저장소 검사] 실패` | 원본 형식·5MB 초과·원본 파일 이름·개인정보 모양(사용자 폴더·OneDrive 경로, MAC 주소, 이메일, 전화번호, 학교 이름)·확인 기록 없는 그림(글·코드 파일 안에 넣은 그림 포함)이 있어요 | 메시지 아래 "고치는 법"을 따라요. 학교 이름처럼 글자로 적을 수 없는 이름을 더 잡게 하려면 `node scripts/privacy-needle.mjs <이름>`으로 만든 줄을 `scripts/privacy-needles.json`에 붙여요 |
   | `[출처 검사] 참고: …저작권·라이선스 표기` | 경고일 뿐 빌드는 계속돼요. 운영자 자료로 등록된 파일 머리에 다른 저작자 표기가 보여요 | 다른 사람의 파일이면 `third-party/` 폴더로 옮기고 `sources.yaml`에 항목을 따로 만들어요 |
   | `[검색 파일 정리] … 없어요` | 검색 색인을 만든 뒤 쓰지 않는 Pagefind 화면 파일을 지우는 단계인데 색인 파일이 없어요 | `npm run build`를 처음부터 다시 실행해요 |
   | 차시 파일 이름과 한국어 설명 | 차시 맨 위 설정 칸 형식이 틀렸어요 | 1-2 표를 보고 그 필드를 고쳐요 |
   | `[상자 문법] 모르는 상자 이름` | 경고일 뿐 빌드는 계속돼요 | 상자 이름 오타를 고쳐요 |
   | `[배우기] 차시 파일을 고쳐야 해요` | 두 차시 파일이 같은 주소를 써요(빌드가 멈춰요) | 메시지에 적힌 두 파일 가운데 하나의 파일 이름이나 `unit`을 고쳐요 |
   | `[차시 틀]`·`[용어 표시]`·`[배우기]` 경고 | 칸이 빠졌거나, 사전에 없는 낱말이거나, 폴더와 `unit`이 달라요(빌드는 계속돼요) | 메시지대로 고쳐요 |
   | `[링크 검사] 실패`("테스트" 워크플로) | 사이트 안 링크나 그림 주소가 틀렸어요(배포는 계속돼요) | 메시지의 파일과 주소를 보고 고쳐요. 내 컴퓨터에서는 `npm run build` 뒤 `npm run check:links` |

3. 내 컴퓨터에서 같은 오류를 보려면 `npm ci` 뒤 `npm run build`를 실행해요.
4. 그래도 모르겠으면 기록을 복사해 이슈로 남겨요. 올리기 전에 컴퓨터 사용자 이름이 든 경로가 없는지 확인해요.

## 7. 사이트 검색

- `npm run build`의 마지막 단계에서 Pagefind가 `dist/pagefind/`에 검색 색인을 만들고, 이어서 `scripts/prune-pagefind.mjs`가 쓰지 않는 Pagefind 기본 화면 파일을 지워요(검색 화면은 사이트가 직접 만들었어요).
- 색인에 넣는 곳은 페이지 본문(`<main>`)이에요. 검색 페이지와 404 페이지는 빼요. 용어사전처럼 한 페이지에 항목이 많은 페이지는 결과가 "픽셀 — 용어사전"처럼 항목 단위로 나와요(`src/config/search.ts`의 `anchorPages`).
- "준비 중이에요" 상자처럼 여러 페이지에 똑같이 들어가는 글은 `data-pagefind-ignore` 속성을 붙여 빼요. 준비 중 상자(ComingSoon)와 교사용·정답 접기 상자에는 이 속성이 자동으로 붙어요.
- Pagefind는 한국어 조사를 떼어 주지 않지만, 낱말의 앞부분으로 찾아 줘요. "픽셀"로 찾으면 "픽셀로", "픽셀과"가 든 글도 나오고, "픽셀은"으로 찾으면 "픽셀은"이 든 글만 나와요. 그래서 검색 화면에 "조사를 빼고 낱말만 넣어요" 안내를 두었어요(2026-09-16 확인).
- 가운뎃점(·)으로 이은 낱말은 한 낱말로 묶여요. "LED·버저·서보모터"는 "LED"로는 찾히지만 "버저"나 "서보"로는 찾히지 않아요. 사이트에 보이는 글에서 나열은 쉼표로 해요.
- 붙어 있는 요소(예: `<dt>`와 `<dd>`, 이어 쓴 `<span>`)의 글자는 색인에서 이어 붙어요. 검색될 글은 제목(`h2`·`h3`)이나 문단(`p`)·목록(`li`)으로 나눠 써요.

## 8. 앞으로 채울 것 (Phase 6)

- 사용자 도메인 연결법(`src/config/site.ts`의 `base`를 바꾸는 곳 포함)
- Pyodide·MediaPipe·펌웨어·npm 패키지 버전 올리기(Pyodide 버전과 받는 주소는 `src/lab/runtime/config.ts` 한 곳에서 바꾸고, 바꾼 뒤 `npm test`와 `npm run test:e2e`를 통과시켜요 — 실행 중 기다리기·정지 기능이 Pyodide의 실험 기능(`run_sync`)에 기대기 때문이에요). 코드 에디터(CodeMirror 6, `@codemirror/*`·`@lezer/*`)와 공유 링크(lz-string)는 `package.json`의 버전을 바꾼 뒤 `sources.yaml`의 버전 표기와 `public/licenses/codemirror.txt`의 패키지 목록도 같이 고치고, Esc 뒤 Tab으로 편집칸을 나가는 동작이 그대로인지 `tests/e2e/lab-editor.spec.ts`로 확인해요.
- 1년에 한 번 점검 목록: 브라우저 메뉴 이름(문제 해결 페이지 안내), 공식 링크, 출처 등록부 날짜
- 오프라인 배포판 만들기(`npm run build:offline`)
- `CHANGELOG.md`와 사이트 버전 올리기
