# 실습실 코드 안내 (`src/lab/`)

실습실(영상처리·ESP32·통신)이 함께 쓰는 브라우저 쪽 코드와 파이썬 쪽 모듈을 모아 둔 곳이에요. 큰 흐름은 `docs/PLAN.md` §4(JSPI 실행 설계)·§8.2(Phase 2 묶음)·§8.3(Phase 3 묶음), 파일 위치는 `CLAUDE.md` "기술 스택" 절에 있어요. 이 문서는 **예제 파일을 쓰는 사람(교사·기여자)이 지켜야 할 규약**(1~3절), **흉내 모듈을 폴더 하나로 더하는 규약**(4절), **여러 사람이 동시에 만들 때의 검증 환경**(5절), **원본 예제 이관 도구**(6절), **가상 ESP32 보드와 부품을 더하는 규약**(7절)을 적어요.

| 폴더 | 하는 일 |
|---|---|
| `runtime/` | 파이썬 워커(Pyodide)와 화면 쪽 API `PythonRuntime`(`client.ts`), 메시지 형식(`protocol.ts`), 다리(`bridge.ts`), 설정 한 곳(`config.ts`) |
| `python/` | 워커 안에서 도는 붙박이 파이썬 모듈: 도우미 `apc_runtime.py`, 등록표 `apc_shims.py`, cv2 흉내 `apc_cv2.py`(폴더 규약 이전에 만든 것), 묶는 코드 `modules.ts` |
| `modules/` | **흉내 모듈 폴더**(4절): `<id>/manifest.ts` + `index.ts` + `*.py` + `panel.astro?`. 자동 발견(`manifests.ts`·`host.ts`). 예시 `hello/`. 가상 ESP32 보드는 `board/`(7절 — 부품은 `board/parts/<부품>/`) |
| `esp32/` | ESP32 실습실 예제 목록 만들기(`examples.ts` — `examples/esp32/**/*.py`, 보드 라이브러리 폴더 `esp32/lib/` 제외) |
| `editor/` | 코드 에디터(CodeMirror 6) |
| `controls/` | 실습실 공통 조작(`lab-shell.ts` 컨트롤러, 예제 목록 `examples.ts`, 예제 머리말 읽기 `example-meta.ts`, 사이드카 읽기 `example-sidecar.ts`(빌드 전용), 자동 저장·공유 링크·내려받기) |
| `params/` | 조절 패널: 규약 파서 `parse.ts`, 화면 논리 `panel.ts` |
| `vision/` | 영상처리 실습실 화면(카메라·샘플 입력, 출력 창, 예제 목록 만들기 `examples.ts`, 프레임 훅 `vision-lab.ts`) |

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
| **원본 자료에서 옮긴 예제**(교과서·교안 코드, `docs/PLAN.md` PD-33) | **넣지 않아요.** 줄 번호가 교과서와 같아야 "7번째 줄" 설명이 맞아요(PD-10) | 옆의 **사이드카** `<이름>.meta.yaml`(3절). 차시 md의 `examples:` 항목이 있으면 md가 우선 |
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

## 3. 사이드카 — 원본에서 옮긴 예제의 제목·설명 `<이름>.meta.yaml`

원본에서 옮긴 예제는 코드에 한 글자도 더하지 않으므로(줄 끝 CRLF → LF만), 제목·설명은 **같은 이름의 YAML 파일**에 적어요. 처음 한 번은 이관 도구(6절)가 만들고, 그 뒤로는 사람이 고쳐요(도구가 덮어쓰지 않아요). 한 예제 = 한 파일이라 여러 사람이 동시에 고쳐도 부딪히지 않아요.

```yaml
# examples/vision/u1/1-2-1-webcam-flip.meta.yaml
title: "1-2-1 기본 실습: 웹캠 영상 좌우 반전"   # 목록·갤러리 카드 제목
description: "웹캠이 열렸는지 확인하고 …"        # 한 줄 설명(선택)
lesson: 1-2-1                                   # 붙는 차시 slug(선택)
page: 28                                        # 교과서 쪽(선택)
source_id: f028                                 # 이관 기록 id(scripts/examples-manifest.yaml)
tags: [카메라, flip]                            # 갤러리·검색용 낱말(선택)
packages: [opencv-python]                       # 실행 전에 미리 받을 Pyodide 패키지(적지 않으면 실습실 기본값 opencv-python)
```

- 읽기: `controls/example-sidecar.ts`의 `readExampleSidecars(import.meta.glob('/examples/**/*.meta.yaml', { query: '?raw', eager: true, import: 'default' }))` → `{ '/examples/vision/u1/a.py': ExampleSidecar }`. **빌드 전용**이에요(YAML 파서 `yaml`을 쓰므로 `.astro` 프런트매터·Node 테스트에서만 import, 브라우저 코드에서는 금지 — 번들에 들어가면 출처 검사가 실패해요).
- 실습실 목록(`vision/examples.ts`의 `visionExamplesFromFiles(files, sidecars)`)은 사이드카 → 머리말 → 파일 이름 순서로 제목을 정하고, 폴더별 묶음(`EXAMPLE_GROUPS`: `vision`, `vision/supplement`, `vision/u1`, `vision/u3`, `vision/u4`, `vision/opmp`, `desktop`)으로 `<optgroup>`을 만들어요. 새 폴더는 그 표에 한 줄을 더하면 이름이 붙고, 더하지 않아도 맨 뒤에 폴더 이름 그대로 보여요.
- 사이트가 만든 예제(머리말 있는 파일)에도 사이드카를 둘 수 있어요(사이드카가 우선). 보통은 필요 없어요.

---

## 4. 흉내 모듈 폴더 규약 — `src/lab/modules/<id>/`

학생 코드가 PC에서처럼 `import mediapipe`, `import pyautogui`를 쓰게 하려면 파이썬 쪽 흉내 모듈과 화면 쪽 처리기가 함께 필요해요. **폴더 하나**를 두면 등록 파일을 고치지 않고도 워커·실습실 화면·빌드가 자동으로 찾아요.

```
src/lab/modules/hands/                 ← 폴더 이름 = 모듈 id(영문 소문자·숫자·하이픈)
├─ manifest.ts     순수 데이터: id, title, labs, shims, requestKinds, eventKinds, channels, packages, placement
├─ index.ts        화면 쪽: default export { manifest, mount(ctx) } — 요청·이벤트·패널·프레임 훅을 잇는다
├─ apc_hands.py    파이썬 쪽: 워커가 /apc에 써 준다. import 이름 = 파일 이름(저장소 전체에서 하나). 하위 폴더의 .py도 찾는다(보드 부품 폴더)
├─ panel.astro     (선택) 화면 조각. LabShell이 그 실습실 페이지에 hidden으로 그려 두고 ctx.panel로 넘긴다
└─ (테스트) tests/unit/lab/pyodide-<id>.test.ts + helpers/pyodide-<id>-run.mjs, tests/e2e/module-<id>.spec.ts
```

### 4.1 그림 — 누가 누구를 부르나

