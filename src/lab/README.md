# 실습실 코드 안내 (`src/lab/`)

실습실(영상처리·ESP32·통신)이 함께 쓰는 브라우저 쪽 코드와 파이썬 쪽 모듈을 모아 둔 곳이에요. 큰 흐름은 `docs/PLAN.md` §4(JSPI 실행 설계)·§8.2(Phase 2 묶음), 파일 위치는 `CLAUDE.md` "기술 스택" 절에 있어요. 이 문서는 **예제 파일을 쓰는 사람(교사·기여자)이 지켜야 할 규약** 두 가지와, 다른 모듈이 조절 값을 받는 방법을 적어요.

| 폴더 | 하는 일 |
|---|---|
| `runtime/` | 파이썬 워커(Pyodide)와 화면 쪽 API `PythonRuntime`(`client.ts`), 메시지 형식(`protocol.ts`), 다리(`bridge.ts`) |
| `python/` | 워커 안에서 도는 파이썬 모듈: 도우미 `apc_runtime.py`, 흉내 모듈(`apc_cv2.py` …), 등록표 `apc_shims.py` |
| `editor/` | 코드 에디터(CodeMirror 6) |
| `controls/` | 실습실 공통 조작(`lab-shell.ts` 컨트롤러, 예제 목록 `examples.ts`, 예제 머리말 읽기 `example-meta.ts`, 자동 저장·공유 링크·내려받기) |
| `params/` | 조절 패널: 규약 파서 `parse.ts`, 화면 논리 `panel.ts` |
| `vision/` | 영상처리 실습실 화면(카메라·샘플 입력, 출력 창, 예제 목록 만들기) |

---

## 1. 조절 값 규약 — `# @slider` `# @select` `# @toggle`

코드에서 값을 정하는 줄 끝에 규약 주석을 붙이면 실습실 오른쪽 아래 **조절 패널**에 조절 막대·고르기 상자·켜기 끄기가 생겨요(SPEC §6.1). 파이썬에게는 그냥 주석이라 코드는 어디서나 그대로 돌아요.

```python
threshold = 100     # @slider 0 255 1          최소 최대 간격 (간격을 빼면 1)
blur_size = 5       # @slider 1 31 2           간격 2면 1·3·5…처럼 홀수만
ratio = 0.5         # @slider 0 1 0.1          값·최소·최대·간격 중 하나라도 소수점이 있으면 소수(float), 아니면 정수(int)
mode = "edge"       # @select edge blur gray   따옴표로 감싼 글자 값 + 고를 낱말 목록(띄어쓰기나 쉼표)
show_fps = True     # @toggle                  True 또는 False
```

- **어디에:** 들여쓰기 없는 줄(맨 바깥)에서만 돼요. 반복문 안의 줄은 코드가 매번 값을 다시 정하므로 경고만 나와요.
- **값 모양:** 숫자·따옴표 글자·`True`/`False` 하나여야 해요. `100 + 1`처럼 식이면 안 돼요(패널이 그 자리 글자를 바꿔 쓰기 때문).
- **설명:** 규약 앞이나 뒤에 적은 말은 패널에 설명으로 보여요. `threshold = 100  # @slider 0 255 1 테두리로 볼 밝기 차이`
- **틀리면:** 숫자가 아닌 값, 최소 > 최대, 간격 0, 범위·선택지 밖의 값, 겹치는 이름, 모르는 규약 이름 등은 패널의 경고 목록에 한국어로 보이고 그 줄만 건너뛰어요. 실행은 그대로 돼요.
- **값을 바꾸면:** ① 코드의 그 숫자(글자)가 함께 바뀌어요 — 그래서 [공유 링크]·[.py 내려받기]·다음 [실행]에 그 값이 그대로 담겨요. ② 실행 중이면 **다음 입력 확인 지점**(`cap.read()`, `cv2.waitKey()`, `time.sleep()`, `apc_runtime.get/poll`)에서 파이썬 전역 변수에 들어가요 → 다음 프레임부터 반영돼요. 값은 "바뀔 때 한 번"만 들어가므로, 코드가 반복문 안에서 같은 변수를 스스로 바꿔도 패널이 매번 되돌리지 않아요.
- **제한 모드(JSPI 없는 브라우저):** 코드에 적히므로 다음 [실행] 때 반영돼요(패널이 안내를 보여요).
- **알려진 빈틈:** [실행]을 누른 직후 패키지를 받는 동안 바꾼 값은 코드에는 적히지만 그 실행에는 안 들어갈 수 있어요(도우미가 실행 준비 때 쌓인 값을 버려요). 다시 움직이면 돼요.

규약을 읽는 코드는 `params/parse.ts`(순수 함수, `tests/unit/lab/params.test.ts`), 패널은 `params/panel.ts`(HTML은 `src/components/lab/ParamPanel.astro`, LabShell의 `panel` 슬롯 기본 내용)예요.

---

## 2. 예제 파일 머리말 규약 — 제목·설명·차시·태그·안내 상자

`examples/` 아래 `.py` 파일은 두 종류예요.

