# 실습실 코드 안내 (`src/lab/`)

실습실(영상처리·ESP32·통신)이 함께 쓰는 브라우저 쪽 코드와 파이썬 쪽 모듈을 모아 둔 곳이에요. 큰 흐름은 `docs/PLAN.md` §4(JSPI 실행 설계)·§8.2(Phase 2 묶음), 파일 위치는 `CLAUDE.md` "기술 스택" 절에 있어요. 이 문서는 **예제 파일을 쓰는 사람(교사·기여자)이 지켜야 할 규약**(1~3절), **흉내 모듈을 폴더 하나로 더하는 규약**(4절), **여러 사람이 동시에 만들 때의 검증 환경**(5절), **원본 예제 이관 도구**(6절)를 적어요.

| 폴더 | 하는 일 |
|---|---|
| `runtime/` | 파이썬 워커(Pyodide)와 화면 쪽 API `PythonRuntime`(`client.ts`), 메시지 형식(`protocol.ts`), 다리(`bridge.ts`), 설정 한 곳(`config.ts`) |
| `python/` | 워커 안에서 도는 붙박이 파이썬 모듈: 도우미 `apc_runtime.py`, 등록표 `apc_shims.py`, cv2 흉내 `apc_cv2.py`(폴더 규약 이전에 만든 것), 묶는 코드 `modules.ts` |
| `modules/` | **흉내 모듈 폴더**(4절): `<id>/manifest.ts` + `index.ts` + `*.py` + `panel.astro?`. 자동 발견(`manifests.ts`·`host.ts`). 예시 `hello/` |
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
- 실습실 목록(`vision/examples.ts`의 `visionExamplesFromFiles(files, sidecars)`)은 사이드카 → 머리말 → 파일 이름 순서로 제목을 정하고, 폴더별 묶음(`EXAMPLE_GROUPS`: `vision`, `vision/u1`, `vision/opmp`, `desktop`)으로 `<optgroup>`을 만들어요. 새 폴더는 그 표에 한 줄을 더하면 이름이 붙고, 더하지 않아도 맨 뒤에 폴더 이름 그대로 보여요.
- 사이트가 만든 예제(머리말 있는 파일)에도 사이드카를 둘 수 있어요(사이드카가 우선). 보통은 필요 없어요.

---

## 4. 흉내 모듈 폴더 규약 — `src/lab/modules/<id>/`

학생 코드가 PC에서처럼 `import mediapipe`, `import pyautogui`를 쓰게 하려면 파이썬 쪽 흉내 모듈과 화면 쪽 처리기가 함께 필요해요. **폴더 하나**를 두면 등록 파일을 고치지 않고도 워커·실습실 화면·빌드가 자동으로 찾아요.

```
src/lab/modules/hands/                 ← 폴더 이름 = 모듈 id(영문 소문자·숫자·하이픈)
├─ manifest.ts     순수 데이터: id, title, labs, shims, requestKinds, eventKinds, channels, packages, placement
├─ index.ts        화면 쪽: default export { manifest, mount(ctx) } — 요청·이벤트·패널·프레임 훅을 잇는다
├─ apc_hands.py    파이썬 쪽: 워커가 /apc에 써 준다. import 이름 = 파일 이름(저장소 전체에서 하나)
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
| `ctx.onLab('run' \| 'done' \| 'code' \| 'example' \| 'state', fn)` | 실습실 조작 이벤트(`LabController.on`과 같음) | — |
| `ctx.vision()` → `VisionLab \| null` | 영상처리 실습실이면 `vision.onFrame((frame, {sourceId, now}) => …)`(cap.read 답 직전, frame.data는 답한 뒤 워커로 옮겨져 비므로 보관하려면 복사), `vision.grabFrame()`, `vision.windows`, `vision.sendKey()` | — |
| `ctx.panel`, `ctx.showPanel()`, `ctx.hidePanel()` | `panel.astro`가 그려진 요소(처음엔 hidden) | — |
| `ctx.storageName('설정')` → `ai-physical-computing:module:<id>:설정` | 브라우저 저장 이름(`src/lib/storage.ts` 규칙 — [이 컴퓨터에서 내 기록 지우기]가 함께 지움) | — |
| `ctx.notice('글')` | 콘솔 안내 줄 | `apc_runtime.notice(text, level)` |
| `ctx.lab`, `ctx.runtime`, `ctx.root`, `ctx.labId`, `ctx.manifest` | 컨트롤러·실행기·뿌리 요소 | — |

- `onRequest`·`onEvent`·`setValue`·`pushEvent`는 **manifest에 적은 이름만** 받아요(아니면 오류). 이름을 바꾸면 manifest부터.
- `mount`는 `{ dispose() }`를 돌려줄 수 있어요. ctx로 등록한 훅은 dispose 때 알아서 풀리고, 직접 붙인 DOM 이벤트만 풀어요.
- 실행 시작(`ctx.onLab('run')`)에 화면 값을 다시 `setValue`해 두면 정지 2단계(워커 재시작)로 값이 사라져도 복구돼요(hello 예시).
- 무거운 라이브러리(MediaPipe Tasks 등)는 index.ts 맨 위에서 import하지 말고 **처음 필요할 때 `await import()`** 해요 — index.ts 자체가 실습실마다 따로 받는 청크지만, 모듈이 붙는 순간 그 청크를 받기 때문이에요.

### 4.4 *.py — 파이썬 쪽 규칙

- `apc_runtime`의 `request`·`emit`·`get`·`poll`·`drain`·`sleep`·`maybe_yield`·`check_stop`·`notice`·`register_reset_hook`·`register_tick_hook`만 써요. `js`·`_apc_bridge`를 직접 만지지 않아요.
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
| 네트워크 | 학생 영상·음성이 밖으로 나가지 않는지: `collectRequests(page)`(`tests/e2e/helpers/vision.ts`)로 사이트 자신과 `ALLOWED_REMOTE_ORIGINS`(jsDelivr) 밖 요청이 0건 | `tests/e2e/lab-vision.spec.ts` |

### 4.7 금지 사항

- 등록 파일을 손으로 고치지 않아요: `python/modules.ts`, `modules/manifests.ts`, `modules/host.ts`, `LabShell.astro`, `worker.ts`는 폴더를 자동으로 찾아요. 여기에 모듈 이름을 적어야 한다면 규약이 깨진 거예요.
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