```
 브라우저 화면(메인 스레드)                              │ 파이썬 워커(Pyodide, 모듈 워커)
 ────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────
 LabShell.astro ──mountLabShell──▶ LabController(lab)     │  worker.ts ──load──▶ /apc/apc_runtime.py, apc_shims.py, apc_cv2.py
      │  mountParamPanel(조절 패널)                       │             └──▶ /apc/<모듈 폴더의 *.py>  (python/modules.ts가 묶음)
      │  mountLabModules(root, lab)  ← host.ts            │             └──▶ apc_shims.register_shims(SHIM_TABLE)  (manifest.shims 모음)
      │        │ manifests.ts: labs에 맞는 모듈만          │
      │        ▼ import('./<id>/index.ts')  (모듈마다 청크) │  실행 직전: install_available() → 받아 둔 패키지의 install()
      │   module.mount(ctx)                               │            reset_for_run() → register_reset_hook 함수들(동기 진입점!)
      │     ctx.onRequest('hands.process', h) ◀───────────┼─── apc_runtime.request('hands.process', payload)   (파이썬은 답을 기다림)
      │     ctx.onEvent('hands.ready', h)     ◀───────────┼─── apc_runtime.emit('hands.ready', payload, transfer=[buf])  (기다리지 않음)
      │     ctx.setValue('hands.replay', v)   ────────────┼──▶ apc_runtime.get('hands.replay', default)   (최신 값, 입력 확인 지점)
      │     ctx.pushEvent('hands.keys', v)    ────────────┼──▶ apc_runtime.poll('hands.keys')             (쌓인 값, 입력 확인 지점)
      │     ctx.vision().then(v => v.onFrame(hook))       │     apc_runtime.register_tick_hook(fn)  ← 입력 확인 지점마다(block_on 뒤·maybe_yield)
      │     ctx.panel / showPanel()  ← panel.astro        │     apc_runtime.register_reset_hook(fn) ← 실행 시작마다(양보 금지: drain만)
      ▼                                                   │
 VisionLab(vision-lab.ts): camera.read 답 직전 onFrame 훅 │  cv2 흉내(apc_cv2.py)는 붙박이 — 같은 도우미 함수만 쓴다
```

### 4.2 manifest.ts — 이름을 먼저 정한다

```ts
import type { LabModuleManifest } from '../types.ts';
const manifest: LabModuleManifest = {
  id: 'hands',                              // 폴더 이름과 같아야 함
  title: '손 인식(mediapipe.solutions.hands 흉내)',
  labs: ['vision'],                         // 붙는 실습실(LabShell labId). '*' = 모두. 개발 시험 페이지는 'dev'
  shims: { mediapipe: 'apc_mediapipe' },    // 학생이 import하는 패키지 → 이 폴더의 흉내 모듈(받아 둔 패키지가 있을 때만 install() 호출)
  packages: [],                             // 실습실이 준비될 때 미리 받을 Pyodide 패키지(선택)
  requestKinds: ['hands.process'],          // 파이썬 request(kind) — 모두 "<id>."로 시작
  eventKinds: ['hands.ready'],              // 파이썬 emit(kind)
  channels: ['hands.replay'],               // setValue/get 이름과 pushEvent/poll 채널
  placement: 'wide',                        // panel.astro 위치: 'panel'(조절 패널 아래, 기본) | 'wide'(전체 폭, 콘솔 위)
};
export default manifest;
```

빌드·테스트가 검사하는 것(`manifests.ts`의 `validateManifests`, `tests/unit/lab/modules.test.ts`): id = 폴더 이름, 이름이 `<id>.`로 시작, 다른 모듈·붙박이(`camera.*`, `window.*`, `cv2.*`, `lab.params`, `input`)와 겹치지 않음, 한 패키지는 한 모듈만 덮어씀, 흉내 모듈 이름 `apc_<이름>`이 하나뿐. 어기면 빌드가 멈춰요.

### 4.3 index.ts — 화면 쪽 훅

`mount(ctx)`가 받는 `ctx`(`types.ts`의 `LabModuleContext`):

| 훅 | 뜻 | 파이썬 짝 |
|---|---|---|
| `ctx.onRequest(kind, request => request.reply(값, [ArrayBuffer…]) 또는 request.fail('한국어 이유'))` | 파이썬이 답을 기다리는 부탁. 큰 값은 transfer로 복사 없이 옮겨요 | `apc_runtime.request(kind, payload, raw=False)` |
| `ctx.onEvent(kind, payload => …)` | 파이썬이 기다리지 않고 알린 것 | `apc_runtime.emit(kind, payload, transfer=[…])` |
| `ctx.setValue(name, value)` | 최신 값 하나(덮어씀) | `apc_runtime.get(name, default)` |
| `ctx.pushEvent(channel, value)` | 쌓이는 값(순서대로) | `apc_runtime.poll(channel)`(꺼내면 비움) |
| `ctx.onLab('run' \| 'run-pending' \| 'done' \| 'code' \| 'example' \| 'state' \| 'records-cleared', fn)` | 실습실 조작 이벤트(`LabController.on`과 같음). `run-pending`은 파이썬을 받는 동안 [실행]을 눌러 예약했을 때(준비가 끝나면 `run`이 따로 와요) | — |
| `ctx.vision()` → `VisionLab \| null` | 영상처리 실습실이면 `vision.onFrame((frame, {sourceId, now}) => …)`(cap.read 답 직전, frame.data는 답한 뒤 워커로 옮겨져 비므로 보관하려면 복사), `vision.grabFrame()`, `vision.windows`, `vision.sendKey()` | — |
| `ctx.panel`, `ctx.showPanel()`, `ctx.hidePanel()` | `panel.astro`가 그려진 요소(처음엔 hidden). **mount에서 무조건 열지 말고** `showPanelWhenUsed(ctx, /이름/)`(`modules/panel-when-used.ts`)로 코드가 그 모듈을 쓸 때만 열어요 | — |
| `ctx.storageName('설정')` → `ai-physical-computing:module:<id>:설정` | 브라우저 저장 이름(`src/lib/storage.ts` 규칙 — [이 컴퓨터에서 내 기록 지우기]가 함께 지움) | — |
| `ctx.notice('글')` | 콘솔 안내 줄 | `apc_runtime.notice(text, level)` |
| `ctx.lab`, `ctx.runtime`, `ctx.root`, `ctx.labId`, `ctx.manifest` | 컨트롤러·실행기·뿌리 요소 | — |