| 종류 | 머리말 | 제목·설명은 어디서 |
|---|---|---|
| **원본 자료에서 옮긴 예제**(교과서·교안 코드, `docs/PLAN.md` PD-33) | **넣지 않아요.** 줄 번호가 교과서와 같아야 "7번째 줄" 설명이 맞아요(PD-10) | 차시 md의 `examples:` 항목(`title`) |
| **사이트가 만든 예제**(첫 실습, 보충 V1~V5, 체험 예제) | 아래 규약대로 파일 맨 위에 적어요 | 파일 머리말(차시 md가 있으면 md가 우선) |

```python
# 첫 실습: 웹캠 영상에서 테두리(에지) 찾기        ← ① 규약(@)이 아닌 첫 주석 줄 = 제목 (목록·갤러리 카드에 보임)
# 영상을 회색으로 바꾸고 … 흰 선으로 그려요.       ← ② 둘째 주석 줄 = 한 줄 설명 (선택)
# @lesson v4                                       ← ③ 붙는 차시 (선택): content/lessons/ 파일 이름(slug). 여러 차시면 md 쪽에서 연결
# @tags 에지, 회색, Canny                          ← ④ 갤러리·검색용 낱말 (선택, 쉼표)
# 그 밖의 안내 주석은 자유롭게                      ← 셋째 줄부터의 보통 주석은 화면 어디에도 안 보임(코드 안에서만)
import cv2
...코드...

# ── 바꿔볼 것 3가지 ──                            ← ⑤ 안내 상자(SPEC §6.1). 제목 줄 뒤 주석 줄마다 항목 하나(번호는 떼어 줘요)
# 1. threshold를 30까지 내려 봐요. …
# 2. …
# 3. …
# ── 왜 이런 결과가 나올까 ──                       ← ⑥ 안내 상자. 줄마다 문장 하나
# Canny는 …
```

- 머리말은 파일 맨 위의 **이어진 주석 줄**이에요. 첫 코드 줄(`import cv2`)에서 끝나요. `# @slider` 같은 규약 줄은 제목·설명으로 쓰지 않아요.
- 안내 상자는 파일 어디든 둘 수 있지만, 학생이 코드를 먼저 보게 **코드 끝**에 두는 것을 권해요. 제목 줄의 `──` 장식은 없어도 돼요. 상자는 첫 코드 줄이나 다음 상자 제목에서 끝나요.
- 실습실 [예제 불러오기] 목록은 ①②만 써요(`vision/examples.ts`). 예제 갤러리(P4-11)와 차시 임베드(P2-14)는 `controls/example-meta.ts`의 `readExampleMeta(파일 글자)`로 ①~⑥을 모두 읽어요: `{ title, description, lesson, tags, tryIdeas, why }`. `hasGuideBoxes(meta)`가 상자 둘이 다 있는지 알려 줘요.
- 새 예제 = `.py` 파일 하나예요. 코드 수정 없이 목록에 들어가요(`MAINTENANCE.md` §2).

---

## 3. 다른 모듈이 조절 값을 받는 방법 (파라미터 반영 훅)

화면 → 파이썬 경로는 한 가지예요.

1. 조절 패널이 `lab.runtime.pushEvent('lab.params', { name, value, type })`를 보내요(`type`은 `'int' | 'float' | 'str' | 'bool'`, 채널 이름은 `params/parse.ts`의 `PARAMS_CHANNEL` = `python/apc_runtime.py`의 `PARAMS_CHANNEL`). 실행 중일 때만 보내요.
2. 워커(`runtime/worker.ts`)는 학생 코드를 돌리기 직전에 `apc_runtime.bind_run_globals(globals())`로 학생 코드의 전역 사전을 도우미에 알리고, 끝나면 `unbind_run_globals()`로 지워요. `bind`는 실행 전에 쌓인 값을 버려요.
3. 도우미 `apc_runtime.sync_params()`가 입력 확인 지점(`block_on`이 끝난 뒤, `maybe_yield` — 즉 `sleep`·`input`·`request`·`get`·`poll`을 지날 때)마다 쌓인 값을 꺼내 형 이름대로 바꿔(`int`는 반올림) `globals()[name] = 값`으로 넣어요. 이름이 파이썬 변수 이름이 아니거나 예약어면 버리고, 바꿀 수 없는 값은 콘솔에 알려요. 양보하지 않으므로 동기 진입점(초기화 함수)에서 불려도 안전해요(PROGRESS 미해결 25번 규칙).

흉내 모듈(cv2·mediapipe·pyautogui·가상 보드)은 따로 할 일이 없어요 — `apc_runtime`의 `request`·`sleep`·`get`·`poll`을 쓰면 그 자리가 곧 반영 지점이에요. 화면 쪽에서 패널 없이 값을 보내고 싶으면 같은 채널에 같은 모양으로 `pushEvent`하면 돼요(예: 차시 임베드의 버튼). 패널 자체는 `getParamPanel(root)`로 얻어 `setValue(name, value)`를 부를 수 있어요(코드도 함께 바뀌어요).