- `onRequest`·`onEvent`·`setValue`·`pushEvent`는 **manifest에 적은 이름만** 받아요(아니면 오류). 이름을 바꾸면 manifest부터.
- `mount`는 `{ dispose() }`를 돌려줄 수 있어요. ctx로 등록한 훅은 dispose 때 알아서 풀리고, 직접 붙인 DOM 이벤트만 풀어요.
- 실행 시작(`ctx.onLab('run')`)에 화면 값을 다시 `setValue`해 두면 정지 2단계(워커 재시작)로 값이 사라져도 복구돼요(hello 예시).
- 무거운 라이브러리(MediaPipe Tasks 등)는 index.ts 맨 위에서 import하지 말고 **처음 필요할 때 `await import()`** 해요 — index.ts 자체가 실습실마다 따로 받는 청크지만, 모듈이 붙는 순간 그 청크를 받기 때문이에요.
- **패널은 쓸 때만 연다(2026-09-17 Phase 2 검토 반영, 절대 원칙 4 "한 페이지 한 개념"):** 예전에는 모듈마다 mount에서 `showPanel()`을 불러 에지 검출 첫 실습 아래로 인식·음성·파일 패널이 줄줄이 이어졌어요. 이제는 `const gate = showPanelWhenUsed(ctx, /mediapipe/u)`처럼 코드에 이름이 보이면 열고, 파이썬이 실제로 요청을 보내면 핸들러 첫 줄에서 `gate.show()`로 못 박아요(코드를 고쳐도 닫히지 않음). 실행 전에 조작해야 하는 패널(파일 넣기)은 그 조작의 흔한 코드 모양으로 열어요(`runtime-extras/files.ts`의 `WORK_FILE_USE_PATTERN`).
- **학생에게 방금 생긴 것을 보여 줄 때**는 `revealElement(요소)`(`controls/reveal.ts`)를 써요 — 이미 충분히 보이면 움직이지 않고, 움직임 줄이기 설정이면 부드럽게 넘기지 않아요. 두 칸을 함께 보여야 하면 `revealTogether([넓은 칸, 좁은 칸], 둘째 칸, { slack })`. 실습실 틀은 [실행] 때 io 슬롯의 `[data-lab-reveal-on-run]`(넓은 결과 칸, 없으면 입력·출력 칸 전체)·`[data-lab-reveal-on-run-min]`(꼭 보여야 하는 최소 칸)과 첫 조절 막대(`[data-lab-param]`)를 함께 보이고, 오류 모듈은 풀이 카드를 보여요. **Phase 3 보드 그림 io 슬롯도 결과 부분에 이 두 표시를 달아요.** 편집칸을 스크롤할 일이 있으면 페이지까지 움직이는 CodeMirror `scrollIntoView` 대신 편집칸 안에서만(`errors/highlight.ts`의 `scrollLineInsideEditor`) 움직여요 — 방금 옮긴 화면을 되돌리지 않게.
- 조작 줄 아래 안내 줄에 한 줄로 알릴 것이 있으면 `ctx.lab.showMessage('…')`(오류로 끝났을 때 오류 모듈이 쓰는 자리). 학생이 읽는 글에는 "정지 2단계"·밀리초 같은 안쪽 용어를 넣지 않아요.

### 4.4 *.py — 파이썬 쪽 규칙

- `apc_runtime`의 `request`·`emit`·`get`·`peek`·`poll`·`drain`·`sleep`·`maybe_yield`·`check_stop`·`notice`·`register_reset_hook`·`register_tick_hook`·`register_wait_hook`·`register_finish_hook`·`register_idle_hook`만 써요. `js`·`_apc_bridge`를 직접 만지지 않아요.
  - `peek(name, default)`: `get`과 같지만 양보·정지 확인을 하지 않아요 — 초기화 함수(동기 진입점)에서 화면이 실행 직전에 넣어 둔 최신 값을 읽을 때(P3-01).
  - `register_wait_hook(fn)`: 파이썬이 **실제로 기다리기 직전**(block_on이 약속을 기다리기 전·제한 모드 sleep 전)마다 불려요. 모아 둔 상태를 기다리기 전에 화면에 보낼 때(가상 보드의 핀 상태). 양보 금지.
  - `register_idle_hook(fn)`: 학생 코드가 **오류 없이 끝난 뒤** 워커가 `run_idle()`로 불러요. `fn()`이 True를 돌려주는 동안(스스로 한 번 기다린 뒤) [정지]까지 되풀이해요 — 가상 보드의 Timer·핀 인터럽트처럼 실물에서는 코드가 끝나도 계속 도는 것. 대기 훅이 없는 실습실은 곧바로 끝나요.
- **실습실마다 넣는 파일이 달라요(P3-01):** 워커는 load 메시지의 `labId`로 그 실습실에 붙는 모듈 폴더(manifest `labs`)의 `.py`와 `shims`만 `/apc`에 넣어요(`python/modules.ts`의 `pythonModulesForLab`·`shimTableForLab`). 그래서 다른 실습실 모듈의 파일은 import되지 않아요 — 시험하려면 그 실습실 페이지(또는 manifest `labs`에 `dev`)에서 해요.
- 진짜 패키지를 덮어쓰는 모듈은 `install()`(멱등 — 두 번 불려도 한 번만)을 두고 manifest의 `shims`에 적어요. `install()`은 실행 직전 **동기 진입점**에서 불려요.
- **`shims`를 쓰지 않는 경우(P2-12·P2-13에서 나온 규약 예외):** Pyodide에 **아예 없는 패키지**(`speech_recognition`)나 **표준 라이브러리를 가리는 것**(`webbrowser`)은 `shims`에 적지 않고 **그 패키지 이름 그대로 `.py` 파일**을 모듈 폴더에 둬요. 워커가 `/apc`(sys.path 맨 앞)에 넣으므로 학생 코드의 `import speech_recognition as sr`가 내려받기 없이 그 파일을 불러요. `shims`는 **이미 받아 둔 진짜 패키지**를 덮어쓸 때만(`cv2`·`mediapipe`처럼) 써요 — `install_available()`이 그 패키지가 있을 때만 `install()`을 부르기 때문이에요.
- **실행이 끝날 때 한 번 할 일**은 `register_finish_hook(fn)`으로 등록해요(워커가 `unbind_run_globals`를 부를 때 한 번, 동기 진입점이라 양보 금지). 마지막 줄에서 파일을 저장하고 끝나는 코드처럼 틱 훅으로는 잡히지 않는 것에 써요.
- **동기 진입점 규칙(PROGRESS 미해결 25번):** `install()`, `register_reset_hook` 함수, `register_tick_hook` 함수 안에서는 양보하는 함수(`sleep`·`request`·`input`·`block_on`·`get`·`poll`)를 부르지 않아요. 쌓인 값을 버릴 때는 `drain(channel)`. 어기면 `RuntimeError: Cannot stack switch…`가 나요.
- 요청 답을 큰 바이트 배열로 받을 때는 `request(kind, payload, raw=True)`로 JsProxy를 받아 `assign_to`로 numpy에 복사해요(`apc_cv2.py`의 `_frame_to_bgr` 참고).
- 파일 맨 위 docstring에 학생 코드에서 쓰는 법을 적어요(`hello/apc_hello.py`).

### 4.5 panel.astro

HTML·CSS만 그리고 동작은 index.ts가 `data-<id>-*` 표시로 찾아 잇어요. LabShell이 `<section data-lab-module-panel="<id>" hidden>` 안에 그려요 — `placement: 'panel'`은 조절 패널 아래(오른쪽 열), `'wide'`는 입력·출력 줄과 콘솔 사이 전체 폭(가상 데스크톱처럼 넓은 화면용). 실습실 부품 클래스(`lab-button`, `lab__select`)와 디자인 토큰(`src/styles/`)을 그대로 써요. 접근성: 조작 요소에 label, 살아 있는 글에 `aria-live`, 키보드로 닿게.

### 4.6 테스트 방법

| 층 | 어떻게 | 예시 |
|---|---|---|
| 순수 논리 | Vitest. manifest 검사는 `validateManifests`에 가짜 묶음을 넘겨요 | `tests/unit/lab/modules.test.ts` |
| 파이썬 쪽 | Node의 실제 Pyodide(`--experimental-wasm-jspi`)로 도우미 스크립트를 띄워 JSON 한 줄을 읽어요. 붙박이 + 모듈 폴더의 .py를 /apc에 쓰고, 화면 흉내가 요청에 답해요. **동기 진입점 검사**(`reset_for_run`을 40ms 뒤 동기로 부름)를 꼭 넣어요 | `tests/unit/lab/pyodide-hello.test.ts` + `helpers/pyodide-hello-run.mjs`(복사해서 시작) |
| 브라우저 | Playwright. 자기 실습실 페이지를 열고 `data-lab-modules`에 id가 있는지, 패널이 보이는지, 코드를 실행해 요청·이벤트가 오가는지 | `tests/e2e/module-hello.spec.ts` |
| 네트워크 | 학생 영상·음성이 밖으로 나가지 않는지: `collectRequests(page)`(`tests/e2e/helpers/vision.ts` — 페이지가 아니라 **문맥 단위**로 들어 서비스 워커가 낸 요청까지 봐요)로 사이트 자신과 `ALLOWED_REMOTE_ORIGINS`(jsDelivr) 밖 요청이 0건 | `tests/e2e/lab-vision.spec.ts` |
| 준비 중 [실행] | Playwright의 `click()`은 단추가 켜질 때까지 기다려 줘서 "준비 중에 누른 클릭"을 못 잡아요. 준비 중 흐름을 볼 때는 `context.route`로 `pyodide.asm.wasm`을 몇 초 늦추고 `data-lab-run-pending`을 확인해요 | `tests/e2e/lab-loading.spec.ts` |

### 4.7 금지 사항

- 등록 파일을 손으로 고치지 않아요: `python/modules.ts`, `modules/manifests.ts`, `modules/host.ts`, `LabShell.astro`, `worker.ts`는 폴더를 자동으로 찾아요. 여기에 모듈 이름을 적어야 한다면 규약이 깨진 거예요. 가상 보드의 부품도 같아요: `board/parts.ts`·`board/manifest.ts`·`board/view.ts`에 부품 이름을 적지 않아요(7절).
- 다른 모듈의 이름(요청·이벤트·채널·`apc_*` 파일 이름)을 쓰지 않아요. 한 패키지를 두 모듈이 덮어쓰지 않아요.
- 화면 밖으로 데이터를 보내지 않아요(원칙 2): 외부 주소 요청 금지. 모델·WASM은 같은 사이트(`public/vendor/`, `public/models/`)에서 받아요(PD-02). 학생 영상·랜드마크를 `localStorage`·공유 링크에 넣지 않아요(PLAN §10).
- 원작 게임·실제 포털 화면을 흉내 내지 않아요(SPEC §6.1·§8). 얼굴 식별(누군지 알아보기) 기능을 넣지 않아요.
- 동기 진입점에서 양보하지 않아요(4.4). 워커에서 DOM을 쓰지 않아요(`manifest.ts`는 워커에도 들어가요 — 순수 데이터만).
- 원본에서 옮긴 예제 파일(`examples/`)을 고치지 않아요 — 사이트판이 필요하면 `…-site.py`처럼 파일을 따로 두고(PD-10) 사이드카에 적어요.

---

## 5. 여러 사람이 동시에 만들 때 — 검증 환경과 포트

병렬 제작 단계(PLAN §8.2 P2-05~P2-13)에서는 각자 **자기 작업 폴더**에서 개발 서버를 띄우고 **자기 spec만** 돌려요. 공유 파일(`package.json`·`package-lock.json`·`astro.config.mjs`·`sources.yaml`·`playwright.config.ts`·`src/lab/runtime/**`·`src/lab/editor/**`·`src/lab/params/**`·`src/components/lab/LabShell*`·`src/pages/labs/vision/index.astro`·`src/lib/**`·`.github/**`)은 고치지 않고, 필요한 것은 통합 담당에게 보고해요.

```bash
npm ci                                    # 처음 한 번(설치 스크립트는 esbuild만 허용됨)
ASTRO_DEV_BACKGROUND=1 npm run dev -- --port 4404 --ignore-lock   # 내 포트(아래 표). predev가 public/vendor/에 자산을 복사해요
PW_BASE_URL=http://localhost:4404/ai-physical-computing/ npx playwright test tests/e2e/module-hands.spec.ts --project=desktop --output=.cache/pw-mediapipe
```

**같은 작업 폴더를 여럿이 쓸 때 부딪히는 것(2026-09-16 실측):**

- Astro 7은 **한 작업 폴더에 개발 서버를 하나만** 띄워요(`Another astro dev server is already running.`). 포트를 나눠도 서버는 하나뿐이니, 먼저 띄운 사람의 주소를 `PW_BASE_URL`로 함께 쓰거나 `--ignore-lock`(잠금 파일 `.astro/dev.json`을 읽지도 쓰지도 않음)으로 나란히 띄워요. Windows에서 `--ignore-lock` 없이 두 번째 서버를 띄우면 `EPERM: operation not permitted, unlink '.astro/dev.json'`으로 죽어요.
- `npx playwright test`에는 **`--output=<내 폴더>`**를 꼭 붙여요. 붙이지 않으면 공유 `test-results/`를 다른 사람이 지우면서 `browserContext.close: ENOENT … .playwright-artifacts-N` 같은 가짜 실패가 나요.
- 다른 사람이 `src/`를 저장하면 내 테스트 페이지가 Vite HMR로 통째로 새로고침돼 실행 중이던 코드가 끊길 수 있어요(재시도하면 통과). 빌드 결과로 도는 `npm run test:e2e`에는 없는 문제예요.
- 개발 서버에 대고 돌릴 때는 `--output`을 **저장소 밖**(예: 운영체제 임시 폴더)에 두는 편이 안전해요. 저장소 안(`.cache/…`)에 두면 실패한 검사의 추적 파일(`traces/resources/*.html`)이 생길 때마다 개발 서버의 감시기가 그 파일을 알아채고(`[watch] .cache/…html`), 그 무렵 실습실 검사들이 파이썬 준비(`loading`)에서 90초씩 멈췄어요(2026-09-17 관찰 — 같은 검사는 빌드 결과에서는 통과).
- 개발 서버로 `/labs/vision/`을 처음 열면 Vite가 그때그때 옮기느라 40초를 넘길 수 있어요 — 그 페이지를 쓰는 검사에는 `test.describe.configure({ timeout: … })`가 필요해요.

실제로 만들어진 폴더는 아래와 같아요(2026-09-16 P2-05~P2-14 통합 뒤 — 처음 배정과 이름이 다른 곳이 있어요).

| 작업 | 포트 | 모듈 폴더 / 파일 | 페이지·저장 이름 |
|---|---|---|---|
| A 로딩·캐시(P2-05) | 4401 | `src/lab/modules/loading/`(진행률·1분 개념 카드·미리 받기), `src/lab/loader/`, `src/sw/sw.js`, `scripts/{fetch-pyodide-fallback,build-sw}.mjs` | 점검 페이지 부품 `src/components/start/network-check/` |
| B 오류 사전(P2-06) | 4402 | `src/lab/modules/errors/`, `src/lab/errors/`, `content/help/errors/errors.yaml`, `src/pages/help/errors/` | — |
| C 보충 V1~V5(P2-07) | 4403 | `examples/vision/supplement/v1-*.py … v5-*.py`, `content/lessons/u1/v1.md … v5.md`, `public/images/lessons/supplement/` | — |
| D mediapipe 손·얼굴·자세(P2-08·09) | 4404 | `src/lab/modules/mediapipe/`(한 폴더로 합침), `scripts/gen-landmarks.mjs`, `public/models/*.task`(운영자가 내려받음) | `module:mediapipe:*` |
| E 러너 공통(P2-10) | 4405 | `src/lab/modules/runtime-extras/`(가상 파일 `mask.png`, 글꼴 연결, 이름 가림 경고, 콘솔 접기) | `module:runtime-extras:*` |
| F 가상 데스크톱(P2-11·12) | 4406 | `src/lab/modules/desktop/`(placement `'wide'`, `pyautogui.py`·`webbrowser.py`), `examples/desktop/` 사이드카 | `module:desktop:*` |
| G 음성(P2-13) | 4407 | `src/lab/modules/speech/`(`speech_recognition.py`), `src/pages/settings/`, `src/components/settings/` | `module:speech:*` |

- 자기 spec만 돌려요(`tests/e2e/module-<id>.spec.ts`). 공유 spec(`lab-*.spec.ts`, `scenario-a.spec.ts`)을 고치지 않아요. 브라우저 테스트는 테스트마다 새 브라우저 문맥이라 localStorage가 섞이지 않지만, 페이지 안 저장 이름은 `ctx.storageName`으로 모듈별로 나눠요.
- 개발 서버에는 검색 색인(Pagefind)이 없어 `search*.spec.ts`는 돌지 않아요. 첫 응답이 느리니(Vite 변환) 기다리는 시간은 `LOAD_TIMEOUT`(90초)·`PACKAGES_TIMEOUT`(150초)을 그대로 써요.
- 새 npm 패키지가 필요하면 설치하지 말고 통합 담당에게 이름·정확한 버전·라이선스·근거를 보고해요(`sources.yaml`·`package.json`은 공유 파일). 미리 설치된 것: `@mediapipe/tasks-vision` 0.10.35(Apache-2.0, WASM은 `public/vendor/mediapipe/0.10.35/wasm/`), `workbox-build` 7.4.1(MIT, devDependency).
- 원고·교안 이미지를 넣을 때는 `scripts/image-allowlist.yaml`에 눈 확인 기록을 함께 커밋해요(PD-32). 5MB를 넘는 파일은 `scripts/repo-allowlist.yaml`의 `large_files`에 경로·이유·`max_mb`(10 이하).
- 커밋은 경로 지정(`git add <경로>`), 메시지는 한국어 "무엇을 왜" + `Co-Authored-By` 줄, `--no-verify` 금지.

---

## 6. 원본 예제 이관 도구 — `scripts/import-examples.mjs`(PD-33)

교과서·교안의 코드는 원본 zip에서 **줄 끝(CRLF → LF)만 바꿔** 옮기고, 원본과 줄 수·구문을 대조해 `scripts/examples-manifest.yaml`에 기록해요. 추출 사본(`extracted/flat`)은 줄 끝이 망가져 있어 쓰지 않아요.

```bash
npm run examples:import              # 목록의 모든 항목(운영자 PC: 원본 폴더가 저장소 뿌리에 있음)
npm run examples:import -- f026 f027 # 일부만
npm run examples:import -- --materials <원본 폴더>   # 다른 컴퓨터: 비공개 자료 저장소의 originals/
npm run examples:verify              # 원본 없이 기록과 대조(sha256·줄 수·LF·사이드카) — npm test에도 들어 있어요
```

- 새 항목은 `scripts/examples-manifest.yaml`의 `examples:`에 `id`(CODE_MAPPING 코드 id)·`source`(zip 이름)·`member`(zip 안 경로)·`target`(`examples/…py`)·`author`(`operator` | `third_party`)·`meta`(사이드카 씨앗)를 적고 스크립트를 돌려요. 다른 저작자 파일은 `third-party/` 폴더 아래로만(PD-26). 원본 결함으로 구문 오류가 나는 파일(f074)은 `expect_syntax_error: true`.
- 구문 검사는 이 컴퓨터의 파이썬 3(`python`·`python3`·`py -3`)의 `ast.parse`로 하고, 없으면 Node의 가벼운 검사만 해요(기록에 `syntax_checker`로 남아요).
- 옮긴 파일은 고치지 않아요. 사이트판 수정이 필요하면 파일을 따로 두고(PD-10) 차시 md·사이드카에 적어요.

---

## 7. 가상 ESP32 보드 — 보드 모듈 `modules/board/`와 부품 레지스트리(P3-01)

ESP32 실습실(`/labs/esp32/`, LabShell `labId="esp32"`)의 가상 보드는 흉내 모듈 폴더 하나(`src/lab/modules/board/`, manifest `labs: ['esp32']`)예요. 실행 엔진은 영상처리 실습실과 같은 Pyodide 러너이고(PD-04, PLAN §8.3 P3-00 판정), OpenCV·numpy는 받지 않아요(워커는 실습실에 붙는 모듈 파일만 넣고, 준비 모듈의 [미리 받기]·캐시 채우기도 LabShell `pyodidePackages={[]}`라 파이썬 엔진만).

```
src/lab/modules/board/
├─ manifest.ts            id board, labs ['esp32'], shims { time: 'apc_board' }(실행 직전마다 install), 이름 5개(7.3)
├─ index.ts               화면 쪽: 배선 → 보드 그림(view.ts) → 입력·상태 메시지 잇기
├─ state.ts · parts.ts    순수 논리: 메시지 모양·스냅샷 / 부품 레지스트리·배선 검사·입력 값 계산
├─ view.ts · svg.ts       DOM: 보드 그림·부품 배치·핀 표, 입력 부품의 마우스·터치·키보드 공통 처리
├─ part-types.ts          부품 정의(PartDefinition)의 모양
├─ machine.py · micropython.py   학생이 import하는 이름 그대로(파일 이름 = import 이름)
├─ apc_board.py           보드 핵심: 핀·가상 시계·Timer·콜백·import 훅·확장 불러오기
├─ apc_board_time.py      MicroPython판 time
└─ parts/<부품 id>/       부품 하나 = 폴더 하나(7.5): part.ts (+ apc_part_*.py·드라이버 .py)
```
화면 틀: `src/components/lab/BoardIo.astro`(io 슬롯 — `[data-board-io]`에 `data-lab-reveal-on-run`, 보드 그림 칸에 `data-lab-reveal-on-run-min`). 예제: `examples/esp32/*.py`(사이트 예제 3개, 원본 이관 예제는 P3-02부터 `examples/esp32/u2/…`).

### 7.1 파이썬 API(가상 보드가 지금 흉내 내는 것)

MicroPython v1.29.0 ESP32 포트 소스(`ports/esp32/machine_pin.c`·`machine_pin.h`·`machine_timer.c`·`modtime.c`, `extmod/modtime.c`, `shared/timeutils/timeutils.c`, `py/modmicropython.c`·`objmodule.c`, 2026-09-17 확인)와 같은 이름·값·오류 문구예요.

| 이름 | 동작 |
|---|---|
| `machine.Pin(id, mode=None, pull=-1, *, value, drive, hold)` | id는 0~23·25~27·32~39(그 밖·bool·소수·글자는 `ValueError('invalid pin')`). 34~39에 출력 모드면 `ValueError('pin can only be input')`. 번호만 주면 설정을 바꾸지 않고, `Pin(2) is Pin(2)`. 상수 IN 1·OUT 3·OPEN_DRAIN 7·PULL_DOWN 1·PULL_UP 2·IRQ_RISING 1·IRQ_FALLING 2·WAKE_LOW 4·WAKE_HIGH 5·DRIVE_0~3. repr `Pin(2, mode=Pin.OUT)`(ESP-IDF 5.5 모양) |
| `pin.value([x])` · `pin([x])` · `on()` · `off()` · `toggle()` | 쓰기는 모드와 상관없이 출력 값을 적는다(출력이 꺼져 있으면 핀 전압은 그대로). **바깥을 보는 읽기**(출력 중이 아닌 핀)는 입력 확인 지점 |
| `pin.irq(handler=None, trigger=IRQ_FALLING\|IRQ_RISING, wake=None)` | 핀 전압이 바뀌면 콜백 대기열에 `handler(pin)`. handler None이면 끔. 돌려주는 IRQ 객체: `irq()`로 한 번 부르기, `trigger([값])`. wake(잠자기 깨우기)는 흉내 내지 않고 안내 |
| `machine.Timer(id=-1)` · `init(*, mode=PERIODIC, callback, period=ms, tick_hz=1000, freq, hard=False)` · `deinit()` · `value()` | 0~3은 하드웨어 타이머(같은 번호는 같은 객체), 음수는 가상 타이머, 4 이상은 `ValueError("Timer(4) doesn't exist, there are only 4 hardware timers")`. 위치 인자 → `TypeError('extra positional arguments given')`, hard → `ValueError`, 주기 0 → `ValueError('Timer period is too short for this timer')`. `Timer.PERIODIC` 1·`ONE_SHOT` 0. repr은 실물 소스의 뒤바뀐 조건까지 같음(`mode=ONE_SHOT`로 찍힘) |
| 그 밖의 `machine` 이름(PWM·ADC·SoftI2C·I2C·UART·RTC·time_pulse_us …) | 쓰면 `ImportError('machine.PWM은(는) 가상 보드에 아직 없어요…')`(오류 사전 `board-not-emulated`). 부품 단계가 확장 파일로 더한다(7.6) |
| `time`(= `utime`) | `sleep(초)`(1000배 단정밀도 → 밀리초로 버림, 음수는 ValueError), `sleep_ms`·`sleep_us`(정수만, 음수·0 이하는 기다리지 않음), `ticks_ms`·`ticks_us`·`ticks_cpu`(가상 시각 `& (2**30-1)` — ticks_cpu는 실물의 CPU 사이클 대신 µs), `ticks_diff(a,b)`=`((a-b+2**29) & (2**30-1)) - 2**29`, `ticks_add`(±2**29 이상이면 `OverflowError('ticks interval overflow')`), `time()`·`time_ns()`(2000년 기준), `localtime`=`gmtime`(같은 함수, 8칸, 요일은 월요일=0), `mktime`(8·9칸, 넘친 값 넘김). CPython에만 있는 이름(perf_counter 등)은 없다 |
| `micropython` | `const(x)`=x, `schedule(f, arg)`(대기열 8개, 넘치면 `RuntimeError('schedule queue full')`), `opt_level`·`alloc_emergency_exception_buf`·`heap_lock`/`unlock`/`locked`·`kbd_intr`(하는 일 없음), `mem_info`·`qstr_info`·`stack_use`(안내만), `native`·`viper` 장식자. `umicropython`은 실물처럼 없음 |
| u-이름 | `utime`·`umachine`·`ustruct`·`usys`·`uerrno`·`ujson`·`urandom`·`uos`·`uarray`·`ucollections`·`ubinascii`·`uio`·`ure`·`uhashlib`·`uheapq`·`uselect`·`usocket`·`uplatform` → 원래 모듈(실물의 "확장 가능한 붙박이 모듈 + usys" 규칙) |
| `errno`(= `uerrno`) | MicroPython 목록 22개를 ESP32(newlib) 번호로: ENOENT 2·EIO 5·EAGAIN 11·ENOMEM 12·ENODEV 19·EINVAL 22·EOPNOTSUPP 95·ETIMEDOUT 116 …, `errorcode` 사전(Pyodide의 errno 번호와 다르다) |
| `bluetooth`·`ubluetooth` | 자리만: import하면 `ModuleNotFoundError("No module named 'bluetooth' (가상 보드의 블루투스는 아직 흉내 내지 않아요 …)")` — Phase 4가 `register_board_module`로 채운다 |

**학생 코드만 MicroPython판을 받는다:** `apc_board.install()`이 `builtins.__import__`에 훅을 걸어, import하는 쪽이 학생 코드(`__main__`, 작업 폴더 `/home/pyodide/`, 보드 라이브러리 폴더 `/board/lib/`의 파일)일 때만 `time`·`utime`·`errno`·`bluetooth`·u-이름을 바꿔 준다. 표준 라이브러리·Pyodide가 import하는 `time`은 진짜 CPython time 그대로다(C 코드의 `PyImport_Import`는 `sys.modules`를 돌려주므로 영향 없음). `sys.modules['time']`을 바꾸지 않는다. `importlib.import_module('time')`은 진짜를 받는다(드문 경우 — 차이로 둠).

**보드 라이브러리 폴더 `/board/lib/`:** `sys.path` 끝에 있다. P3-04가 사이트 제공 라이브러리(`i2c_lcd.py` 등)를 이 폴더에 넣는다(학생 작업 폴더의 같은 이름 파일이 먼저).

### 7.2 가상 시계·입력 확인 지점·콜백

- **가상 시각** = 실행 시작(보드를 새로 켠 것처럼 0) 뒤 학생 코드가 **계산한 실제 시간** + **sleep한 양**. sleep이 실제로 기다린 시간(브라우저 타이머가 늦는 만큼)은 세지 않으므로 `ticks_diff`가 실물처럼 "잔 만큼"이다. 짧은 sleep은 `apc_runtime.sleep`이 16ms씩 모아 기다려도 ticks는 바로 늘어난다(f060의 `sleep(0.001)` 반복). sleep 도중에 도는 틱 훅은 그 sleep이 끝날 시각을 넘지 않는다(Timer 주기 건너뛰기·시각 거꾸로 방지).
- **RTC(`time.time()`)**: 실행을 시작할 때 이 컴퓨터의 현지 시각에서 출발한다(Thonny가 연결할 때 시계를 맞추는 것과 같게 — 실물의 전원 직후 값은 부록 B-2 6번).
- **입력 확인 지점**: `time.sleep*`, 출력 중이 아닌 핀의 `value()` 읽기, `ticks_*()`. 여기서 ① 16ms마다 한 번 양보해 [정지]·화면 입력을 받고 ② 화면 입력(`board.input`)을 핀에 반영해 인터럽트 콜백을 대기열에 넣고 ③ 울릴 Timer를 대기열에 넣고 ④ 대기열의 콜백을 부른다. `input()`을 기다리는 동안에는 콜백이 돌지 않는다(끝나면 이어서).
- **Timer**: sleep 도중에는 울릴 시각마다 깨어 제시간(가상 시각)에 부른다. 계산만 하는 반복문 동안 밀린 주기는 한 번만 부른다(실물은 대기열이 넘치면 버림). 콜백 안에서는 다른 콜백이 끼어들지 않는다. 핀 인터럽트가 걸려 있으면 긴 sleep을 20ms 조각으로 나눠 입력에 20ms 안에 반응한다.
- **콜백 오류**: 실물처럼 트레이스백(학생 코드 줄만)을 보여 주고 프로그램은 계속 돈다(안내 한 번).
- **코드가 끝난 뒤**: Timer나 핀 인터럽트가 남아 있으면 `run_idle`로 [정지]까지 계속 돈다(`board.state` phase `idle`, 콘솔 안내). 오류·`exit()`로 끝나면 이어 돌지 않는다.
- **[정지]·다시 시작**: 부품을 꺼진 모습으로 되돌린다(스냅샷 phase `stopped`). 스스로 끝나거나 오류로 끝나면 마지막 모습을 남긴다(실물과 같음). 다음 [실행]은 보드를 새로 켠다(핀·Timer·시계 초기화).
- **실물과 다른 점**(P3-00 차이 표 12번, 실습실 페이지 "가상 보드와 실물 보드가 다른 점"): 콜백이 바이트코드 사이 어디서나가 아니라 입력 확인 지점에서만 돈다. 양보 없는 계산 반복문은 [정지] 2단계(파이썬 다시 시작)로만 멈춘다.
- **핀 안내**(콘솔 `[알림]`, 실행마다 한 번): 떠 있는 입력 핀 읽기(가상은 0), 6~11번(플래시) 출력, 1·3번(UART0) 출력, 20번(모듈 핀 아님), 34~39번 쓰기·풀업, 출력 핀을 부품이 반대 값으로 누름(합선).

### 7.3 메시지 형식(워커 ↔ 화면, 이름은 모두 `board.`)

모양의 기준은 `state.ts` 머리말과 `apc_board.py`예요. PLAN §7 브릿지(UART·BLE·MQTT로 오가는 글자 한 줄)와 겹치지 않는 "핀 전압" 통로이고, 브릿지는 Phase 4가 `board.uart.*`·`board.ble.*`처럼 따로 더해요.

| 이름 | 방향·종류 | 값 |
|---|---|---|
| `board.state` | 파이썬 → 화면, 이벤트 | `{ v: 1, reason: 'reset'\|'change'\|'idle'\|'end', phase: 'run'\|'idle'\|'end', seq, t_us, pins: [{ id, mode: 'in'\|'out'\|'open_drain'\|'off'\|'out_only'\|'other'\|null, pull: 'up'\|'down'\|'both'\|null, out: 0\|1, level: 0\|1, driven, irq }], timers }` — 늘 **핀 전체 목록**(이번 실행에서 코드가 만진 핀). 보내는 때: 실행 시작(reset), 파이썬이 실제로 기다리기 직전(대기 전 훅), 마지막으로 보낸 뒤 16ms가 지난 쓰기, 코드가 끝난 뒤 대기 시작(idle), 실행 끝(end). 16ms 안의 변화는 합쳐진다(PLAN §7.2 규칙 5 "상태는 최신 값만") |
| `board.inputs` | 화면 → 파이썬, 최신 값(`setValue`) | `{ pins: { '0': 'pullup', '17': 1 } }` — 입력 부품이 지금 핀을 누르는 값 전체. 실행 시작 때(초기화 훅이 `peek`) 읽는다. [실행] 직전에 다시 넣는다(정지 2단계 대비) |
| `board.input` | 화면 → 파이썬, 쌓이는 값(`pushEvent`) | `{ pin: 0, drive: 0\|1\|'pullup'\|'pulldown'\|null }` — 실행 중에 바뀐 핀 하나. 눌렀다 뗀 것도 빠짐없이 순서대로(§7.2 규칙 5 "이벤트는 대기열") |
| `board.wiring` | 화면 → 파이썬, 최신 값 | `{ parts: [{ part: 'builtin-led', id: 'builtin-led', pins: { led: 2 } }] }` — 이 예제의 배선(보드에 붙은 부품 포함). 부품 흉내·배선 검사가 읽는다 |
| `board.device` | 파이썬 → 화면, 이벤트 | 부품 흉내의 상태(부품 단계가 쓴다 — 권장 모양 `{ part, id, state }`) |

`drive` 뜻: `0`·`1` = 부품이 핀을 세게 누름(버튼이 GND에 닿음, 센서 모듈 출력), `'pullup'`·`'pulldown'` = 약하게 끌어당김(보드의 BOOT 버튼 풀업), `null` = 연결 없음. 핀 전압은 세게 누름 > 출력 > 약한 끌어당김 > 내부 풀업·풀다운 > 떠 있음(0) 순서로 정한다.
화면 쪽 테스트 표시: `[data-board-io]`의 `data-board-ready`·`data-board-phase`·`data-board-seq`·`data-board-reason`, 부품 `[data-board-part="<배선 id>"]`의 `data-part`·`data-visual-<이름>`·`aria-pressed`, 핀 표 `[data-board-pin="<GPIO>"]`의 `data-mode`·`data-level`·`data-driven`.

### 7.4 배선(PD-05 예제별 배선)

- 보드에 붙은 부품(`onboard: true` — 지금 `builtin-led` GPIO2·`boot-button` GPIO0)은 배선에 적지 않아도 늘 있고 핀이 고정된다.
- 예제의 부품은 `LabExample.parts`(`[{ part, id, pins, label? }]`)로 넘긴다. 차시 md `parts`·사이드카에서 채우는 일은 P3-02가 한다(`src/lab/esp32/examples.ts`가 옮겨 담는 자리).
- `parts.ts`의 `resolveWiring`이 없는 부품·겹치는 id·ESP32에 없는 핀·입력 전용 핀(34~39)의 출력 부품·한 핀의 입력 부품 둘을 한국어로 알리고(보드 그림 아래 목록), 스트래핑 핀 안내는 P3-02가 같은 자리에 더한다(`STRAPPING_GPIOS`).

### 7.5 부품 하나 = 폴더 하나 — `modules/board/parts/<부품 id>/`

```
parts/builtin-led/part.ts     출력 부품 본보기(핀 상태 → 모습)
parts/boot-button/part.ts     입력 부품 본보기(누름 → 핀 누르는 값)
parts/<새 부품>/
├─ part.ts                    default export PartDefinition(필수)
├─ apc_part_<이름>.py         (선택) 핀만으로 안 되는 부품의 파이썬 흉내(I2C 장치 등) — 보드가 첫 실행 직전에 불러온다
└─ <드라이버>.py              (선택) 학생이 import하는 이름 그대로(neopixel.py·ssd1306.py — 저장소 전체에서 이름 하나)
```

`PartDefinition`(`part-types.ts`):

| 칸 | 뜻 |
|---|---|
| `id`·`title`·`description` | 폴더 이름과 같은 id(영문 소문자·숫자·하이픈), 한국어 이름·한 줄 설명(화면 낭독기) |
| `onboard?` | 개발 보드에 붙은 부품이면 true(핀이 `defaultPins`로 고정, 배선에 늘 들어감) |
| `pins` | `[{ role, label, direction: 'out'\|'in' }]` — role은 배선 표 `pins`의 열쇠. out = 보드가 움직임(LED), in = 부품이 값을 줌(버튼) |
| `defaultPins?` | role → GPIO(onboard는 필수) |
| `size` | 그림 크기(SVG 단위). 보드에 붙은 부품의 자리는 `view.ts`의 `ONBOARD_ANCHORS`, 바깥 부품은 보드 오른쪽 칸에 차례로 놓인다(P3-02가 배선도 배치로 바꿀 수 있음) |
| `interaction?` | 입력 부품: `{ kind: 'momentary'\|'toggle', label, drive(active, role) → PinDrive }`. **마우스·터치·키보드는 `view.ts`가 공통으로 처리**한다 — momentary는 누르고 있는 동안(Space·Enter를 누르고 있는 동안, 초점을 잃으면 뗌), toggle은 누를 때마다. 부품은 `role="button"`·`tabindex=0`·`aria-pressed`를 받는다 |
| `visual(context)` | **순수 함수**: `{ snapshot, instance, active, reducedMotion }` → `{ lit: true }`처럼 모습 값. `state.ts`의 `isDrivenHigh(snapshot, gpio)`를 쓰면 [정지] 뒤 꺼짐까지 맞는다. 보드 화면이 `data-visual-<이름>` 속성으로 적는다 |
| `render(target, { svg, instance, definition })` | `target`(`<g>`) 안에 사이트가 직접 그린 SVG(브랜드 중립, 다른 저작물 그림 금지)를 한 번 그리고, 모습 값이 바뀔 때 부를 함수를 돌려준다. 색만으로 알리지 않게 글자(켜짐·누름)도 함께. 움직이는 그림은 `reducedMotion`이면 표시등으로. 누르는 부품은 투명하게 칠한 사각형(`fill="transparent"`)으로 누르는 자리를 24px 이상 |
| `python?` | 파이썬 부품 흉내 모듈 이름(`apc_part_<이름>`, 같은 폴더에 있어야 함 — `board-parts.test.ts`가 확인) |

- **자동 발견:** `parts.ts`가 `import.meta.glob('./parts/*/part.ts', { eager: true })`로 찾고 `validatePartDefinitions`로 검사한다(어기면 `board-parts.test.ts`가 실패하고, 브라우저에서는 보드 모듈이 오류를 내며 뜨지 않는다). `.py`는 `python/modules.ts`가 모듈 폴더의 하위 폴더까지 찾아 ESP32 실습실 워커의 `/apc`에 넣는다.
- **파이썬 부품 흉내:** `apc_part_<이름>.py`는 `apc_board.register_part('<부품 id>', factory)`로 자기를 등록한다(`factory(배선 항목) → 장치`). 보드는 `/apc`의 `apc_board_*.py`·`apc_part_*.py`를 첫 실행 직전(`install()`) 한 번 불러온다. 상태를 화면에 알릴 때는 `apc_runtime.emit('board.device', { part, id, state })`, 실물과 같은 OSError는 `apc_board.board_oserror(19)`(`OSError: [Errno 19] ENODEV`). 핀은 `apc_board.find_pin(값)`·`BOARD.read(gpio)`·`BOARD.write(gpio, v)`·`BOARD.configure(…)`로 다룬다.
- **단위 테스트:** `tests/unit/lab/board-parts.test.ts`에 그 부품의 `visual`·`interaction.drive` 검사를 더한다(DOM 없이). 파이썬 흉내가 있으면 `tests/unit/lab/helpers/pyodide-board-run.mjs`에 단계를 더하고 `pyodide-board.test.ts`에서 확인한다. 화면은 `tests/e2e/lab-esp32.spec.ts`처럼 `data-visual-*`를 읽는다.

### 7.6 machine에 주변장치 더하기 — `apc_board_*.py` 확장

PWM·ADC·SoftI2C·UART·RTC·time_pulse_us처럼 부품이 아닌 **machine의 이름**은 `modules/board/`(또는 그 하위 폴더)에 `apc_board_<이름>.py`를 두고 `apc_board.register_machine_export('PWM', PWM)`로 등록한다. `machine.py`는 import할 때 확장을 불러와 그 이름을 내보내고(`from machine import PWM`), 여러 사람이 동시에 `machine.py`를 고치지 않아도 된다. 규칙: 확장은 `machine`을 import하지 않는다(순환), `apc_board`·`apc_runtime`과 표준 라이브러리만. 등록하면 `machine.py`의 "아직 없는 이름" 안내(`_NOT_YET`)는 자동으로 가려진다. `time`·`bluetooth` 같은 **모듈 통째**는 `apc_board.register_board_module('bluetooth', 모듈)`(학생 코드의 import에만 적용).

### 7.7 테스트 방법

| 층 | 어떻게 |
|---|---|
| 파이썬(실제 Pyodide) | `tests/unit/lab/pyodide-board.test.ts` + `helpers/pyodide-board-run.mjs` — ESP32 실습실 워커와 같은 파일·순서(beginRun → install_available → reset_for_run → bind → 코드 → run_idle). 입력은 `inputs`(실행 전)·`during`(시각)·`onMark`(파이썬이 `emit('board.device', {'mark': …})`한 뒤 — 부하에 흔들리지 않게), `stopAfterMs`·`idle`. 동기 진입점 검사 포함. `--limited`로 제한 모드 |
| 순수 논리 | `board-state.test.ts`(메시지 읽기·스냅샷·입력 값), `board-parts.test.ts`(부품 정의 검사·배선·부품 visual/drive), `python-modules.test.ts`(실습실별 파일·shims), `esp32-examples.test.ts`(예제 목록) |
| 브라우저 | `tests/e2e/lab-esp32.spec.ts`(LED 상태 메시지, BOOT 버튼 마우스·키보드, Timer 대기, OpenCV 안 받음, dev 실습실에 machine 없음). 예제 스모크(`examples-smoke.spec.ts`)는 실습실별로 돌아 `examples/esp32/` 이관 예제를 ESP32 실습실에서 실행한다 |
| 개발 서버로 | `ASTRO_DEV_BACKGROUND=1 npm run dev -- --port 44xx --ignore-lock` 뒤 `PW_BASE_URL=http://localhost:44xx/ai-physical-computing/ npx playwright test tests/e2e/lab-esp32.spec.ts --project=desktop --output=<저장소 밖 폴더>`(5절) |

### 7.8 금지·주의

- 부품 그림은 사이트가 직접 그린 브랜드 중립 SVG만(업체 로고·Fritzing 등 SA 그림 금지). 보드·부품 사진을 쓰려면 `scripts/image-allowlist.yaml` 눈 확인 절차.
- 가상 보드가 실물보다 너그러우면 안 된다: 범위 밖 값에는 실물과 같은 예외를 내고(문구는 MicroPython 그대로), 한국어 풀이는 오류 사전 `board` 묶음(`content/help/errors/errors.yaml`)에 더한다. 흉내 낼 수 없는 차이는 콘솔 안내·교사용 접기로.
- 보드 초기화·틱·대기 전·마무리 훅에서는 양보하지 않는다(`peek`·`drain`·`emit`·`notice`만). 콜백은 입력 확인 지점에서만 부른다.
- CPython `time`·`sys.modules`를 바꾸지 않는다(import 훅만). Pyodide의 `errno` 번호를 보드 오류에 쓰지 않는다(`board_oserror`).
- 부품·확장의 메시지는 `board.state`·`board.input`·`board.inputs`·`board.wiring`·`board.device` 다섯 이름으로 한다 — 새 이름이 꼭 필요하면 `manifest.ts`에 먼저 적는다(보드 모듈 담당과 상의).
