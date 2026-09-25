# 실습실 코드 안내 (`src/lab/`)

실습실(영상처리·ESP32·통신)이 함께 쓰는 브라우저 쪽 코드와 파이썬 쪽 모듈을 모아 둔 곳이에요. 큰 흐름은 `docs/PLAN.md` §4(JSPI 실행 설계)·§8.2(Phase 2 묶음)·§8.3(Phase 3 묶음), 파일 위치는 `CLAUDE.md` "기술 스택" 절에 있어요. 이 문서는 **예제 파일을 쓰는 사람(교사·기여자)이 지켜야 할 규약**(1~3절), **흉내 모듈을 폴더 하나로 더하는 규약**(4절), **여러 사람이 동시에 만들 때의 검증 환경**(5절 — Phase 3 구역 5.1, **Phase 4 구역 5.2**), **원본 예제 이관 도구**(6절), **가상 ESP32 보드와 부품을 더하는 규약**(7절 — 부품 제작 체크리스트 7.9, 확장 자리 7.10), **모의 시리얼(실제 보드 없이 Web Serial 흐름 시험)**(8절), **통신 브릿지(기기와 기기 사이로 글자 한 줄을 보내는 다리)**(9절)와 그 위의 **통신 실습 모듈**(9.9~9.16 — MQTT·대시보드·컴퓨터 쪽 흉내·가상 BLE·실제 기기 연결·시나리오 F·4단원 통합 화면·예제 갤러리, Phase 4 통합 2026-09-24)을 적어요.

| 폴더 | 하는 일 |
|---|---|
| `runtime/` | 파이썬 워커(Pyodide)와 화면 쪽 API `PythonRuntime`(`client.ts`), 메시지 형식(`protocol.ts`), 다리(`bridge.ts`), 설정 한 곳(`config.ts`) |
| `python/` | 워커 안에서 도는 붙박이 파이썬 모듈: 도우미 `apc_runtime.py`, 등록표 `apc_shims.py`, cv2 흉내 `apc_cv2.py`(폴더 규약 이전에 만든 것), 묶는 코드 `modules.ts` |
| `modules/` | **흉내 모듈 폴더**(4절): `<id>/manifest.ts` + `index.ts` + `*.py` + `panel.astro?`. 자동 발견(`manifests.ts`·`host.ts`). 예시 `hello/`. 가상 ESP32 보드는 `board/`(7절 — 부품은 `board/parts/<부품>/`) |
| `esp32/` | ESP32 실습실 예제 목록 만들기(`examples.ts` — `examples/esp32/**/*.py`, 보드 라이브러리 폴더 `esp32/lib/` 제외, 차시 md·사이드카·머리말의 배선을 `LabExample.parts`로), 보드 라이브러리 목록(`board-libraries.ts`·`board-library-files.ts`, 7.10) |
| `serial/` | Web Serial 타입(`web-serial.d.ts`)과 **모의 시리얼**(`mock/` — 8절, 테스트 도구라 배포 번들에 없음). 실제 보드 연결 코드(P3-07·P3-08)와 **USB 데이터 포트**(`data-port/` — P4-05, 9.13)도 이 폴더에 둔다 |
| `editor/` | 코드 에디터(CodeMirror 6) |
| `controls/` | 실습실 공통 조작(`lab-shell.ts` 컨트롤러, 예제 목록 `examples.ts`, 예제 머리말 읽기 `example-meta.ts`, 사이드카 읽기 `example-sidecar.ts`(빌드 전용), 자동 저장·공유 링크·내려받기) |
| `params/` | 조절 패널: 규약 파서 `parse.ts`, 화면 논리 `panel.ts` |
| `vision/` | 영상처리 실습실 화면(카메라·샘플 입력, 출력 창, 예제 목록 만들기 `examples.ts` — PC 전용 라이브러리 폴더 `vision/lib/` 제외, 프레임 훅 `vision-lab.ts`) |
| `bridge/` | **통신 브릿지**(9절): 메시지 규칙·보낼 차례·받는 차례·통로 등록표. 쓰는 쪽은 `bridge/index.ts`에서만 가져와요 |
| `mqtt/` | **MQTT·같은 컴퓨터 탭 통로**(P4-06, 9.9): 중계 서버 목록·토픽 규칙(PD-29)·통로 `mqtt`·이 탭의 연결 하나(`session.ts`) |
| `dashboard/` | **대시보드**(P4-07, 9.10): 위젯 네 가지·격자 배치·저장·그래프·게이지(라이브러리 없이) |
| `ble/` | **실제 보드 Web Bluetooth**(P4-04, 9.13): 연결·응답 있는 쓰기 차례·통로 `ble`·교실 이름 규칙·가짜 블루투스(`mock/`, 8.7) |
| `blocks/` | 블록 모드(P3-06, 7.11)와 **통신 블록**(`comm/` — P4-10, 9.14) |
| `unit4/` | **4단원 통합 화면**(P4-09, 9.15): 두 실습실 한 문서·[함께 실행]·성능 재기 |
| `gallery/` | **예제 갤러리**(P4-11, 9.16): 태그 규약 `facets.ts`(단원·난이도·가상 보드 가능·통신 방식·부품·낱말)와 빌드 때 카드를 만드는 `cards.ts`·거르기 `filters.ts`·규칙으로 읽기 `infer.ts`·비교 `variants.ts`·화면 `gallery-page.ts` |

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
- **값을 바꾸면:** ① 코드의 그 숫자(글자)가 함께 바뀌어요 — 그래서 [공유 링크]·[.py 내려받기]·다음 [실행]에 그 값이 그대로 담겨요. ② 실행 중이면 **다음 입력 확인 지점**(`cap.read()`, `cv2.waitKey()`, `time.sleep()`, `apc_runtime.get/poll`)에서 파이썬 전역 변수에 들어가요 → 코드가 그 값을 다음에 쓸 때(영상처리는 다음 프레임, 가상 보드는 다음 반복)부터 반영돼요. 패널 안내 글도 실습실에 상관없이 "실행 중이면 코드가 그 값을 다음에 쓸 때부터 반영돼요"예요(P3-02). 값은 "바뀔 때 한 번"만 들어가므로, 코드가 반복문 안에서 같은 변수를 스스로 바꿔도 패널이 매번 되돌리지 않아요.
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
# @part touch-digital 17                           ← ⑦ (ESP32 예제) 배선 한 줄 — 부품 하나에 한 줄 (선택, 7.4절)
# 그 밖의 안내 주석은 자유롭게                      ← 셋째 줄부터의 보통 주석은 화면 어디에도 안 보임(코드 안에서만)
import cv2
...코드...

# ── 바꿔볼 것 3가지 ──                            ← ⑤ 안내 상자(SPEC §6.1). 제목 줄 뒤 주석 줄마다 항목 하나(번호는 떼어 줘요)
# 1. threshold를 30까지 내려 봐요. …
# 2. …
# 3. …
# ── 왜 이런 결과가 나올까 ──                       ← ⑥ 안내 상자. 줄마다 문장 하나
# Canny는 …
# ── 실습 방법 ──                                   ← ⑧ (선택, P3-02) 실습실에서 무엇을 누르고 무엇을 보는지 단계. 줄마다 한 단계(번호는 떼어 줘요)
# 1. [실행]을 눌러요.
```

- 머리말은 파일 맨 위의 **이어진 주석 줄**이에요. 첫 코드 줄(`import cv2`)에서 끝나요. `# @slider` 같은 규약 줄은 제목·설명으로 쓰지 않아요.
- 안내 상자는 파일 어디든 둘 수 있지만, 학생이 코드를 먼저 보게 **코드 끝**에 두는 것을 권해요. 제목 줄의 `──` 장식은 없어도 돼요. 상자는 첫 코드 줄이나 다음 상자 제목에서 끝나요.
- 실습실 [예제 불러오기] 목록은 ①②만 써요(`vision/examples.ts`). 예제 갤러리(P4-11)와 차시 임베드(P2-14)는 `controls/example-meta.ts`의 `readExampleMeta(파일 글자)`로 ①~⑦을 모두 읽어요: `{ title, description, lesson, tags, parts, tryIdeas, why, practice }`. `hasGuideBoxes(meta)`가 상자 둘이 다 있는지 알려 줘요. ⑦ `# @part`는 ESP32 실습실 목록(`esp32/examples.ts`)이 배선으로, ⑧ "실습 방법" 상자는 ESP32 실습실이 보드 그림 위 "이 예제 실습 방법"으로 써요(7.4절).
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
# (ESP32 예제만) 배선 — 7.4절. 틀린 줄은 빼고 빌드 경고만 내요
parts:
  - { part: touch-digital, pin: 17 }
  - { part: lcd-i2c, id: lcd, pins: { sda: 21, scl: 22 }, label: "문자 LCD(16×2)" }
# (선택) 예제 스모크 테스트가 기대하는 결과 — tests/e2e/examples-smoke.spec.ts 머리말
smoke: { outcome: error, error: ImportError }
# (선택) 실습 방법 — 옮긴 예제는 코드에 상자를 넣을 수 없어 여기에(ESP32 실습실이 보드 그림 위에 보여요)
practice:
  - "[실행]을 누르면 콘솔에 Touch value: 0이 0.2초마다 나와요."
  - "보드 아래 터치 센서를 마우스나 손가락으로 누르고 있어요."
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
| `ctx.panel`, `ctx.showPanel()`, `ctx.hidePanel()` | `panel.astro`가 그려진 요소(처음엔 hidden). **mount에서 무조건 열지 말고** `showPanelWhenUsed(ctx, /이름/)`(`modules/panel-when-used.ts`)로 코드가 그 모듈을 쓸 때만 열어요. 조건이 하나 더 있으면 `showPanelWhenUsed(ctx, /이름/, { also: () => …, watchAttributes: ['data-run-target'] })`(예: ESP32 실습실의 USB 데이터 포트 칸은 [실제 보드] 탭일 때만), 돌려받은 `gate.dispose()`는 모듈 dispose에서 불러요 | — |
| `ctx.lab.holdRun(Promise)` | **준비 뒤 할 일**을 실습실 틀에 맡겨요(2026-09-25 Phase 4 검토 반영). 파이썬이 준비된 순간 모듈이 워커에 파일을 쓰는 일(보드 라이브러리·mask.png)이 끝나기 전에는 예약해 둔 [실행]을 보내지 않아요 — 전에는 준비 중에 누른 [실행]이 라이브러리보다 먼저 돌아 `ImportError`로 멈췄어요. 한 번에 최대 8초(`RUN_HOLD_MAX_MS`) 기다리고, 그동안 [실행] 단추는 예약 표시예요. `runtime.on('ready', () => ctx.lab.holdRun(쓰기()))`처럼 써요 | — |
| `ctx.storageName('설정')` → `ai-physical-computing:module:<id>:설정` | 브라우저 저장 이름(`src/lib/storage.ts` 규칙 — [이 컴퓨터에서 내 기록 지우기]가 함께 지움) | — |
| `ctx.notice('글')` | 콘솔 안내 줄 | `apc_runtime.notice(text, level)` |
| `ctx.lab`, `ctx.runtime`, `ctx.root`, `ctx.labId`, `ctx.manifest` | 컨트롤러·실행기·뿌리 요소 | — |

- `onRequest`·`onEvent`·`setValue`·`pushEvent`는 **manifest에 적은 이름만** 받아요(아니면 오류). 이름을 바꾸면 manifest부터.
- `mount`는 `{ dispose() }`를 돌려줄 수 있어요. ctx로 등록한 훅은 dispose 때 알아서 풀리고, 직접 붙인 DOM 이벤트만 풀어요.
- 실행 시작(`ctx.onLab('run')`)에 화면 값을 다시 `setValue`해 두면 정지 2단계(워커 재시작)로 값이 사라져도 복구돼요(hello 예시).
- 무거운 라이브러리(MediaPipe Tasks 등)는 index.ts 맨 위에서 import하지 말고 **처음 필요할 때 `await import()`** 해요 — index.ts 자체가 실습실마다 따로 받는 청크지만, 모듈이 붙는 순간 그 청크를 받기 때문이에요.
- **패널은 쓸 때만 연다(2026-09-17 Phase 2 검토 반영, 절대 원칙 4 "한 페이지 한 개념"):** 예전에는 모듈마다 mount에서 `showPanel()`을 불러 에지 검출 첫 실습 아래로 인식·음성·파일 패널이 줄줄이 이어졌어요. 이제는 `const gate = showPanelWhenUsed(ctx, /\bmediapipe\b/u)`처럼 코드에 이름이 보이면 열고, 파이썬이 실제로 요청을 보내면 핸들러 첫 줄에서 `gate.show()`로 못 박아요(코드를 고쳐도 닫히지 않음). 실행 전에 조작해야 하는 패널(파일 넣기)은 그 조작의 흔한 코드 모양으로 열어요(`runtime-extras/files.ts`의 `WORK_FILE_USE_PATTERN`).
- **학생에게 방금 생긴 것을 보여 줄 때**는 `revealElement(요소)`(`controls/reveal.ts`)를 써요 — 이미 충분히 보이면 움직이지 않고, 움직임 줄이기 설정이면 부드럽게 넘기지 않아요. 두 칸을 함께 보여야 하면 `revealTogether([넓은 칸, 좁은 칸], 둘째 칸, { slack })`. 실습실 틀은 [실행] 때 io 슬롯의 `[data-lab-reveal-on-run]`(넓은 결과 칸, 없으면 입력·출력 칸 전체)·`[data-lab-reveal-on-run-min]`(꼭 보여야 하는 최소 칸)과 첫 조절 막대(`[data-lab-param]`)를 함께 보이고, 오류 모듈은 풀이 카드를 보여요. **Phase 3 보드 그림 io 슬롯도 결과 부분에 이 두 표시를 달아요.** 편집칸을 스크롤할 일이 있으면 페이지까지 움직이는 CodeMirror `scrollIntoView` 대신 편집칸 안에서만(`errors/highlight.ts`의 `scrollLineInsideEditor`) 움직여요 — 방금 옮긴 화면을 되돌리지 않게.
- **콘솔은 화면 밖이라고 보고 만든다(2026-09-18 검토 반영):** 실습실은 세로로 길어 콘솔이 결과 칸보다 688px(1366×768)·696px(375×812) 아래에 있어요. 결과가 `print()`뿐인 실행에서 학생이 "아무 일도 없다"로 읽지 않게, 실습실 틀이 콘솔에 새 출력이 오면 결과 칸 아래에 마지막 3줄과 [콘솔 보기 ↓]를 띄우고(`[data-lab-io-output]`) 콘솔 제목에 "새 출력 N줄" 배지를 붙여요. 콘솔이 화면에 들어오면(IntersectionObserver) 저절로 사라져요. 모듈이 중요한 결과를 콘솔에만 쓰지 않도록 할 때 이 장치를 믿어도 돼요. **io 슬롯은 알림이 들어갈 자리를 `data-lab-io-output-anchor`로 알려요**(그 요소 바로 뒤 — 보드는 그림 아래 한 줄, 영상처리는 출력 상태 줄). 알림이 처음 뜰 때 틀이 그 뒤로 옮겨 [실행] 뒤 보드 그림과 함께 보이게 해요(2026-09-25 Phase 4 검토 반영). 화면에 붙여 띄우는 방법(sticky)은 휴대폰에서 부품 조작 칸을 덮어 쓰지 않아요.
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
| 실행 중 화면 입력 | 파이썬이 `time.sleep(0.8)` 같은 **정해진 시간 창 안에** 누르기를 받기를 바라지 말고, 받을 때까지 짧게(0.1초) 확인하며 넉넉한 한도(15초)까지 기다리게 써요. CI의 느린 모바일 화면에서는 콘솔 글을 알아채고 단추를 누르기까지 0.8초를 넘기기도 해요(2026-09-17 `module-hello` 모바일 실패 — 로컬에서 화면 CPU를 10배 느리게 하면 재현). 가상 보드처럼 반복문이 스스로 도는 코드는 `expect.poll`로 콘솔·`data-*`가 바뀔 때까지 기다려요 | `tests/e2e/module-hello.spec.ts`(`during` 반복), `tests/e2e/lab-esp32.spec.ts` |

### 4.7 금지 사항

- 등록 파일을 손으로 고치지 않아요: `python/modules.ts`, `modules/manifests.ts`, `modules/host.ts`, `LabShell.astro`, `worker.ts`는 폴더를 자동으로 찾아요. 여기에 모듈 이름을 적어야 한다면 규약이 깨진 거예요. 가상 보드의 부품도 같아요: `board/parts.ts`·`board/manifest.ts`·`board/view.ts`에 부품 이름을 적지 않아요(7절).
- 다른 모듈의 이름(요청·이벤트·채널·`apc_*` 파일 이름)을 쓰지 않아요. 한 패키지를 두 모듈이 덮어쓰지 않아요.
- 화면 밖으로 데이터를 보내지 않아요(원칙 2): 외부 주소 요청 금지. 모델·WASM은 같은 사이트(`public/vendor/`, `public/models/`)에서 받아요(PD-02). 학생 영상·랜드마크를 `localStorage`·공유 링크에 넣지 않아요(PLAN §10).
- 원작 게임·실제 포털 화면을 흉내 내지 않아요(SPEC §6.1·§8). 얼굴 식별(누군지 알아보기) 기능을 넣지 않아요.
- 동기 진입점에서 양보하지 않아요(4.4). 워커에서 DOM을 쓰지 않아요(`manifest.ts`는 워커에도 들어가요 — 순수 데이터만).
- 원본에서 옮긴 예제 파일(`examples/`)을 고치지 않아요 — 사이트판이 필요하면 `…-site.py`처럼 파일을 따로 두고(PD-10) 사이드카에 적어요.

---

## 5. 여러 사람이 동시에 만들 때 — 검증 환경과 포트

지금(Phase 5 교육과정 콘텐츠)의 구역·포트·차시 파일 표는 **5.4**예요. 5.1(Phase 3)·5.2(Phase 4)·5.3(Phase 2)은 그때의 기록이고, 한 폴더에 개발 서버를 여럿 띄우는 요령은 5.1에 있어요.

### 5.1 Phase 3 병렬 제작(P3-03~P3-10, 2026-09-17 준비) — 구역·포트·공유 파일

여섯 구역이 동시에 만들어요. **공유 파일은 고치지 않고**(필요하면 보고서의 "공유 파일 변경 요청"에 파일·바꿀 내용·이유를 적어요 — 통합 때 반영), 자기 구역의 **새 파일·새 폴더**만 만들어요.

| 구역 | 포트 | 만드는 것(PLAN §8.3) | 자기 파일·폴더(새로 만듦) | 자기 테스트 |
|---|---|---|---|---|
| A PWM·ADC 부품(P3-03) | 4501 | RGB LED 밝기, 버저(소리), 서보(프로필 2종 PD-15), 팬(진리표·속도), 4채널 아날로그 터치, `servo_library.py` 복원 | `src/lab/modules/board/parts/{rgb-led,laser,buzzer,servo,fan-motor,touch-analog-4ch}/`, `src/lab/modules/board/ext/{pwm,adc}/apc_board_{pwm,adc}.py`, `examples/esp32/lib/servo_library.py` | `tests/unit/lab/board-part-{rgb-led,laser,buzzer,servo,fan-motor,touch-analog-4ch}.test.ts`, `tests/unit/board-pwm/`, `tests/unit/lab/helpers/board-steps/pwm-adc.mjs` + `tests/unit/lab/pyodide-board-pwm-adc.test.ts`, `tests/e2e/lab-esp32-pwm-adc.spec.ts` |
| B I2C 표시 장치(P3-04) | 4502 | 바이트 수준 문자 LCD(PCF8574 → HD44780), OLED(두 이름 `ssd1306`·`sh1106`), RTC, `i2c_lcd.py` 배포본, 주소 없음 `OSError` | `parts/{lcd-i2c,oled-i2c}/`(`framebuf.py`·`ssd1306.py`·`sh1106.py`도 부품 폴더에), `ext/{i2c,rtc}/apc_board_{i2c,rtc}.py`, `examples/esp32/lib/third-party/i2c_lcd.py`(등록부 항목 있음) | `tests/unit/lab/board-part-{lcd-i2c,oled-i2c}.test.ts`, `tests/unit/board-i2c/**`(Pyodide 단계는 `steps/*.mjs`), `tests/e2e/esp32-i2c.spec.ts` |
| C 네오픽셀·UART·MP3·콘솔 입력(P3-05) | 4503 | 네오픽셀(`write` 때만), UART 링버퍼·송신 패널, DFPlayer 프레임·합성 음원(PD-16), `gorillacell_dcmotors.py` PWM판 복원 | `parts/{neopixel,uart,mp3}/`(machine 확장 `apc_board_bitstream.py`·`apc_board_uart.py`도 **부품 폴더 안**), `src/lab/modules/board-console/`, `examples/esp32/lib/third-party/gorillacell_dcmotors.py`(등록부 항목 있음) | `tests/unit/lab/board-part-{neopixel,uart,mp3}.test.ts`, `tests/unit/board-uart/**`, `tests/e2e/esp32-uart.spec.ts` |
| D Blockly 블록 모드(P3-06) | 4504 | 블록 ↔ 코드 보기, 사용자 정의 블록, 블록 전용 호환 모드(PD-27) 실험 | `src/lab/modules/blocks/`(ESP32 실습실 흉내 모듈 폴더 — `panel.astro`로 화면), `src/lab/blocks/`, `src/components/lab/blocks/BlocksPanel.astro` | `tests/unit/blocks/**`, `tests/e2e/esp32-blocks.spec.ts`, `tests/e2e/scenario-b.spec.ts`(도구 `tests/e2e/helpers/blocks.ts`) |
| E 실제 보드 ① 연결·raw REPL(P3-07) → ② 실행·저장(P3-08) | 4505 | Web Serial 연결·배너 판별·raw REPL·raw-paste, [실행]·[정지]·[보드에 저장] | `src/lab/serial/`(`mock/`·`web-serial.d.ts` 밖), `src/lab/modules/real-board/`(패널), `src/components/lab/real-board/` | `tests/unit/serial/real-board-*.test.ts`(모의 시리얼 8절), `tests/e2e/esp32-real-board.spec.ts`·`esp32-real-board-run.spec.ts` |
| F 펌웨어 굽기(P3-09) → 보드 준비 페이지(P3-10) | 4506 | esptool-js ROM 굽기(PD-38), 진행률·한국어 오류, 보드 준비 페이지 연결 흐름 | `src/lab/firmware/`(+ `mock/esp32-rom.ts`·`serial-plugin.ts`), `src/components/lab/firmware/`, `public/firmware/`, 보드 준비 페이지 `src/pages/start/board/**`·`src/components/start/board/`(키트 표는 이 폴더로 옮겼다)·`src/components/start/CableFigure.astro` | `tests/unit/firmware/**`(Container 테스트는 `*.container-test.ts` — 따로 설정), `tests/e2e/esp32-firmware.spec.ts`·`start-board.spec.ts`, `tests/e2e/start.spec.ts`의 보드 준비 페이지 검사 |

**공유 파일(고치지 않음 — 요청):** `package.json`·`package-lock.json`·`astro.config.mjs`·`sources.yaml`·`playwright.config.ts`·`vitest.config.ts`·`tsconfig.json`, `scripts/**`(특히 `scripts/examples-manifest.yaml`), `.github/**`, `src/lib/**`·`src/config/**`·`src/styles/**`·`src/layouts/**`, `src/lab/runtime/**`·`src/lab/python/**`·`src/lab/controls/**`·`src/lab/editor/**`·`src/lab/params/**`·`src/lab/errors/**`·`src/lab/modules/{manifests,host,types}.ts`·`src/lab/esp32/**`, `src/components/lab/**`, `src/pages/labs/esp32/index.astro`, **보드 핵심** `src/lab/modules/board/`의 `parts/<내 부품>/`·`ext/<내 기능>/` 밖 전부(`apc_board.py`·`machine.py`·`index.ts`·`view.ts`·`state.ts`·`parts.ts`·`part-types.ts`·`board-audio.ts` …), `content/help/errors/errors.yaml`(항목은 7.9의 모양으로 요청), 모의 시리얼 `src/lab/serial/mock/**`·`src/lab/serial/web-serial.d.ts`·`tests/e2e/helpers/serial.ts`, 공유 테스트 도구 `tests/unit/lab/helpers/{pyodide-board-run.mjs,pyodide-board.ts,board-snapshot.ts}`·`tests/e2e/helpers/{lab,vision}.ts`, 기존 spec·테스트 파일 전부(`lab-esp32*.spec.ts`·`examples-smoke.spec.ts` 등), 문서 `CLAUDE.md`·`PROGRESS.md`·`MAINTENANCE.md`·`docs/**`·이 README.
**예제 사이드카:** 파일 하나는 주인 구역만 고쳐요(아래 표). 다른 구역의 부품이 함께 있어야 끝까지 도는 예제는 주인이 자기 몫만 확인하고, `smoke:`·"준비 중" 문장은 통합 때 함께 맞춰요(보고서에 적기).

| 주인 | 예제(코드 id — `examples/esp32/` 뒤 경로) | 함께 필요한 구역 |
|---|---|---|
| A | f059 `u2/2-1-3-adv-touch4-check`, f060 `u2/2-1-4-rgb-pwm-fade`, f061 `u2/2-1-4-rgb-check`, f062 `u2/2-1-4-laser-rgb`(원본 결함 TypeError 그대로), f063 `u2/2-1-4-laser-check`, f067 `u2/2-2-1-buzzer-check`, f068 `u2/2-2-1-buzzer-scale`, f069 `u2/2-2-1-adv-touch-buzzer`, f073 `u2/2-2-3-fan-direction`, f078~f080 `u2/2-2-4-servo-{angles,sweep,two}` | — |
| A | f058 `u2/2-1-3-adv-touch4-oled-rgb` | B(OLED) |
| A | f081 `u2/2-2-4-servo-keyboard` | C(콘솔 입력) |
| B | f047·f048·f050 `u2/2-1-2-lcd-{text-check,number-check,count}`, f051 `u2/2-1-2-lcd-rtc-clock`(RTC), f052 `u2/2-1-2-adv-touch-lcd-counter`(P3-02 사이드카 — "준비 중" 문장 지우기), f054·f055·f057 `u2/2-1-3-oled-{text-check,number-check,triangle-dots}`, f144 `bt/b5-lcd-hello` | — |
| B | f049 `u2/2-1-2-lcd-keyboard-check`, f056 `u2/2-1-3-oled-keyboard-check` | C(콘솔 입력) |
| C | f064·f065 `u2/2-1-5-neopixel-{check,rainbow}`, f070·f071 `u2/2-2-2-mp3-{check,announcement}`, f001 `hw/uart2-rgb-text`, f007 `hw/uart2-rgb-bytes`, f074 `u2/2-2-3-fan-library`(원본 결함 SyntaxError 그대로) | A(RGB LED — f001·f007) |
| C | f066 `u2/2-1-5-adv-touch4-mood-light`, f072 `u2/2-2-2-adv-touch4-mp3-player` | A(4채널 터치) |
| C | f075~f077 `u2/2-2-3-fan-{speed,keyboard,keyboard-speed}` | A(팬 모터 부품) |

```bash
npm ci                                                               # 처음 한 번
ASTRO_DEV_BACKGROUND=1 npm run dev -- --port 4501 --ignore-lock      # 내 포트(위 표). 에이전트 안에서는 ASTRO_DEV_BACKGROUND=1이 꼭 필요
PW_BASE_URL=http://localhost:4501/ai-physical-computing/ npx playwright test tests/e2e/lab-esp32-pwm-adc.spec.ts --project=desktop --output=<저장소 밖 폴더>
npx vitest run tests/unit/lab/board-part-buzzer.test.ts tests/unit/lab/pyodide-board-buzzer.test.ts
```

**한 작업 폴더에 개발 서버 여럿(2026-09-17 Astro 7.3.2로 다시 확인):**

- `--ignore-lock`을 붙인 서버는 잠금 파일(`.astro/dev.json`)을 읽지도 쓰지도 않아 **같은 폴더에서 나란히 뜨고**, 두 서버(4500·4501)에 각각 spec을 동시에 돌려 모두 통과했어요. 붙이지 않은 서버가 먼저 떠 있으면 다음 서버(붙이지 않은 것)는 `Another astro dev server is already running.`으로 멈춰요.
- AI 에이전트 안에서 `--ignore-lock`은 **`ASTRO_DEV_BACKGROUND=1`과 함께만** 돼요(없으면 Astro가 백그라운드로 띄우려다 "`--ignore-lock` cannot be used together with an auto-detected AI agent environment" 오류 — `node_modules/astro/dist/cli/dev/index.js`).
- 새 서버가 뜰 때 콘텐츠 저장소(`.astro/`)를 다시 만들어 먼저 뜬 서버의 페이지가 한 번 새로 고쳐질 수 있어요. 새 패키지(Blockly 등)를 처음 import하는 페이지는 Vite가 의존성을 다시 묶느라 `504 (Outdated Optimize Dep)` 뒤 저절로 새로 고쳐요 — 기다리면 돼요.
- **끄기:** `--ignore-lock` 서버는 `astro dev stop`이 찾지 못해요. 에이전트의 백그라운드 작업을 멈춰도 Windows에서는 node 프로세스가 남으니 `Get-NetTCPConnection -LocalPort 4501 -State Listen`으로 PID를 찾아 `Stop-Process -Id <PID>`로 꺼요(끈 뒤 포트가 비었는지 다시 확인).
- **의존성 미리 묶기 폴더 나누기(2026-09-18 실측):** 서버 여럿이 `node_modules/.vite/deps`를 함께 쓰면 뒤에 뜬 서버가 다시 묶어 앞 서버의 `@codemirror_*.js`가 `504 (Outdated Optimize Dep)`를 되풀이하고 실습실이 `data-state="unloaded"`에 멈춰요(새로 고쳐도 같아요). `APC_VITE_CACHE_DIR=.cache/vite-450x`를 서버마다 다르게 주면 폴더가 나뉘어 생기지 않아요(`astro.config.mjs`가 이 환경 변수를 읽어요, 값이 없으면 지금과 같음).

**미리 설치·등록된 것(쓰기만 해요):**

- **Blockly 13.3.0**(Apache-2.0, `sources.yaml` 등록·`public/licenses/blockly.txt`): `import * as Blockly from 'blockly/core'`, `import 'blockly/blocks'`, `import { pythonGenerator } from 'blockly/python'`, 한국어 `import * as Ko from 'blockly/msg/ko'` → `Blockly.setLocale(Ko)`(개발 서버·Edge에서 `text_print` 블록 → `print('안녕')` 생성과 한국어 메시지 확인). 소리·커서 파일은 `scripts/vendor-assets.mjs`가 `public/vendor/blockly/13.3.0/media/`로 복사 → `inject(…, { media: blocklyMediaPath() })`(`src/lab/vendor-paths.ts`). 큰 묶음이라 블록 모드를 열 때 `import()`로 늦게 받아요.
- **esptool-js 0.6.1**(Apache-2.0): 패키지 안의 **플래셔 스텁은 GPL-2.0-or-later**(esptool v4.6.1 `flasher_stub` — esptool-js 저장소 `src/targets/stub_flasher/README.md`)라 싣지 않아요(PLAN PD-38). 스텁 JSON을 import하는 길(`ESPLoader.main()`·`runStub()`)을 부르면 빌드·개발 서버가 그 모듈을 한국어 오류를 던지는 모듈로 바꿔요(`scripts/lib/esptool-stub-guard.mjs`). ROM 부트로더와 직접(`detectChip` → 쓰기) 구워요. 의존성 `pako`·`tslib`·`atob-lite`도 등록됨.
- **@types/w3c-web-serial 1.0.8**(타입만): `src/lab/serial/web-serial.d.ts`가 불러와 `SerialPort`·`navigator.serial` 타입을 어디서나 import 없이 써요.
- **esbuild 0.28.2**(devDependency): 모의 시리얼을 브라우저에 끼울 때 묶는 데만 써요(8절).
- **펌웨어 파일은 받지 않아요**(인터넷에서 파일 내려받기 금지): F 구역은 받을 곳·크기·SHA-256을 조사해 요청으로 남기고, 테스트는 `page.route`로 가짜 응답을 주거나 테스트 안에서 만든 임시 파일을 써요. `public/firmware/`에는 파일을 넣지 않아요(넣으려면 `sources.yaml` 등록이 먼저 — 공유 파일).

### 5.2 Phase 4 병렬 제작(P4-02~P4-11, 2026-09-18 준비 → 2026-09-24 통합) — 구역·포트·공유 파일

여섯 구역(A~F)이 동시에 만들고, 앞 구역이 끝나야 되는 둘(G·H)은 2차로 붙어요. **공유 파일은 고치지 않고**(필요하면 요청 — 아래 "공유 파일 변경 요청"),
자기 구역의 **새 파일·새 폴더**만 만들어요. 통신 규칙의 헌법은 `docs/PLAN.md` §7이고, 브릿지 코드 약속은 이 문서 **9절**이에요.

**실제로 만든 것(2026-09-24 통합 기준 — 준비 때 계획한 폴더 이름과 다른 곳이 있어 이 표가 정답이다):**

| 구역(실행 이름) | 포트 | 묶음 | 만든 파일·폴더 | 테스트 |
|---|---|---|---|---|
| A vision | 4701 | P4-02 | `src/lab/modules/serial-pc/`(PC 쪽 `serial.py` 흉내 — **파일 이름이 곧 import 이름**), `src/lab/modules/vision-bridge/`(두 실습실을 잇는 선 `link.ts`·보드 쪽 `board-uart.ts`·[보내기] 패널 논리), `src/components/lab/bridge/` | `tests/unit/bridge-serial/**`, `tests/e2e/bridge-vision-board.spec.ts` |
| B ble(가상) | 4702 | P4-03 | `modules/board/ext/ble/apc_board_ble.py`, `modules/board/parts/ble/`, `examples/esp32/lib/third-party/esp32_ble_util.py`(사이트판), 블루투스 사이트판 예제 5개 | `tests/unit/board-ble/{ble-state,pyodide-ble}.test.ts`, `tests/unit/lab/board-part-ble.test.ts`, `tests/e2e/esp32-ble.spec.ts` |
| B ble(실제) | 4702 | P4-04 | `src/lab/ble/`, `src/lab/modules/web-bluetooth/`, `src/components/lab/ble/` | `tests/unit/board-ble/web-bluetooth-*.test.ts`, `tests/e2e/web-bluetooth.spec.ts` |
| C serialport | 4703 | P4-05 | `src/lab/serial/data-port/`, `src/lab/modules/data-port/`, `src/components/lab/data-port/` | `tests/unit/serial/data-port-*.test.ts`, `tests/e2e/data-port.spec.ts` |
| D mqtt | 4704 | P4-06·P4-07 | `src/lab/mqtt/`, `src/lab/modules/mqtt/`, `modules/board/ext/network/`, `src/lab/dashboard/`, `src/components/lab/dashboard/`, 페이지 `src/pages/labs/iot/dashboard/`(통합에서 `/labs/dashboard/` → 통신 실습실 아래로) | `tests/unit/{mqtt,dashboard}/**`, `tests/e2e/{mqtt,dashboard}.spec.ts` |
| E templates | 4705 | P4-10 | `examples/esp32/templates/`(통신 템플릿 3종), `src/lab/blocks/comm/` | `tests/unit/blocks/comm-*.test.ts`, `tests/e2e/esp32-comm-blocks.spec.ts` |
| F gallery | 4706 | P4-11 | `src/lab/gallery/`의 새 파일, `src/components/examples/`, 페이지 `src/pages/labs/gallery/`(통합에서 `/examples/` → 사이트 지도 주소로) | `tests/unit/gallery/**`, `tests/e2e/examples-gallery.spec.ts` |
| **2차** G scenario-f | 4707 | P4-08 | `src/lab/modules/vision-bridge/finger-count/bridge.py`(새 예제용 `bridge` 모듈), `examples/{vision,esp32}/u4/c3-*.py`, 보충 C3 초안 `content/lessons/supplement/c3.md`(`draft: true` — Phase 5 통합에서 `content/lessons/u3/c3.md`로 옮겨 공개) | `tests/unit/bridge-serial/pyodide-bridge.test.ts`, `tests/e2e/scenario-f.spec.ts` |
| **2차** H unit4 | 4708 | P4-09 | `src/pages/labs/unit4/`, `src/lab/unit4/`, `src/components/lab/unit4/`, (구역 밖을 통합이 받아들임) `src/lab/modules/ble-pc/`(PC 쪽 `bluetooth`·`bluetooth_lib` 흉내) | `tests/e2e/unit4.spec.ts` |

통합(2026-09-24)이 더한 것: 통신 실습실 안내 페이지 `src/pages/labs/iot/index.astro`(9.9 앞 "한눈에"), 사이트 지도의 대시보드·4단원 통합 실습실, 오류 사전 `comm` 묶음 21항목,
3-1-2 사이트판(`examples/esp32/u3/3-1-2-uart-laser-site.py`), 보드 이벤트 `board.uart.tx`를 실제로 보내는 줄(`apc_part_uart.py`), 영상처리 예제의 실습 방법 칸(`VisionIo`),
재생 입력 "윙크·두 눈 감기(클릭)"(`face-wink`), 점검 페이지의 중계 서버 연결 시험, 링크 검사 `example-wrong-lab`. 까닭은 `docs/PLAN.md` §8.4 "통합 구현 메모".

**준비 때 계획한 표(기록):**

| 구역 | 포트 | 만드는 것(PLAN §8.4) | 자기 파일·폴더(새로 만듦) | 자기 테스트 |
|---|---|---|---|---|
| A 영상처리 → 가상 보드(P4-02) | 4701 | [보내기] 패널, PC 쪽 `serial` 흉내, PC 쪽 `bluetooth`·`bluetooth_lib` 대체, 새 예제용 `bridge` 모듈, 한 화면에 영상처리 + 가상 보드 | `src/lab/modules/send-panel/`(영상처리 실습실 흉내 모듈 — `serial.py`·`bluetooth.py`·`bluetooth_lib.py`·`bridge.py`는 **파일 이름이 곧 import 이름**이라 이 폴더에 둬요), `src/components/lab/send/` | `tests/unit/lab/module-send-panel.test.ts`, `tests/unit/lab/pyodide-send-panel.test.ts`, `tests/e2e/lab-send-panel.spec.ts` |
| B 가상 BLE(P4-03) | 4702 | `ubluetooth` 저수준 흉내 위에서 `ESP32BLE.py` **원본 실행**(상태 LED 깜빡임까지), `esp32_ble_util` 가상판, 보드 쪽 송신 패널, 가상 스마트폰 앱 패널(f002) | `src/lab/modules/board/ext/ble/`(자리·설명 있음 — `apc_board_ble.py`), `src/lab/modules/board/parts/ble/`(화면·조작 칸), `examples/esp32/lib/third-party/esp32_ble_util.py`(등록부 항목 요청) | `tests/unit/board-ble/**`(Pyodide 단계는 `tests/unit/lab/helpers/board-steps/ble.mjs`), `tests/unit/lab/board-part-ble.test.ts`, `tests/e2e/esp32-ble.spec.ts` |
| C 실제 기기 연결(P4-04 Web Bluetooth → P4-05 Web Serial 데이터 포트) | 4703 | 선택 창(`namePrefix` + NUS `optionalServices`), 응답 있는 쓰기 직렬 대기열, 알림 받기, 교실 이름 규칙 안내 / USB-UART 변환기를 **두 번째 포트**로 열기·포트 이름표·(실험) USB 한 개로 보내기 | `src/lab/ble/`(Web Bluetooth), `src/lab/modules/real-ble/`, `src/lab/serial/data-port.ts`+`src/lab/modules/data-port/`, `src/components/lab/ble/` | `tests/unit/ble/**`(가짜 `navigator.bluetooth`), `tests/unit/serial/data-port-*.test.ts`(모의 시리얼 8절), `tests/e2e/esp32-ble-real.spec.ts`·`lab-data-port.spec.ts` |
| D MQTT·탭 통로(P4-06) | 4704 | MQTT.js 5.15.2 통로(`registerBridgeChannel`), 브로커 목록·무작위 접두어·공개 브로커 경고(PD-29), 가상 보드 `network.WLAN`·`umqtt.simple` 흉내, BroadcastChannel 통로 붙이기 | `src/lab/modules/mqtt/`, `src/lab/mqtt/`, `src/lab/modules/board/ext/network/`(자리·설명 있음 — `apc_board_network.py`·`apc_board_umqtt.py`) | `tests/unit/mqtt/**`, `tests/unit/board-network/**`, `tests/e2e/lab-mqtt.spec.ts`(두 페이지) |
| E 대시보드(P4-07) | 4705 | 게이지·실시간 그래프·스위치·텍스트 로그 위젯, 끌어다 배치(배치는 localStorage) → **시나리오 D** | `src/pages/labs/iot/`(사이트 지도에 이미 있는 주소), `src/lab/dashboard/`, `src/components/lab/dashboard/` | `tests/unit/dashboard/**`, `tests/e2e/dashboard.spec.ts`·`scenario-d.spec.ts` |
| F 통신 템플릿·통신 블록(P4-10) | 4706 | MicroPython 템플릿 3종(UART 에코 / BLE 알림 / umqtt 발행·구독 — 실제 보드용 수신은 LED·LCD 표시만, 허용 목록·길이 검사 기본), Blockly 통신 블록과 Python 생성기 | `examples/esp32/comm/*.py`(사이트가 만든 예제라 머리말 규약 2절), `src/lab/blocks/comm/`(새 블록 묶음), `src/lab/modules/blocks/`의 **새 파일만** | `tests/unit/blocks/comm-*.test.ts`, `tests/e2e/esp32-comm-templates.spec.ts` |
| **2차** G 시나리오 F·4단원 통합(P4-08·P4-09) | 4707 | 손가락 개수 송신 + 네오픽셀 N개 수신 예제(카메라 없이 합성 랜드마크만으로 통과 — PD-30), 카메라 + 가상 데스크톱 + 가상 보드 한 화면·성능 측정 | `examples/vision/supplement/c3-*.py`·`examples/esp32/comm/c3-*.py`, `src/components/lab/combined/` | `tests/e2e/scenario-f.spec.ts`, `tests/e2e/lab-textbook-u4-combined.spec.ts` |
| **2차** H 예제 갤러리(P4-11) | 4708 | `examples/`와 차시 frontmatter에서 카드·태그를 빌드 때 자동 생성, 태그 필터·검색 연동, 카드에서 실습실로 불러오기 | `src/pages/examples/`, `src/components/gallery/`, `src/lab/gallery/`의 **새 파일만**(`facets.ts`는 있음) | `tests/unit/gallery/**`, `tests/e2e/examples-gallery.spec.ts` |

- **A·B가 먼저 끝나야** G가 시작돼요(짝 예제가 양쪽에서 돌아야 시나리오 F·4단원 통합을 볼 수 있어요). H는 태그 규약(아래 ⑤)만 있으면 언제든 시작할 수 있어요.
- C는 **실물 기기가 있어야 끝까지 확인**돼요. 화면 흐름·오류 안내까지만 자동 테스트로 보고, 실제 송수신은 "확인 필요"로 남겨 부록 B와 운영자 할 일에 적어요.

**공유 파일(고치지 않음 — 요청):** `package.json`·`package-lock.json`·`astro.config.mjs`·`sources.yaml`·`playwright.config.ts`·`vitest.config.ts`·`tsconfig.json`,
`scripts/**`(특히 `scripts/examples-manifest.yaml`), `.github/**`, `src/lib/**`·`src/config/**`·`src/styles/**`·`src/layouts/**`,
**브릿지 핵심** `src/lab/bridge/**`(새 통로는 `registerBridgeChannel`로 끼워요 — 9.6), `src/lab/runtime/**`·`src/lab/python/**`·`src/lab/controls/**`·`src/lab/editor/**`·`src/lab/params/**`·`src/lab/errors/**`·`src/lab/loader/**`·`src/lab/modules/{manifests,host,types,panel-when-used}.ts`·`src/lab/esp32/**`·`src/lab/vision/**`·`src/lab/gallery/facets.ts`,
`src/components/lab/**`(LabShell·BoardIo·VisionIo 등), `src/pages/labs/{vision,esp32}/index.astro`,
**보드 핵심** `src/lab/modules/board/`의 `parts/<내 부품>/`·`ext/<내 기능>/` 밖 전부, 다른 구역의 흉내 모듈 폴더, `content/help/errors/errors.yaml`,
모의 시리얼 `src/lab/serial/mock/**`·`tests/e2e/helpers/**`, 기존 spec·테스트 파일 전부, 문서 `CLAUDE.md`·`PROGRESS.md`·`MAINTENANCE.md`·`docs/**`·이 README.

**공유 파일 변경 요청:** 고쳐야 할 것이 있으면 직접 고치지 말고 `.cache/phase4-requests/<구역>-<짧은 이름>.md`에 **파일·바꿀 내용·이유·영향 범위**를 적고 보고서에도 한 줄 남겨요(통합 담당이 반영해요).
오류 사전 항목은 `content/help/errors/errors.yaml`의 "▼ 구역 … 항목 자리" 표시 아래에 넣을 YAML 덩어리를 그대로 요청에 적어요(모양은 7.9의 6번).

**예제 사이드카 주인(파일 하나는 주인 구역만 고쳐요):**

| 주인 | 예제(코드 id — `examples/` 뒤 경로) | 함께 필요한 구역 |
|---|---|---|
| A | f084 `vision/u3/3-1-2-uart-key-send`, f085 `vision/u3/3-1-2-adv-face-uart`, f089 `vision/u3/3-1-3-hand-ble-xy`, f158 `vision/bt/b11-finger-xy-send`, f082 `esp32/u3/3-1-2-uart-laser`, f083 `esp32/u3/3-1-2-uart-laser-boot` | — |
| B | f086 `esp32/u3/3-1-3-ble-xy-rgb`, f098·f099 `esp32/u4/4-1-4-*`, f105·f106 `esp32/u4/4-2-1-*`, f109~f113 `esp32/u4/4-2-2-*`, f115 `esp32/u4/4-2-3-*`, f137·f147~f149·f157 `esp32/bt/*`, f002 `esp32/hw/ble-dabble-rgb` | A(f002·f148의 RGB LED는 이미 있음), G(짝 맞추기) |
| C | — (실제 기기 흐름만) | — |
| D | — | — |
| G | f100 `vision/u4/4-1-4-adv-face-ble-tx`, f104 `vision/u4/4-2-1-face-mouse-ble-tx`, f114 `vision/u4/4-2-3-face-mouse-ble-tx-lib` | A·B |

- 사이드카의 `smoke:`는 **지금 나는 결과 그대로**예요. 자기 구역이 흉내를 더해 결과가 바뀌면 그 자리에서 고치고 보고서에 적어요.
- 사이드카에 **갤러리 태그**(`unit`·`difficulty`·`virtual_ok`·`comm`)를 채우는 것도 주인 구역 몫이에요(아래 ⑤).
- `examples/` 폴더에서 **예제가 아닌 것**: `esp32/lib/`(보드 라이브러리 — 보드에 올라가요)와 `vision/lib/`(PC에서 돌릴 때만 쓰는 원본 — 실습실 목록·스모크에 안 나와요).

```bash
npm ci                                                               # 처음 한 번
APC_VITE_CACHE_DIR=.cache/vite-4701 ASTRO_DEV_BACKGROUND=1 npm run dev -- --port 4701 --ignore-lock
PW_BASE_URL=http://localhost:4701/ai-physical-computing/ npx playwright test tests/e2e/lab-send-panel.spec.ts --project=desktop --output=<저장소 밖 폴더>
npx vitest run tests/unit/lab/module-send-panel.test.ts
```

한 작업 폴더에 개발 서버를 여럿 띄울 때 부딪히는 것(`--ignore-lock`·`ASTRO_DEV_BACKGROUND=1`·`APC_VITE_CACHE_DIR`·끄는 법)은 **5.1의 설명 그대로**예요.

**이번 Phase에서 미리 열어 둔 자리(고치지 않고 쓰기만 해요, 2026-09-18):**

1. **보드 이벤트 `board.uart.tx`** — 보드가 시리얼 선으로 내보낸 바이트를 화면에 알리는 이름을 보드 manifest에 넣어 두었어요(`apc_board.EVENT_UART_TX`).
   보드 → PC 방향은 `board.device` 상태(최근 꼬리)가 아니라 이 이벤트로 보내요(PLAN §8.4 설계 메모 ②). 쓰는 곳은 A(UART 부품)와 D(탭 통로)예요.
2. **machine 확장 자리** `ext/ble/`·`ext/network/` — 폴더와 설명(README.md)이 있어요. `apc_board.install()`이 `bluetooth`·`ubluetooth`·`network`를 **한국어 자리 안내**로 먼저 등록하고
   그다음에 확장을 부르므로, 확장이 같은 이름을 다시 등록하면 확장이 이겨요. `NOT_YET_MODULES`에는 `umqtt`·`esp32_ble_util`이 들어 있어요(파일이 생기면 저절로 그 파일이 import돼요).
3. **통신 패널 자리는 새로 만들지 않았어요** — 흉내 모듈의 `panel.astro`가 이미 `placement: 'panel'`(오른쪽 조절 패널)과 `'wide'`(콘솔 위 전체 폭) 두 자리에 들어가요(4.5절).
   [보내기] 패널·대시보드 위젯은 그 자리를 쓰고, `LabShell.astro`·`BoardIo.astro`는 고치지 않아요. 패널은 **코드가 그 모듈을 쓸 때만** 열어요(`showPanelWhenUsed`).
4. **오류 사전 통신 묶음** `comm` — `content/help/errors/errors.yaml`에 묶음과 첫 항목 네 개(PC 쪽 모듈 준비 중 / `ESP32BLE_LIB` 이름 / 받을 쪽 없음 / 통로 닫힘)가 있어요.
   구역 항목은 "▼ 구역 …" 자리 표시 아래에 넣도록 요청해요.
5. **예제 갤러리 태그 규약** `src/lab/gallery/facets.ts` — 단원(`unit`)·난이도(`difficulty`)·가상 보드 가능(`virtual_ok`)·통신 방식(`comm`)·부품(`parts`)·낱말(`tags`)을
   **차시 md frontmatter와 예제 사이드카에 같은 이름으로** 적어요(칸마다 차시가 먼저, 없으면 사이드카). 통신 방식은 `uart`·`ble`·`wifi`·`mqtt`·`tab` 다섯 가지고,
   **모르면 적지 않아요**(빈 값은 "해당 없음"이 아니라 "아직 모름"이라 갤러리가 그 필터에서 빼요). 부품은 배선(`parts`)에서 저절로 나오니 따로 적지 않아요.
6. **MQTT.js 5.15.2**(MIT, `sources.yaml`·`public/licenses/mqtt.txt`) — 설치돼 있어요. 브라우저는 `package.json` exports의 browser 조건으로 **미리 묶인 한 파일**을 받아서
   번들에 들어가는 npm 패키지는 `mqtt` 하나예요(esbuild로 확인). 실습실에 붙인 뒤 `npm run build`의 번들 출처 검사로 다시 확인해요.

### 5.3 Phase 2 병렬 제작 때의 기록(P2-05~P2-13)

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
- 원고·교안 이미지는 원고 이미지 추출 도구로 꺼내고(차시 그림 목록 `content/lessons/<단원>/<차시>.images.yaml` → `npm run images:extract -- <차시>`, P5-01 — `MAINTENANCE.md` 3-1), 그 목록의 눈 확인 기록(`reviewed`)을 그림과 함께 커밋해요(PD-32). 차시 밖 그림의 기록은 `scripts/image-allowlist.yaml`. 5MB를 넘는 파일은 `scripts/repo-allowlist.yaml`의 `large_files`에 경로·이유·`max_mb`(10 이하).
- 커밋은 경로 지정(`git add <경로>`), 메시지는 한국어 "무엇을 왜" + `Co-Authored-By` 줄, `--no-verify` 금지.

### 5.4 Phase 5 병렬 제작(P5-03~P5-14, 2026-09-25 준비) — 구역·포트·차시 파일·공유 파일

교과서 차시를 구역이 나눠 써요. 공통 틀(P5-01 원고 이미지 추출 도구, P5-02 차시 틀·검사·기준 차시)은 먼저 끝났어요.
**구역은 자기 차시 파일(md)·그림 목록·그림 폴더·새 예제만 만들고 고쳐요.** 공유 파일은 고치지 않고 요청해요(아래).

- **쓰는 법:** `MAINTENANCE.md` 1절(설정 칸·8칸·상자·용어·그림·퀴즈·교사용·검사 규칙 표)과 3-1절(원고 그림). **본보기는 기준 차시 `content/lessons/u1/1-1-1.md`** — 문장 수준, 상자 쓰는 법, 퀴즈 모양, 교사용 접기 내용을 여기에 맞춰요.
- **구역의 완료 기준:** ① `npm run check:lessons -- <내 차시 번호들>` 오류 0(참고는 괜찮지만 줄일 수 있으면 줄여요) ② 원고 그림을 꺼냈으면 `npm run images:check` 통과·한 장씩 눈 확인 기록 ③ 개발 서버에서 내 차시를 **직접 열어** 8칸·그림·퀴즈(키보드로 한 문항)·교사용 접기·발표 모드(→로 끝까지)를 눈으로 확인 ④ `npm run check` 0오류, `npx vitest run tests/unit/lesson/`(견본 차시 V1~V5를 고친 A는 `sample-lessons.test.ts` 포함) 통과.
- **성취기준:** frontmatter `standards`는 PLAN §2.2 대응표(`src/config/standards.ts`의 `LESSON_STANDARDS`)와 **똑같이**. 해설과 다시 대조해 바꿔야 하면 고치지 말고 요청해요(근거 문장과 함께).
- **원고 없는 차시**(1-3-1~1-4-3, 4-1-1~4-2-2 — 차례표 원천 `code-only`)는 코드·주석·교안·대단원 마무리 문항으로 본문을 새로 쓰고, "원고 없음: 사이트가 코드 기준으로 쓴 본문" 표시는 교사용 접기에 저절로 붙어요. 사실(API 이름·핀·쪽·코드 id)은 코드·실습실에서 확인한 것만 적어요.
- **개인정보:** 얼굴이 나온 쪽은 공개하지 않아요(운영자 할 일 4번 기본값 — 손만 잘라 쓰거나 사이트가 그린 그림). 제외 쪽은 도구가 막아요(`scripts/image-exclusions.yaml`). 학교 전체 이름은 차시·주석·커밋 메시지 어디에도 적지 않아요.
- **스톡 그림 금지(결정 C11)** — 표기가 없어도 스톡으로 보이면(INVENTORY §5.2 "스톡 추정") 사이트가 그린 SVG로 바꿔요(기준 차시가 011쪽 그림을 S07로 바꾼 것처럼).

| 구역 | 포트 | 묶음(PLAN §8.5) | 차시 파일(`content/lessons/` 뒤) | 새 그림 폴더(`public/images/lessons/` 뒤) | 원고(인쇄 쪽) |
|---|---|---|---|---|---|
| A I단원 01·보충 | 4801 | P5-03(1-1-1 제외)·P5-04 | `u1/1-1-2.md`·`u1/1-1-3.md`, 보충 본문 완성 `u1/v1.md`~`u1/v5.md` | `1-1-2/`(샘플 6장 있음 — 목록 `u1/1-1-2.images.yaml`)·`1-1-3/`·`v1/`~`v5/`(V1~V5의 옛 SVG는 `supplement/`에 그대로) | U1 013~023 |
| B I단원 02·03 | 4802 | P5-05·P5-06 | `u1/1-2-1.md`~`u1/1-2-3.md`, `u1/1-3-1.md`~`u1/1-3-3.md`(원고 없음) | `1-2-1/`~`1-2-3/`·`1-3-1/`~`1-3-3/` | U1 024~051 |
| C I단원 04·마무리, III단원 보충 | 4803 | P5-07·P5-12 | `u1/1-4-1.md`~`u1/1-4-3.md`(원고 없음, 1-4-3은 선택 차시), `u1/review.md`(I 마무리, 정답 294쪽), `u3/c1.md`·`u3/c2.md`, C3 초안 `supplement/c3.md` → `u3/c3.md`로 옮기고(`git mv` — 주소는 그대로 `/learn/u3/c3/`) `draft: true`를 풀어요 | `1-4-1/`~`1-4-3/`·`u1-review/`(목록에 `folder: u1-review`)·`c1/`~`c3/` | U1 112~113·294 |
| D II단원 01 | 4804 | P5-08·P5-09 | `u2/2-1-1.md`~`u2/2-1-3.md`, `u2/2-1-r.md`(읽기 자료, `kind: reading`), `u2/2-1-4.md`·`u2/2-1-5.md` | `2-1-1/`~`2-1-5/`·`2-1-r/` | U2A 114~153 |
| E II단원 02·마무리 | 4805 | P5-10 | `u2/2-2-1.md`~`u2/2-2-4.md`, `u2/review.md`(II 마무리 — 정답·해설 새로 씀) | `2-2-1/`~`2-2-4/`·`u2-review/` | U2B 154~167·U2C 166~181 |
| F III단원 | 4806 | P5-11 | `u3/3-1-1.md`~`u3/3-1-4.md`, `u3/p1.md`(보충 P1 — PyAutoGUI), `u3/review.md`(III 마무리 — 정답·해설 새로 씀) | `3-1-1/`~`3-1-4/`·`p1/`·`u3-review/` | U3 182~209, BT 교안, PPT |
| **2차** G IV단원 | 4807 | P5-13 | `u4/4-1-1.md`~`u4/4-2-2.md`(모두 원고 없음), IV단원 프로젝트 안내(교사용 — 12인피04-02~04-04의 문제 정의·팀 역할·사회적 영향 점검 틀, "영상인식에 따른 개인정보·윤리 문제가 생기는 주제는 피하기")는 `u4/project.md`(`kind: reading`, `source: supplement` — 원고가 없어 `pages`는 적지 않음)로 쓰고 차례표·대응표 한 줄씩을 요청 | `4-1-1/`~`4-2-2/`·`project/` | 없음(코드 `examples/vision/u4/`·`examples/esp32/u4/`) |
| **2차** H 교사용 자료실·문제 해결 | 4808 | P5-14 | `src/pages/teacher/**`·`src/components/teacher/`(새로), FAQ(`src/pages/help/` 안 새 페이지), 가린 편집본 PDF(`public/teacher/handouts/` — 파일 이름은 `src/components/lesson/handouts.ts`와 같게, 저장소 검사 허용 목록은 요청) | — | BT 교안·PPT(편집본 쪽마다 눈 확인) |

- **통합 결과(2026-09-25):** 표의 차시 45편이 모두 생겼어요(`npm run check:lessons -- --complete` 통과). 실제로는 구역 이름이 표와 조금 달랐어요(구역 보고 `.cache/phase5-notes/zone-{a,b,c,d,e,f,g,h}-*.md` — 예: 2단원은 D 한 구역, 3단원·보충 P1·C1~C3은 E, 4단원은 F, 교사용 자료실 G, 가린 편집본 H). 보충 C1~C3은 구역이 `content/lessons/supplement/`에 두었던 것을 통합이 표대로 `u3/`로 옮겼어요(주소는 그대로 `/learn/u3/c1/`~`c3/`). 통합 뒤 바뀐 규칙: 운영자 본인 얼굴 쪽(O9)·출판사 삽화(O10 — `third_party: publisher` 없이 차시 그림 폴더에)·학교명(O11)·예제 MIT(O13) — MAINTENANCE.md 2·3절.
- **2차 구역**은 1차가 끝난 뒤에 시작해요: G는 B(페이스 매시)·F(블루투스)의 낱말과 설명을 이어 쓰고, H는 모든 차시의 교사용 접기·`src/config/standards.ts`를 읽어 차시별 지도 요약 모음·성취기준·평가 방향 표를 만들어요. 마지막에 `npm run check:lessons -- --complete`(차례표의 차시가 모두 있어야 통과)가 Phase 5 완료 기준이에요.
- **예제:** 교과서·교안 예제는 이미 `examples/`에 있어요(`docs/CODE_MAPPING.md`의 코드 id ↔ 파일). 옮긴 코드 파일은 고치지 않아요(PD-10 사이트판 규칙). 새 체험 예제는 `examples/<실습실>/<단원>/<차시>-<이름>.py`에 머리말 규약(2절)대로 새로 써요. **자기 차시가 쓰는 예제의 사이드카**(`*.meta.yaml`의 title·description·lesson·practice·tags·difficulty)는 고쳐도 되고, `smoke`·`parts`를 바꾸면 `SMOKE_ONLY=<코드 id> npx playwright test tests/e2e/examples-smoke.spec.ts`로 확인해 보고서에 적어요. 배선은 되도록 차시 md `examples[].parts`에 적어요(사이드카보다 먼저 읽혀요).

**공유 파일(고치지 않음 — 요청):**
차시 틀 `src/components/lesson/**`(`curriculum.ts` 차례표 포함)·`src/pages/learn/**`, 설정 `src/config/**`(`nav.ts`·`standards.ts`·`content-schemas.ts`)·`src/lib/**`(`remark-boxes.mjs`·`remark-glossary.mjs`)·`src/styles/**`·`src/layouts/**`,
**용어사전 `content/glossary/**`(새 용어는 요청 — 통합이 넣어요. 그전까지 `:용어[…]`는 글자만 보이고 검사는 참고만 남겨요)**, `sources.yaml`, `scripts/**`(`image-exclusions.yaml`·`image-allowlist.yaml`·`examples-manifest.yaml`·검사 도구), `package.json`·`package-lock.json`·`astro.config.mjs`·`.github/**`,
**다른 구역의 차시 md·그림 목록·그림 폴더**, 원본에서 옮긴 예제 코드 파일, 기존 테스트·spec 전부(`learn.spec.ts`·`lesson-template.spec.ts`·`sample-lessons.test.ts` …), 문서 `CLAUDE.md`·`PROGRESS.md`·`MAINTENANCE.md`·`docs/**`·이 README.

**공유 파일 변경 요청:** `.cache/phase5-requests/<구역>-<짧은 이름>.md`에 **파일·바꿀 내용·이유·영향 범위**를 적고 보고서에도 한 줄 남겨요(통합이 반영해요).

- 새 용어: 넣을 파일 이름과 frontmatter를 그대로 적어요 — `content/glossary/영문-이름.md`: `title`·`english`(있으면)·`aliases`·`summary`(100자 안, 고1 눈높이 한 문장)·`related`·`group` + 본문 2~3문장.
- 차례표·성취기준 대응표·제외 쪽·출처 등록부는 바꿀 줄과 근거(원고 쪽·해설 문장·운영자 답)를 적어요.

```bash
npm ci                                                                                     # 처음 한 번
APC_VITE_CACHE_DIR=.cache/vite-4801 ASTRO_DEV_BACKGROUND=1 npm run dev -- --port 4801 --ignore-lock   # 내 포트(위 표)
npm run check:lessons -- 1-1-2 1-1-3                                                       # 내 차시만(개발 서버 기록에도 [차시 틀] 경고가 보여요)
PW_BASE_URL=http://localhost:4801/ai-physical-computing/ npx playwright test tests/e2e/lesson-template.spec.ts --project=desktop --output=<저장소 밖 폴더>
```

한 작업 폴더에 개발 서버를 여럿 띄울 때 부딪히는 것(`--ignore-lock`·`ASTRO_DEV_BACKGROUND=1`·`APC_VITE_CACHE_DIR`·끄는 법 — 포트로 PID를 찾아 `Stop-Process`)은 **5.1의 설명 그대로**예요. `npm test`는 모든 구역의 그림 목록·견본 차시를 함께 검사하므로(P5-01 노트), 넘기기 전에 `npm run images:check`와 `npx vitest run tests/unit/lesson/`을 먼저 돌려요.

---

## 6. 원본 예제 이관 도구 — `scripts/import-examples.mjs`(PD-33)

교과서·교안의 코드는 원본 zip에서 **줄 끝(CRLF → LF)만 바꿔** 옮기고, 원본과 줄 수·구문을 대조해 `scripts/examples-manifest.yaml`에 기록해요. 추출 사본(`extracted/flat`)은 줄 끝이 망가져 있어 쓰지 않아요.

```bash
npm run examples:import              # 목록의 모든 항목(운영자 PC: 원본 폴더가 저장소 뿌리에 있음)
npm run examples:import -- f026 f027 # 일부만
npm run examples:import -- --materials <원본 폴더>   # 다른 컴퓨터: 비공개 자료 저장소의 originals/
npm run examples:verify              # 원본 없이 기록과 대조(sha256·줄 수·LF·사이드카) — npm test에도 들어 있어요
```

- 새 항목은 `scripts/examples-manifest.yaml`의 `examples:`에 `id`(CODE_MAPPING 코드 id)·`source`(zip 이름)·`member`(zip 안 경로)·`target`(`examples/…py`)·`author`(`operator` | `third_party`)·`meta`(사이드카 씨앗 — ESP32 예제는 배선 `parts`와 스모크 기대 `smoke`도 씨앗에 적으면 사이드카로 옮겨요)를 적고 스크립트를 돌려요. 다른 저작자 파일은 `third-party/` 폴더 아래로만(PD-26). 원본 결함으로 구문 오류가 나는 파일(f074)은 `expect_syntax_error: true`.
- 구문 검사는 이 컴퓨터의 파이썬 3(`python`·`python3`·`py -3`)의 `ast.parse`로 하고, 없으면 Node의 가벼운 검사만 해요(기록에 `syntax_checker`로 남아요).
- 옮긴 파일은 고치지 않아요. 사이트판 수정이 필요하면 파일을 따로 두고(PD-10) 차시 md·사이드카에 적어요.

---

## 7. 가상 ESP32 보드 — 보드 모듈 `modules/board/`와 부품 레지스트리(P3-01)

ESP32 실습실(`/labs/esp32/`, LabShell `labId="esp32"`)의 가상 보드는 흉내 모듈 폴더 하나(`src/lab/modules/board/`, manifest `labs: ['esp32']`)예요. 실행 엔진은 영상처리 실습실과 같은 Pyodide 러너이고(PD-04, PLAN §8.3 P3-00 판정), OpenCV·numpy는 받지 않아요(워커는 실습실에 붙는 모듈 파일만 넣고, 준비 모듈의 [미리 받기]·캐시 채우기도 LabShell `pyodidePackages={[]}`라 파이썬 엔진만).

```
src/lab/modules/board/
├─ manifest.ts            id board, labs ['esp32'], shims { time: 'apc_board' }(실행 직전마다 install), 이름 6개(7.3)
├─ index.ts               화면 쪽: 배선 → 보드 그림(view.ts) → 입력·상태 메시지 잇기
├─ state.ts · parts.ts    순수 논리: 메시지 모양·스냅샷·출력 세기 / 부품 레지스트리·배선 검사(WiringIssue)·입력 값 계산
├─ layout.ts              순수 논리: 30핀 개발 보드 핀 머리 표·보드에 붙은 부품 자리·배선도 계획(부품 자리·선 꺾은점·브레드보드 레일)
├─ wiring-spec.ts         순수 논리: 차시 md·사이드카·머리말 # @part의 배선 글 → WiringEntry
├─ view.ts · board-drawing.ts · svg.ts   DOM: 보드·핀 머리 강조·브레드보드·선 그리기 / 부품 배치·핀 표·[그림 크게 보기], 입력 부품의 마우스·터치·키보드 공통 처리
├─ part-types.ts          부품 정의(PartDefinition)·배선 한 줄(WiringEntry)·배선 검사 결과(WiringIssue)의 모양
├─ machine.py · micropython.py   학생이 import하는 이름 그대로(파일 이름 = import 이름)
├─ apc_board.py           보드 핵심: 핀·가상 시계·Timer·콜백·import 훅·확장 불러오기
├─ apc_board_time.py      MicroPython판 time
└─ parts/<부품 id>/       부품 하나 = 폴더 하나(7.5): part.ts (+ apc_part_*.py·드라이버 .py)
```
화면 틀: `src/components/lab/BoardIo.astro`(io 슬롯 — `[data-board-io]`에 `data-lab-reveal-on-run`, 보드 그림 칸에 `data-lab-reveal-on-run-min`, [그림 크게 보기]·배선 목록·"그림 읽는 법"). 예제: `examples/esp32/*.py`(사이트 예제 4개 — 진동 알림 `04-touch-vibration-alert.py` 포함), 원본 이관 예제 `examples/esp32/u2/`(f046·f052·f053)·`examples/esp32/hw/`(f015)와 사이드카.

### 7.1 파이썬 API(가상 보드가 지금 흉내 내는 것)

MicroPython v1.29.0 ESP32 포트 소스(`ports/esp32/machine_pin.c`·`machine_pin.h`·`machine_timer.c`·`modtime.c`, `extmod/modtime.c`, `shared/timeutils/timeutils.c`, `py/modmicropython.c`·`objmodule.c`, 2026-09-17 확인)와 같은 이름·값·오류 문구예요.

| 이름 | 동작 |
|---|---|
| `machine.Pin(id, mode=None, pull=-1, *, value, drive, hold)` | id는 0~23·25~27·32~39(그 밖·bool·소수·글자는 `ValueError('invalid pin')`). 34~39에 출력 모드면 `ValueError('pin can only be input')`. 번호만 주면 설정을 바꾸지 않고, `Pin(2) is Pin(2)`. 상수 IN 1·OUT 3·OPEN_DRAIN 7·PULL_DOWN 1·PULL_UP 2·IRQ_RISING 1·IRQ_FALLING 2·WAKE_LOW 4·WAKE_HIGH 5·DRIVE_0~3. repr `Pin(2, mode=Pin.OUT)`(ESP-IDF 5.5 모양) |
| `pin.value([x])` · `pin([x])` · `on()` · `off()` · `toggle()` | 쓰기는 모드와 상관없이 출력 값을 적는다(출력이 꺼져 있으면 핀 전압은 그대로). **바깥을 보는 읽기**(출력 중이 아닌 핀)는 입력 확인 지점 |
| `pin.irq(handler=None, trigger=IRQ_FALLING\|IRQ_RISING, wake=None)` | 핀 전압이 바뀌면 콜백 대기열에 `handler(pin)`. handler None이면 끔. 돌려주는 IRQ 객체: `irq()`로 한 번 부르기, `trigger([값])`. wake(잠자기 깨우기)는 흉내 내지 않고 안내 |
| `machine.Timer(id=-1)` · `init(*, mode=PERIODIC, callback, period=ms, tick_hz=1000, freq, hard=False)` · `deinit()` · `value()` | 0~3은 하드웨어 타이머(같은 번호는 같은 객체), 음수는 가상 타이머, 4 이상은 `ValueError("Timer(4) doesn't exist, there are only 4 hardware timers")`. 위치 인자 → `TypeError('extra positional arguments given')`, hard → `ValueError`, 주기 0 → `ValueError('Timer period is too short for this timer')`. `Timer.PERIODIC` 1·`ONE_SHOT` 0. repr은 실물 소스의 뒤바뀐 조건까지 같음(`mode=ONE_SHOT`로 찍힘) |
| `machine.PWM(dest, freq=, duty=, duty_u16=, duty_ns=, invert=, lightsleep=)` · `init`·`deinit`·`freq([v])`·`duty([v])`·`duty_u16([v])`·`duty_ns([v])` | 범위·기본값(5000Hz·50%)·오류 문구는 실물 소스 그대로(`duty must be from 0 to 1023` 등). 주파수마다 해상도·나눗수로 되계산해 읽는다(`freq(1000)` → 998). LEDC 채널 16·타이머 8(넘치면 `RuntimeError('out of PWM channels:16')`), 34~39번은 `OSError (-258, 'ESP_ERR_INVALID_ARG')` + 한국어 안내, `deinit` 뒤 `RuntimeError('PWM is inactive')`. Pin으로 다시 정하면 신호가 끊긴다. 자세한 것은 `ext/pwm/apc_board_pwm.py` 머리말 |
| `machine.ADC(dest, *, atten)` · `init`·`read`·`read_u16`·`read_uv`·`atten`·`width`·`deinit` | 핀 32~39(ADC1)·0·2·4·12~15·25~27(ADC2), 기본 `ATTN_11DB`·`WIDTH_12BIT`, 그 밖은 `invalid pin`·`invalid attenuation`·`invalid bit-width`. 값은 화면이 핀에 건 전압(`{ mv }`)을 끝 전압(3300·1750·1250·950mV)으로 곧게 나눈 것이고, 읽을 때마다 입력 확인 지점이 돈다. `adc.block()`·ADCBlock은 흉내 내지 않는다 |
| `machine.SoftI2C(scl, sda, *, freq=400000, timeout=50000)` · `machine.I2C(id=0, *, scl, sda, …)` | `scan`·`writeto`·`readfrom`·`readfrom_into`·`writevto`·`readfrom_mem(_into)`·`writeto_mem`, SoftI2C만 `start`·`stop`·`readinto`·`write`. 대답 없는 주소는 `OSError: [Errno 19] ENODEV` + 콘솔에 까닭 한 줄. 하드웨어 I2C 0·1번은 기본 핀(SCL 18·SDA 19 / 25·26)이고 기본 동작은 `OSError('I2C operation not supported')`, `I2C(2)`는 ValueError. 두 핀은 오픈 드레인 + 부품 풀업(핀 표 "출력(오픈 드레인)" 1), 버스 함수마다 입력 확인 지점 1번 |
| `machine.RTC()` · `datetime([8칸])` · `init(8칸)` · `memory([bytes])` | `time.time()`·`localtime()`과 같은 시계(맞추면 time도 바뀐다). 맞출 때 요일 칸은 쓰이지 않고, `init`은 (년, 월, 일, 시, 분, 초, _, 마이크로초) 순서다. 칸 수가 틀리면 `ValueError('requested length 8 but object has length N')`, 사용자 메모리 2048바이트. 실행마다 보드를 새로 켜므로 맞춘 시각은 다음 [실행]에서 처음으로 |
| `machine.UART(id, baudrate=115200, bits=8, parity=None, stop=1, *, tx, rx, txbuf, rxbuf, timeout, …)` | 번호 0~2(그 밖 `ValueError('UART(3) does not exist')`), UART0은 REPL이라 버퍼·irq 불가. `read`·`readline`·`readinto`·`write`·`any`·`sendbreak`·`flush`·`irq`·`deinit`, repr의 나누개 속도(115200 → 115201), 받을 칸은 rxbuf+128까지 쌓이고 바이트 도착 시각까지 맞춘다. 속도·비트가 다르면 `reframe`이 비트 단위로 글자를 깨뜨린다. tx를 34~39번으로 정하면 `OSError: [Errno 1] EPERM: ESP_FAIL` |
| `machine.bitstream(pin, 0, timing, buf)` · `neopixel.NeoPixel(pin, n, bpp=3, timing=1)` | 네오픽셀 신호. 드라이버는 micropython-lib 0.1.0과 같은 동작(GRB 차례 `ORDER=(1,0,2,3)`, `write()`를 불러야 반영, 0~255 밖은 아래 8비트, 소수는 TypeError). 신호 시간(ns)은 흉내 내지 않는다 |
| `framebuf` · `ssd1306`(`SSD1306_I2C`) · `sh1106`(`SH1106_I2C`) · `i2c_lcd`(`I2cLcd`) | 화면 드라이버. `framebuf`는 `extmod/modframebuf.c`와 같은 계산(형식 7개·선·네모·타원·다각형·blit·scroll·8×8 글자 칸, 글꼴은 사이트가 그린 5×8 점 무늬), OLED 드라이버는 SSD1306 명령 바이트를 I2C로 보내고 가상 OLED가 해석한다(두 이름 한 흉내). `i2c_lcd`는 보드 라이브러리(사이트 배포본)이고 가상 LCD가 PCF8574 → HD44780 바이트를 해석한다 |
| 그 밖의 `machine` 이름(SPI·DAC·WDT·deepsleep·time_pulse_us …) | 쓰면 `ImportError('machine.PWM은(는) 가상 보드에 아직 없어요…')`(오류 사전 `board-not-emulated`). 부품 단계가 확장 파일로 더한다(7.6) |
| `time`(= `utime`) | `sleep(초)`(1000배 단정밀도 → 밀리초로 버림, 음수는 ValueError), `sleep_ms`·`sleep_us`(정수만, 음수·0 이하는 기다리지 않음), `ticks_ms`·`ticks_us`·`ticks_cpu`(가상 시각 `& (2**30-1)` — ticks_cpu는 실물의 CPU 사이클 대신 µs), `ticks_diff(a,b)`=`((a-b+2**29) & (2**30-1)) - 2**29`, `ticks_add`(±2**29 이상이면 `OverflowError('ticks interval overflow')`), `time()`·`time_ns()`(2000년 기준), `localtime`=`gmtime`(같은 함수, 8칸, 요일은 월요일=0), `mktime`(8·9칸, 넘친 값 넘김). CPython에만 있는 이름(perf_counter 등)은 없다 |
| `micropython` | `const(x)`=x, `schedule(f, arg)`(대기열 8개, 넘치면 `RuntimeError('schedule queue full')`), `opt_level`·`alloc_emergency_exception_buf`·`heap_lock`/`unlock`/`locked`·`kbd_intr`(하는 일 없음), `mem_info`·`qstr_info`·`stack_use`(안내만), `native`·`viper` 장식자. `umicropython`은 실물처럼 없음 |
| u-이름 | `utime`·`umachine`·`ustruct`·`usys`·`uerrno`·`ujson`·`urandom`·`uos`·`uarray`·`ucollections`·`ubinascii`·`uio`·`ure`·`uhashlib`·`uheapq`·`uselect`·`usocket`·`uplatform` → 원래 모듈(실물의 "확장 가능한 붙박이 모듈 + usys" 규칙) |
| `errno`(= `uerrno`) | MicroPython 목록 22개를 ESP32(newlib) 번호로: ENOENT 2·EIO 5·EAGAIN 11·ENOMEM 12·ENODEV 19·EINVAL 22·EOPNOTSUPP 95·ETIMEDOUT 116 …, `errorcode` 사전(Pyodide의 errno 번호와 다르다) |
| `bluetooth`·`ubluetooth` | 자리만: import하면 `ModuleNotFoundError("No module named 'bluetooth' (가상 보드의 블루투스는 아직 흉내 내지 않아요 …)")` — Phase 4가 `register_board_module`로 채운다 |
| 아직 없는 부품 모듈(병렬 제작 준비 2026-09-17) | `apc_board.NOT_YET_MODULES`의 `neopixel`(펌웨어 내장)·`i2c_lcd`·`ssd1306`·`sh1106`·`servo_library`·`gorillacell_dcmotors`(사이트 라이브러리)는 파일이 생기기 전까지 `ModuleNotFoundError("No module named 'neopixel' (가상 보드에 아직 없어요 — …)")`(오류 사전 `board-not-emulated`). 부품 구역이 같은 이름의 파일(부품 폴더의 `.py` 또는 `examples/esp32/lib/`)을 더하면 그 파일이 그대로 import되므로 표를 고치지 않는다. **P3-11 통합에서 여섯 이름 모두 파일이 생겼다**(표는 파일이 빠졌을 때의 안전망으로 남는다) |

**학생 코드만 MicroPython판을 받는다:** `apc_board.install()`이 `builtins.__import__`에 훅을 걸어, import하는 쪽이 학생 코드(`__main__`, 작업 폴더 `/home/pyodide/`, 보드 라이브러리 폴더 `/board/lib/`의 파일)일 때만 `time`·`utime`·`errno`·`bluetooth`·u-이름을 바꿔 준다. 표준 라이브러리·Pyodide가 import하는 `time`은 진짜 CPython time 그대로다(C 코드의 `PyImport_Import`는 `sys.modules`를 돌려주므로 영향 없음). `sys.modules['time']`을 바꾸지 않는다. `importlib.import_module('time')`은 진짜를 받는다(드문 경우 — 차이로 둠).

**보드 라이브러리 폴더 `/board/lib/`:** `sys.path` 끝에 있다(학생 작업 폴더의 같은 이름 파일이 먼저). `examples/esp32/lib/**/*.py`(사이트 제공 라이브러리 — `i2c_lcd.py`·`servo_library.py`·`gorillacell_dcmotors.py` …)를 보드 모듈 화면(`index.ts`)이 파이썬이 준비될 때마다 이 폴더에 써 넣고(`[data-board-io]`의 `data-board-libraries` = 넣은 수), 실행 시작마다 `importlib.invalidate_caches()`로 새 파일을 찾게 한다. 같은 파일을 실물 보드 [보드에 저장](P3-08)이 `librariesNeededBy(코드)`로 골라 함께 올린다(`src/lab/esp32/board-libraries.ts`).

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
- **배선과 코드 맞춰 보기**(P3-02, 콘솔 `[알림]`, 핀마다 실행에 한 번 — 화면이 `board.wiring`을 넣은 실행에서만): 값을 보내는 부품(터치 센서·버튼)이 이어진 핀을 `Pin.OUT`으로 정함, 보드가 움직이는 부품(LED·진동 모터)이 이어진 핀을 `Pin.IN`으로 정함, 그 핀을 출력으로 정하지 않고 `on()`·`value(1)`, 배선에 부품이 없는 핀을 출력으로 정함, 떠 있는 핀을 읽을 때 배선도에도 부품이 없음. 실물처럼 오류는 내지 않는다(실물도 코드는 돈다). 가상 보드가 아직 모르는 부품의 핀(`known: false`)은 알리지 않는다.

### 7.3 메시지 형식(워커 ↔ 화면, 이름은 모두 `board.`)

모양의 기준은 `state.ts` 머리말과 `apc_board.py`예요. PLAN §7 브릿지(UART·BLE·MQTT로 오가는 글자 한 줄)와 겹치지 않는 "핀 전압" 통로이고, 브릿지는 Phase 4가 `board.uart.*`·`board.ble.*`처럼 따로 더해요.

| 이름 | 방향·종류 | 값 |
|---|---|---|
| `board.state` | 파이썬 → 화면, 이벤트 | `{ v: 1, reason: 'reset'\|'change'\|'idle'\|'end', phase: 'run'\|'idle'\|'end', seq, t_us, pins: [{ id, mode: 'in'\|'out'\|'open_drain'\|'off'\|'out_only'\|'pwm'\|'other'\|null, pull: 'up'\|'down'\|'both'\|null, out: 0\|1, level: 0\|1, driven, irq, duty?: 0~1, freq?: Hz }], timers }` — `mode: 'pwm'`·`duty`·`freq`는 그 핀에 PWM이 켜져 있을 때만(`BOARD.set_pwm` — 7.10, `state.ts outputStrength`로 LED 밝기·진동 모터 세기가 따라온다). 늘 **핀 전체 목록**(이번 실행에서 코드가 만진 핀). 보내는 때: 실행 시작(reset), 파이썬이 실제로 기다리기 직전(대기 전 훅), 마지막으로 보낸 뒤 16ms가 지난 쓰기, 코드가 끝난 뒤 대기 시작(idle), 실행 끝(end). 16ms 안의 변화는 합쳐진다(PLAN §7.2 규칙 5 "상태는 최신 값만") |
| `board.inputs` | 화면 → 파이썬, 최신 값(`setValue`) | `{ pins: { '0': 'pullup', '17': 1 } }` — 입력 부품이 지금 핀을 누르는 값 전체. 실행 시작 때(초기화 훅이 `peek`) 읽는다. [실행] 직전에 다시 넣는다(정지 2단계 대비) |
| `board.input` | 화면 → 파이썬, 쌓이는 값(`pushEvent`) | `{ pin: 0, drive: 0\|1\|'pullup'\|'pulldown'\|{ mv: 0~3300 }\|null }` — 실행 중에 바뀐 핀 하나. 눌렀다 뗀 것도 빠짐없이 순서대로(§7.2 규칙 5 "이벤트는 대기열"). `{ mv }`는 아날로그 전압(`state.ts analogDrive(mv)` — 가변저항·4채널 터치, 디지털로 읽으면 1.65V 문턱). `board.inputs`의 값도 같은 모양 |
| `board.wiring` | 화면 → 파이썬, 최신 값 | `{ parts: [{ part: 'touch-digital', id: 'touch-digital', label: '터치 센서', pins: { sig: 17 }, directions: { sig: 'in' }, known: true }, { part: 'lcd-i2c', id: 'lcd', label: '문자 LCD(16×2)', pins: { sda: 21, scl: 22 }, known: false }] }` — 이 예제의 배선(보드에 붙은 부품 포함, `parts.ts wiringValue`). 가상 보드가 아직 모르는 부품은 `known: false`와 적힌 핀만. 부품 흉내·파이썬 배선 안내(7.2)가 읽는다 |
| `board.device` | 파이썬 → 화면, 이벤트 | `{ v: 1, id: 배선 id, part: 부품 id, state }` — 부품 흉내의 상태(`apc_board.set_device_state(id, part, state)`, 16ms마다 핀 상태 다음에 바뀐 부품만·최신 값만). 화면은 `state.ts parseDeviceEvent`·`applyDeviceEvent`로 모으고 부품 `visual`·`render`·`controls`에 `device: { seq, state }`로 넘긴다. 실행 시작(reset)에 비워진다(`data-board-devices`·`data-board-device-last`) |
| `board.notice` | 파이썬 → 화면, 이벤트 | `{ v: 1, code, level: 'warning', text, gpio? }` — 코드가 배선과 어긋나게 핀을 쓸 때 `apc_board.warn_once`가 콘솔 안내와 **함께** 보낸다(2026-09-18 검토 반영). 화면(`modules/board/index.ts`)이 같은 글을 보드 그림 아래 "배선 확인" 칸(`[data-board-problems]`)에 넣는다 — 콘솔은 결과 칸보다 688px 아래여서 정작 필요한 학생이 못 봤다. 실행을 새로 시작하거나 배선을 다시 그리면 비운다(`data-board-run-issues`) |
| `board.device.input` | 화면 → 파이썬, 쌓이는 값(`pushEvent`) | `{ id: 배선 id, data }` — 부품 조작 칸(송신 패널 등)이 부품 흉내에 보내는 값(`PartControlApi.sendToDevice(data)`). 파이썬은 `apc_board.on_device_input(id, handler)`로 입력 확인 지점에서 받는다(실행 전에 보낸 값은 버림 — 실물 UART와 같음) |

`drive` 뜻: `0`·`1` = 부품이 핀을 세게 누름(버튼이 GND에 닿음, 센서 모듈 출력), `'pullup'`·`'pulldown'` = 약하게 끌어당김(보드의 BOOT 버튼 풀업), `null` = 연결 없음. 핀 전압은 세게 누름 > 출력 > 약한 끌어당김 > 내부 풀업·풀다운 > 떠 있음(0) 순서로 정한다.
화면 쪽 테스트 표시: `[data-board-io]`의 `data-board-ready`·`data-board-phase`·`data-board-seq`·`data-board-reason`, 부품 `[data-board-part="<배선 id>"]`의 `data-part`·`data-visual-<이름>`·`aria-pressed`, 핀 표 `[data-board-pin="<GPIO>"]`의 `data-mode`·`data-level`·`data-driven`.

### 7.4 배선(PD-05 예제별 배선)과 배선도(P3-02)

- 보드에 붙은 부품(`onboard: true` — `builtin-led` GPIO2·`boot-button` GPIO0)은 배선에 적지 않아도 늘 있고 핀이 고정된다.
- **배선을 적는 곳 세 가지**(한 예제에 여럿이면 앞의 것만 — `esp32/examples.ts`, 모양 맞추기는 `wiring-spec.ts`):
  1. 차시 md frontmatter `examples: [{ file: esp32/u2/2-1-2-adv-touch-check.py, parts: [{ type: touch_digital, pin: 17 }] }]` — PLAN §2.6의 `type`·밑줄 이름도 받는다(`touch_digital` → `touch-digital`, 스키마는 `src/config/content-schemas.ts`의 `partSchema`). 실습실 페이지가 `wiringByFile`로 넘긴다.
  2. 사이드카 `parts: [{ part: touch-digital, pin: 17 }]`(원본에서 옮긴 예제 — 이관 목록의 `meta.parts`로 처음 만든다).
  3. 예제 파일 머리말 `# @part touch-digital 17` · `# @part rgb-led r=27 g=32 b=33 as rgb`(사이트가 만든 예제 — 새 예제 = .py 하나).
- **한 줄의 칸**: `part`(또는 `type`) 부품 id — 필수 / `id` 배선 안 이름(없으면 부품 id, 겹치면 `-2`·`-3`) / `pin` 핀이 하나뿐인 부품의 GPIO(`17`·`"GPIO17"`도 받음) / `pins` 역할 → GPIO / `label` 화면 이름(가상 보드가 아직 모르는 부품의 안내 문장에 쓴다). 틀린 줄은 빼고 빌드 경고만(PD-35).
- **배선 검사**(`parts.ts resolveWiring` → `WiringIssue { level, code, text, gpio? }`, 그림 아래 목록에 "오류:·주의:·참고:" 글과 함께 오류 → 주의 → 참고 순서로 보인다 — 색만으로 알리지 않음):

| code | 수준 | 언제 |
|---|---|---|
| `unknown-part` | 주의 | 가상 보드에 아직 없는 부품(그림 없음, 파이썬에는 `known: false`로 핀만) |
| `bad-id` | 오류 | 배선 이름이 규칙에 안 맞거나 겹침 |
| `pin-shorthand` | 오류 | 핀이 여러 개인 부품을 `pin` 하나로 적음 |
| `unknown-role` | 주의 | 부품에 없는 역할을 `pins`에 적음 |
| `missing-pin` · `invalid-gpio` | 오류 | 핀 번호가 없거나 ESP32에 없는 번호 |
| `onboard-fixed` | 참고 | 보드에 붙은 부품의 핀을 다른 번호로 적음(고정 핀을 씀) |
| `input-only-output` | 오류 | 34~39번(입력 전용)에 출력 부품 |
| `not-on-header` | 주의(6~11번은 오류) | 30핀 보드의 핀 머리가 없는 GPIO(0·6~11·20·37·38) — 선을 긋지 못함 |
| `shared-input` | 오류 | 한 핀에 입력 부품 둘 |
| `input-output-same-pin` | 오류 | 한 핀에 입력 부품과 출력 부품 |
| `shared-output` | 참고 | 한 핀에 출력 부품 여럿(같은 신호를 함께 받음 — f110의 GPIO2 버저 + 내장 LED) |
| `strapping` | 주의 | 스트래핑 핀(0·2·5·12·15 — Espressif GPIO 문서)에 **바깥** 부품 |
| `site-assigned` | 참고 | 부품의 `defaultPinsNotice`(사이트가 정한 기본 핀을 그대로 씀 — 진동 모터 GPIO19) |

- **파이썬 쪽 배선 안내**(코드가 배선과 어긋나게 핀을 씀)는 7.2절 끝.
- **배선도 그리기**(`layout.ts planBoardDrawing` → `board-drawing.ts`): 보드는 교과서 키트와 같은 30핀 개발 보드(원고 118쪽 사진의 핀 순서 — 위 줄 5V·GND·13·12·14·27·26·25·33·32·35·34·39(VN)·36(VP)·EN, 아래 줄 3V3·GND·15·2·4·16·17·5·18·19·21·RX·TX·22·23)를 사이트가 그린 것이고, 스트래핑 핀에 ▲ 표시(GPIO0은 BOOT 버튼 그림에). 바깥 부품이 있으면 보드 아래 **브레드보드**에 한 줄로 놓고, 핀 머리에서 부품 윗변 신호 자리까지 꺾은선(아래 줄 핀은 보드 밑으로, 위 줄 핀은 보드 위와 오른쪽을 돌아), 보드 3V3·GND에서 레일로, 부품 아랫변 전원 다리에서 레일로 선을 긋는다(닿는 점에 동그라미). 세로선은 칸을 나눠 겹쳐 그려지지 않고(핀 머리 x ≡ 6, 부품 신호 자리 x ≡ 15 — 18로 나눈 나머지), 흔한 배선은 엇갈리지 않게 줄 순서를 정한다(`board-layout.test.ts`). 핀 머리는 코드가 쓰면 흰 고리(`data-used`), 1(HIGH)이면 노란 빛(`data-high`), 마우스를 올리면 설명(같은 내용이 핀 표에 글자로).
- **이 예제 실습 방법**: `LabExample.practice`(사이드카 `practice` → 머리말 "── 실습 방법 ──" 상자)가 있으면 보드 그림 위 `[data-board-practice]`에 단계 목록으로 보인다 — 가상 부품을 어떻게 누르고 무엇을 보면 되는지 예제마다 적는다(사이트 예제 4개·옮긴 예제 4개 모두 3단계).
- **편집칸에서 고친 코드의 배선**(2026-09-18 검토 반영): 배선은 예제 단위(PD-05)이지만, **학생이 예제 코드를 고쳤거나 빈 칸에서 직접 쓴 코드**에서는 편집칸 머리말의 `# @part` 줄을 다시 읽어 배선도를 그린다(`modules/board/index.ts` `wiringFromEditorCode` — 머리말이 바뀔 때만 다시 그린다). 예제를 **그대로** 불러온 상태에서는 예제 배선(차시 md → 사이드카 → 머리말 순서로 이미 정해진 것)을 그대로 써서 "사이드카가 머리말보다 앞선다"는 규약이 깨지지 않는다. 블록 모드는 그보다 앞서는 `data-board-wiring-override`로 알린다(7.11).
- **[그림 크게 보기] ↔ [원래 크기로]**: 그림을 48rem으로 펴 가로로 밀어 본다(휴대폰 375px에서 핀 번호가 약 15px). 고른 값은 `module:board:zoom`에 기억한다([이 컴퓨터에서 내 기록 지우기] 대상). 기본 화면에서도 그림을 **32rem(512px) 아래로 줄이지 않는다** — 375px 휴대폰에서 칸에 맞추면 배율이 0.77이 되어 핀 번호가 6.6px로 읽히지 않았다(2026-09-18 실측). 넘치면 칸 오른쪽 그늘(`[data-board-stage-wrap]`의 `data-board-overflow`)과 "옆으로 밀어 보세요" 한 줄(`[data-board-scroll-hint]`)로 알린다.

### 7.5 부품 하나 = 폴더 하나 — `modules/board/parts/<부품 id>/`

```
parts/builtin-led/part.ts     출력 부품 본보기(핀 상태 → 모습·밝기) — 보드에 붙음
parts/boot-button/part.ts     입력 부품 본보기(누름 → 핀 누르는 값) — 보드에 붙음
parts/touch-digital/part.ts   바깥 입력 부품(누르는 동안 1, 기본 GPIO17 — PD-34)
parts/vibration-motor/part.ts 바깥 출력 부품(떨림·세기·움직임 줄이기, 기본 GPIO19 사이트 배정 — PD-36)
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
| `size` | 그림 크기(SVG 단위). 보드에 붙은 부품의 자리는 `layout.ts`의 `ONBOARD_ANCHORS`(기판 왼쪽 칸), 바깥 부품은 배선도 계획이 브레드보드에 놓는다(7.4) |
| `anchors?` | (바깥 부품) 신호선이 닿는 자리 role → `{ x, y }`(부품 그림 기준). x는 **18의 배수 + 9**(검사함). 없으면 윗변에 pins 순서대로 9·27·45… |
| `power?` | (바깥 부품) 전원 다리 자리 `{ gnd: { x, y }, vcc: { x, y } }` 또는 `false`(전원선 없음). 없으면 아랫변 가운데 양옆 |
| `defaultPinsNotice?` | 기본 핀(`defaultPins`)을 그대로 이었을 때 배선 목록에 보일 안내 한 문장(수준 참고, code `site-assigned`) |
| `interaction?` | 입력 부품: `{ kind: 'momentary'\|'toggle', label, drive(active, role) → PinDrive }`. **마우스·터치·키보드는 `view.ts`가 공통으로 처리**한다 — momentary는 누르고 있는 동안(Space·Enter를 누르고 있는 동안, 초점을 잃으면 뗌), toggle은 누를 때마다. 부품은 `role="button"`·`tabindex=0`·`aria-pressed`를 받고, 누르는 자리(그림 전체 투명 사각형)와 두 겹 초점 테두리(짙은 선 + 노란 선 — 기판·브레드보드 어디서나 보임)도 `view.ts`가 붙인다(P3-02 — 부품 그림에서 그리지 않는다) |
| `visual(context)` | **순수 함수**: `{ snapshot, instance, active, reducedMotion, device? }` → `{ lit: true, brightness: 100 }`처럼 모습 값(`device`는 이 배선 id의 마지막 `board.device` 상태 `{ seq, state }` — 큰 값(OLED 화면 비트)은 visual에 `frame: device.seq`만 넣고 render가 읽는다). `state.ts`의 `outputStrength(snapshot, gpio)`(0~1 — HIGH 출력 1, PWM이면 duty)나 `isDrivenHigh`를 쓰면 [정지] 뒤 꺼짐까지 맞는다. 보드 화면이 `data-visual-<이름>` 속성으로 적고, `lit`·`brightness`·`on`·`strength`·`pressed`는 화면 낭독기 이름에도 넣는다 |
| `render(target, { svg, instance, definition })` | `target`(`<g>`) 안에 사이트가 직접 그린 SVG(브랜드 중립, 다른 저작물 그림 금지)를 한 번 그리고, 모습 값이 바뀔 때 부를 함수 `(visual, extra) => void`를 돌려준다(`extra = { snapshot, device?, reducedMotion }`). 색만으로 알리지 않게 글자(켜짐·누름·진동 중)도 함께, 핀 번호 글(`IO17` — `instance.pins`)도. 움직이는 그림은 Web Animations(`element.animate`)로 켜고 끄며 `reducedMotion`이면 움직이지 않는다(진동 모터 본보기) |
| `python?` | 파이썬 부품 흉내 모듈 이름(`apc_part_<이름>`, 같은 폴더에 있어야 함 — `board-parts.test.ts`가 확인) |
| `sound?` | (병렬 제작 준비 2026-09-17) 소리를 내는 부품(버저·MP3)이면 `true` — 배선에 있으면 보드 그림 위에 [소리 켜짐/꺼짐] 단추가 보인다(`[data-board-sound]`, 상태는 `[data-board-io]`의 `data-board-sound-state`). 소리는 `board-audio.ts`의 `getBoardAudio()` — `context()`(AudioContext, 처음 부를 때 만듦)·`destination()`(주 음량 노드 — 여기에 잇는다)·`enabled`·`onChange`. [실행]을 누를 때 보드 모듈이 `resume()`한다(브라우저 자동 재생 규칙) |
| `controls?(host, api)` | (병렬 제작 준비 2026-09-17) 보드 그림 아래 "부품 조작" 칸(`[data-board-controls]`)에 이 부품의 HTML 조작 요소(단추·`input type=range`·label)를 그린다 — SVG 한 번 누르기(`interaction`)로 모자란 조작(4채널 터치 패드·값 막대, UART 송신 패널). `api.setDrive(role, drive)`(입력 핀을 누르는 값 — 0·1·`'pullup'`·`analogDrive(mv)`·null), `api.sendToDevice(data)`(`board.device.input`), `api.storageName(name)`(`module:board:<부품>:<이름>`). 돌려준 `{ update?(visual, extra), destroy?() }`를 모습이 바뀔 때·배선이 바뀔 때 부른다. 키보드로 닿고 이름이 있는 요소만, 색만으로 알리지 않는다 |

- **자동 발견:** `parts.ts`가 `import.meta.glob('./parts/*/part.ts', { eager: true })`로 찾고 `validatePartDefinitions`로 검사한다(어기면 `board-parts.test.ts`가 실패하고, 브라우저에서는 보드 모듈이 오류를 내며 뜨지 않는다). `.py`는 `python/modules.ts`가 모듈 폴더의 하위 폴더까지 찾아 ESP32 실습실 워커의 `/apc`에 넣는다.
- **파이썬 부품 흉내:** `apc_part_<이름>.py`는 `apc_board.register_part('<부품 id>', factory)`로 자기를 등록한다(`factory(배선 항목) → 장치`). 보드는 `/apc`의 `apc_board_*.py`·`apc_part_*.py`를 첫 실행 직전(`install()`) 한 번 불러온다. 상태를 화면에 알릴 때는 `apc_runtime.emit('board.device', { part, id, state })`, 실물과 같은 OSError는 `apc_board.board_oserror(19)`(`OSError: [Errno 19] ENODEV`). 핀은 `apc_board.find_pin(값)`·`BOARD.read(gpio)`·`BOARD.write(gpio, v)`·`BOARD.configure(…)`로 다룬다.
- **단위 테스트(P3-02 규칙 — 부품 하나 = 테스트 파일 하나):** `tests/unit/lab/board-part-<부품 id>.test.ts`를 새로 만들어 그 부품의 `visual`·`interaction.drive`·기본 핀·배선 줄임 표기를 검사한다(DOM 없이, 스냅샷 도우미 `tests/unit/lab/helpers/board-snapshot.ts`). 여러 사람이 부품을 동시에 더해도 같은 파일을 고치지 않게 — `board-parts.test.ts`는 레지스트리·배선 검사만 보고, 부품 폴더마다 이 파일이 있는지 확인한다. 파이썬 흉내가 있으면 `tests/unit/lab/helpers/pyodide-board-run.mjs`에 단계를 더하고 `pyodide-board.test.ts`에서 확인한다. 화면은 `tests/e2e/lab-esp32-parts.spec.ts`처럼 `data-visual-*`를 읽는다.
- **부품 id(P3-11 통합에서 확정 — 사이드카·차시 md가 이 이름으로 배선을 적는다):** `touch-digital`(sig)·`vibration-motor`(sig)·`rgb-led`(r·g·b)·`laser`(sig)·`buzzer`(sig)·`servo`(sig)·`fan-motor`(ina·inb)·`touch-analog-4ch`(sig)·`lcd-i2c`(sda·scl)·`oled-i2c`(sda·scl)·`neopixel`(din)·`uart`(rx·tx)·`mp3`(rx·tx — 모듈 쪽 이름)·`ble`(led — Phase 4 P4-03, 보드 안 블루투스 무선과 `ESP32BLE.py`의 상태 LED). 병렬 제작 준비 때 적었던 `neopixel-ring`·`mp3-player`는 쓰지 않는다(구역 C가 짧은 이름으로 만들었고, 그 이름을 쓴 사이드카·차시는 없었다).

**지금 있는 부품(Phase 4 통합 기준 16개 — P3-11의 15개 + `ble`):** 보드에 붙은 `builtin-led`(IO2, 밝기는 PWM duty)·`boot-button`(IO0, 누르면 0),
`touch-digital`(sig, 기본 17 — 누르는 동안 1)·`vibration-motor`(sig, 기본 19 — 사이트 배정, 실물 확인 전),
`rgb-led`(r·g·b, 기본 핀 없음 — 1이면 켜짐)·`laser`(sig)·`buzzer`(sig, `sound: true`)·`servo`(sig, 프로필 mg90s·servo40)·
`fan-motor`(ina·inb, 기본 25·26)·`touch-analog-4ch`(sig, 기본 32 — 조작 칸의 [패드 1~4]),
`lcd-i2c`(sda·scl, 기본 21·22, 주소 0x20 — 글자 칸을 DOM `<tspan data-lcd-cell>`으로)·`oled-i2c`(sda·scl, 주소 0x3C — 켜진 점은 `<path data-oled-pixels>` 하나),
`neopixel`(din, 기본 23 — 16구 링)·`uart`(rx·tx, 기본 17·16 — USB-UART 변환기와 컴퓨터 시리얼 창, 전원은 `power: { gnd, vcc: false }`로 GND만)·
`mp3`(rx·tx, 기본 17·16 — DFPlayer, `sound: true`),
`ble`(led, 기본 12 — 보드 안 블루투스와 `ESP32BLE.py`의 연결 상태 LED. 선은 필요 없지만 상태 LED 핀이 스트래핑 핀이라 배선 검사가 "주의"를 낸다 — 자료의 실제 사정이라 그대로 둔다.
조작 칸이 상대 기기(스마트폰·컴퓨터) 노릇: [연결]·[연결 끊기]·글자 보내기·a·b·c·좌표·가상 스마트폰 앱 단추·주고받은 기록. 다른 모듈은 창 이벤트 `apc:ble-write`(detail `{bytes}`)로 값을 넣고 `apc:ble-notify`로 보드 알림을 받는다 — 상수 `parts/ble/part.ts`의 `BLE_WRITE_EVENT`·`BLE_NOTIFY_EVENT`).

부품이 스스로 만든 상태 글은 `visual.summary`에 담는다 — 화면 낭독기 이름의 상태 자리에 그대로 쓰이므로(서보 각도·버저 Hz·팬 방향처럼
`lit`·`on`·`pressed`로 말할 수 없는 것) 부품이 DOM 속성을 직접 건드리지 않아도 된다. 보드 그림 글자·부품 글자 크기는 공용 CSS
`src/styles/board-drawing.css`에 있다(스크립트가 그린 SVG라 컴포넌트 범위 스타일이 닿지 않는다 — 실습실과 실물 점검 도우미가 함께 쓴다).

### 7.6 machine에 주변장치 더하기 — `apc_board_*.py` 확장

PWM·ADC·SoftI2C·UART·RTC·time_pulse_us처럼 부품이 아닌 **machine의 이름**은 `modules/board/ext/<기능>/apc_board_<기능>.py`(병렬 제작 준비 2026-09-17 — 구역마다 새 폴더, 파일은 워커의 `/apc`로 평평하게 들어가므로 이름은 저장소 전체에서 하나)를 두고 `apc_board.register_machine_export('PWM', PWM)`로 등록한다. `machine.py`는 import할 때 확장을 불러와 그 이름을 내보내고(`from machine import PWM`), 여러 사람이 동시에 `machine.py`를 고치지 않아도 된다. 규칙: 확장은 `machine`을 import하지 않는다(순환), `apc_board`·`apc_runtime`과 표준 라이브러리만. 등록하면 `machine.py`의 "아직 없는 이름" 안내(`_NOT_YET`)는 자동으로 가려진다. `time`·`bluetooth` 같은 **모듈 통째**는 `apc_board.register_board_module('bluetooth', 모듈)`(학생 코드의 import에만 적용).

### 7.7 테스트 방법

| 층 | 어떻게 |
|---|---|
| 파이썬(실제 Pyodide) | `tests/unit/lab/pyodide-board.test.ts` + `helpers/pyodide-board-run.mjs` — ESP32 실습실 워커와 같은 파일·순서(beginRun → install_available → reset_for_run → bind → 코드 → run_idle). 입력은 `inputs`(실행 전)·`during`(시각)·`onMark`(파이썬이 `emit('board.device', {'mark': …})`한 뒤 — 부하에 흔들리지 않게)·`wiring`(배선), `stopAfterMs`·`idle`. 동기 진입점 검사 포함. `--limited`로 제한 모드. **부품·기능마다 단계 파일을 따로(병렬 제작 준비 2026-09-17):** `tests/unit/lab/helpers/board-steps/<이름>.mjs`(기본 내보내기 `async ({ step, bridge, pyodide, out }) => { await step('이름', 코드, 옵션) }`) + `tests/unit/lab/pyodide-board-<이름>.test.ts`에서 `runBoardSteps('tests/unit/lab/helpers/board-steps/<이름>.mjs')`·`stepOf(out, '이름')`(`helpers/pyodide-board.ts`). 본보기 `extension-points.mjs`·`async-wait.mjs`(`{ limited: true }`) |
| 순수 논리 | `board-state.test.ts`(메시지 읽기·스냅샷·입력 값·출력 세기), `board-parts.test.ts`(부품 정의 검사·배선 검사), `board-part-<부품 id>.test.ts`(부품마다), `board-layout.test.ts`(핀 머리 표·배선도 계획 — 선 겹침·엇갈림), `board-wiring-spec.test.ts`(배선 글 세 모양), `python-modules.test.ts`(실습실별 파일·shims), `esp32-examples.test.ts`(예제 목록·배선 우선순위·이관 예제 사이드카) |
| 브라우저 | `tests/e2e/lab-esp32.spec.ts`(LED 상태 메시지, BOOT 버튼 마우스·키보드, Timer 대기, OpenCV 안 받음, dev 실습실에 machine 없음), `tests/e2e/lab-esp32-parts.spec.ts`(P3-02: f046·f015·f052·f053·진동 알림 예제, 터치 센서 마우스·키보드·터치 화면, 진동 모터·움직임 줄이기, 배선 오류 화면·파이썬, [그림 크게 보기] — 배선을 일부러 틀리게 볼 때는 `page.route`로 실습실 HTML의 예제 목록 JSON만 바꾼다). 예제 스모크(`examples-smoke.spec.ts`)는 실습실별로 돌아 `examples/esp32/` 이관 예제를 ESP32 실습실에서 실행한다 |
| 개발 서버로 | `ASTRO_DEV_BACKGROUND=1 npm run dev -- --port 44xx --ignore-lock` 뒤 `PW_BASE_URL=http://localhost:44xx/ai-physical-computing/ npx playwright test tests/e2e/lab-esp32.spec.ts --project=desktop --output=<저장소 밖 폴더>`(5절) |

### 7.8 금지·주의

- 부품 그림은 사이트가 직접 그린 브랜드 중립 SVG만(업체 로고·Fritzing 등 SA 그림 금지). 보드·부품 사진을 쓰려면 `scripts/image-allowlist.yaml` 눈 확인 절차. 보드 그림은 키트와 같은 핀 순서를 따르되 업체 이름·실크 문구는 넣지 않는다.
- 부품 그림 글자는 SVG 단위 8px 이상(데스크톱 실습실 폭에서 약 11px, 휴대폰은 [그림 크게 보기]로 약 15px)으로 쓰고, 그림 안 글자 색은 짙은 기판·모듈 위 흰색 계열로 대비를 지킨다.
- 가상 보드가 실물보다 너그러우면 안 된다: 범위 밖 값에는 실물과 같은 예외를 내고(문구는 MicroPython 그대로), 한국어 풀이는 오류 사전 `board` 묶음(`content/help/errors/errors.yaml`)에 더한다. 흉내 낼 수 없는 차이는 콘솔 안내·교사용 접기로.
- 보드 초기화·틱·대기 전·마무리 훅에서는 양보하지 않는다(`peek`·`drain`·`emit`·`notice`만). 콜백은 입력 확인 지점에서만 부른다.
- CPython `time`·`sys.modules`를 바꾸지 않는다(import 훅만). Pyodide의 `errno` 번호를 보드 오류에 쓰지 않는다(`board_oserror`).
- 부품·확장의 메시지는 `board.state`·`board.input`·`board.inputs`·`board.wiring`·`board.device`·`board.device.input` 여섯 이름으로 한다 — 새 이름이 꼭 필요하면 `manifest.ts`에 먼저 적는다(공유 파일 — 요청).

### 7.9 부품 제작 체크리스트(구역 A·B·C — 병렬 제작 준비 2026-09-17)

부품 하나를 "끝났다"고 보고하기 전에 모두 확인해요. 브라우저에서 확인하지 않은 것은 "완료"라고 적지 않고, 실물 보드가 있어야 알 수 있는 것은 "확인 필요"(부록 B-2·운영자 할 일 2번)로 적어요.

**1. 폴더와 이름**

- [ ] `src/lab/modules/board/parts/<부품 id>/part.ts` — id는 폴더 이름과 같은 영문 소문자·숫자·하이픈. 7.5의 확정 id(`rgb-led` r·g·b, `laser` sig, `buzzer` sig, `servo` sig, `fan-motor` ina·inb, `touch-analog-4ch` sig, `lcd-i2c` sda·scl, `oled-i2c` sda·scl, `neopixel` din, `uart` rx·tx, `mp3` rx·tx)를 쓰면 사이드카·차시 md의 배선이 저절로 그려져요. 바꾸면 보고서에 적어요.
- [ ] 파이썬 파일 이름은 저장소 전체에서 하나(워커 `/apc`에 폴더 없이 들어가요): 부품 흉내 `apc_part_<이름>.py`, 학생이 import하는 이름 그대로인 드라이버(`neopixel.py`·`ssd1306.py`·`sh1106.py`)는 부품 폴더에, machine 확장은 `ext/<기능>/apc_board_<기능>.py`(7.6). 같은 이름을 흉내(`/apc`)와 보드 라이브러리(`examples/esp32/lib/`)에 함께 두지 않아요(`board-libraries.test.ts`가 막아요).
- [ ] 보드 라이브러리(`examples/esp32/lib/*.py`)는 실물 보드에도 그대로 올라가요 — MicroPython에서 도는 코드만. 다른 저작자 파일은 `third-party/` 아래 + 원래 저작권 주석 유지. 등록부 항목이 이미 있는 것: `third-party/i2c_lcd.py`(B)·`third-party/gorillacell_dcmotors.py`(C), 운영자 원고 복원 `servo_library.py`(A — `examples/**` 항목이 덮음). 그 밖의 새 제3자 파일(예: 실물용 `ssd1306.py` 드라이버)은 받을 곳·라이선스를 적어 요청해요.

**2. 배선 데이터**

- [ ] `pins`(role·label·direction), 바깥 부품이면 `anchors`(x = 18의 배수 + 9)·`power`. 원고에 핀이 없어 사이트가 정한 핀이면 `defaultPins` + `defaultPinsNotice`("실물 확인 전")와 보고서의 미해결 항목.
- [ ] 주인인 예제(5.1 표)의 사이드카 `parts:`를 원고 코드의 핀 그대로(PD-05) 적고 `resolveWiring`에 오류가 없게. 원고 그대로인 스트래핑 핀 주의(f058 GPIO12·5)는 남기고 교사용 안내를 요청해요.
- [ ] 사이드카 `practice:` 3단계(가상 부품을 어떻게 누르고 무엇을 보는지), description의 "…아직 준비 중이라 지금은 실행하면 멈춰요." 문장 지우기, `smoke:`를 실제 결과로(원본 결함 예제 f062 TypeError·f074 SyntaxError는 그대로).

**3. 실물과 같은 동작**

- [ ] 이름·기본값·범위·오류 문구는 MicroPython v1.29.0 ESP32 포트 소스로 확인하고 파일 이름을 머리말·보고서에 적어요. 범위 밖 값은 실물과 같은 예외(duty 범위 밖 `ValueError`, I2C 주소 없음 `apc_board.board_oserror(19)` → `OSError: [Errno 19] ENODEV`) — 가상이 실물보다 너그러우면 안 돼요. 흉내 낼 수 없는 차이는 콘솔 안내(`BOARD.warn_once`, 실행마다 한 번).
- [ ] 입력 확인 지점 규칙(7.2): 훅에서 양보하지 않기, 콜백은 입력 확인 지점에서만. 많은 호출(OLED `pixel` 729번)은 파이썬 안에서 모았다가 `show()` 때 `set_device_state` 한 번.
- [ ] 소리(버저·MP3): `sound: true` + `getBoardAudio().destination()`에 잇기, [소리 꺼짐]이면 들리지 않게, [정지]·다시 실행 때 소리가 남지 않게. 음원 파일은 두지 않아요(PD-16 합성음).

**4. 화면·접근성·키보드**

- [ ] 그림은 사이트가 직접 그린 브랜드 중립 SVG(7.8). 모습은 `data-visual-<이름>`, 색만으로 알리지 않고 글자도(켜짐·밝기 40%·90°), 핀 번호 글 `IO<번호>`.
- [ ] 누르는 부품은 `interaction`(마우스·터치·키보드는 `view.ts`가 붙임), 그 밖의 조작은 `controls`(label 있는 `button`·`input type=range` — Tab으로 닿고 값은 글자로도). 움직이는 그림은 `reducedMotion`이면 멈춤.
- [ ] 휴대폰 375px에서 페이지가 가로로 넘치지 않아요([그림 크게 보기] 포함).

**5. 테스트(자기 파일만 — 5.1 표)**

- [ ] `tests/unit/lab/board-part-<부품 id>.test.ts`: `visual`·`interaction.drive`·`controls` 없이도 되는 순수 함수·기본 핀·배선 줄임 표기(파일이 없으면 `board-parts.test.ts`가 실패해요).
- [ ] 파이썬 흉내·확장이 있으면 `tests/unit/lab/helpers/board-steps/<이름>.mjs` + `tests/unit/lab/pyodide-board-<이름>.test.ts`(7.7): 예제 원본 코드 그대로, 실물과 같은 오류, [정지]. 공유 도우미 `pyodide-board-run.mjs`는 고치지 않아요.
- [ ] 브라우저 `tests/e2e/lab-esp32-<구역>.spec.ts`: `?example=<파일>`로 열어 [실행] → `data-visual-*`·콘솔, 키보드 조작 한 번. 이관 예제는 `SMOKE_ONLY=f060,f061 npx playwright test tests/e2e/examples-smoke.spec.ts --project=desktop`(개발 서버면 `PW_BASE_URL`).
- [ ] `npm run check`(오류 0)·`npm test`·자기 spec 결과를 명령과 함께 보고서에 적어요.

**6. 오류 사전 항목은 요청으로** — `content/help/errors/errors.yaml`은 공유 파일이에요. 보고서의 "공유 파일 변경 요청"에 아래 모양 그대로 적으면 통합 때 `board` 묶음의 구역 자리 표시(`# ▼ 구역 A …`) 아래에 넣어요. 영어 마지막 줄 문구를 `patterns`에, 학생 글은 고1이 읽는 "~해요" 문장으로(필드 설명은 그 파일 머리말). 아래는 모양을 보여 주는 보기예요(아직 들어 있지 않음).

```yaml
  - id: board-i2c-no-device            # board-<부품 또는 기능>-<뜻>
    group: board
    title: I2C 장치가 대답하지 않아요    # 60자 이하
    types: [OSError]
    patterns:
      - "\\[Errno 19\\] ENODEV"
    priority: 3
    meaning: "SDA·SCL 선에 이어진 장치가 대답하지 않았어요. ENODEV는 '장치가 없다'는 뜻이에요."
    why:
      - "SDA와 SCL 선이 바뀌었거나, 코드에 적은 주소(0x27 등)와 장치 주소가 달라요."
    fix:
      - "{line}번째 줄 근처의 핀 번호가 배선도의 SDA·SCL과 같은지 확인해요."
      - "i2c.scan()으로 찾은 주소를 코드에 적어요."
    example:
      code: |
        from machine import Pin, SoftI2C
        i2c = SoftI2C(sda=Pin(21), scl=Pin(22))
        i2c.writeto(0x27, b'\x00')
      error: "OSError: [Errno 19] ENODEV"
      line: 3
```

### 7.10 확장 자리 한눈에(병렬 제작 준비 2026-09-17)

부품·블록·실제 보드 구역이 보드 핵심·실습실 공통 코드를 고치지 않고 쓰도록 미리 만든 자리예요. 모두 테스트로 확인했어요(오른쪽 칸).

| 필요한 것 | 파이썬 쪽 | 화면 쪽 | 확인 |
|---|---|---|---|
| PWM 세기 | `apc_board.BOARD.set_pwm(gpio, duty 0~1, freq Hz)`·`clear_pwm(gpio)`·`pwm_of(gpio)` — 값 검사·MicroPython 오류 문구는 PWM 확장이 맡음. `Pin(…, 인자)`로 다시 정하면 실물처럼 끊김 | 핀 항목 `mode 'pwm'`·`duty`·`freq` → `outputStrength(snapshot, gpio)`, 핀 표 "PWM 출력" | `pyodide-board-extension-points`(pwm_core), `lab-esp32-extension-points.spec` |
| 아날로그 입력 | `BOARD.read_millivolts(gpio)`(0~3300 — ADC 확장이 `read()` 0~4095·`read_u16`·감쇠로 환산), `BOARD_MAX_MV`·`DIGITAL_HIGH_MV` | `analogDrive(mv)`를 `interaction.drive`나 `controls`의 `api.setDrive(role, …)`로 | analog_inputs |
| 부품 장치(LCD·OLED·네오픽셀·MP3) | `register_part(부품 id, factory)` → 실행마다 `wired_devices(부품 id)` = `[(배선 항목, 장치)]`, `set_device_state(배선 id, 부품 id, 상태)`, `on_device_input(배선 id, 처리 함수)` | `visual`·`render`의 `device`(`{ seq, state }`), `data-board-devices` | device_core·device_new_run |
| 조작 칸(4채널 터치·송신 패널) | `on_device_input` | `controls(host, api)` — `setDrive`·`sendToDevice`·`storageName` | `board-parts.test`(검사), view |
| 소리 | — | `sound: true` + `getBoardAudio()`(`context`·`destination`·`enabled`·`onChange`), [소리 켜짐] 단추 | `board-audio.test`, extension-points spec |
| 보드 라이브러리 | `/board/lib`(sys.path — 실행 시작마다 캐시 비움) | `examples/esp32/lib/**/*.py`를 저절로 넣음, 실물 저장은 `librariesNeededBy(코드)` | `board-libraries.test`, not_yet_and_board_lib |
| 아직 없는 모듈 안내 | `NOT_YET_MODULES`(파일이 생기면 저절로 그 파일) | 오류 사전 `board-not-emulated` | not_yet_and_board_lib |
| machine 이름 더하기 | `ext/<기능>/apc_board_<기능>.py`에서 `register_machine_export(이름, 값)` | — | P3-01 |
| 블록 전용 호환 모드(D, PD-27) | JSPI 없이 `runPythonAsync` 최상위 await: `await apc_board.wait_ns_async(ns)`(Timer·핀 인터럽트·입력·[정지]), `await apc_runtime.sleep_async(초)` — 생성기가 만든 실행판만 부름(화면 코드는 `time.sleep`) | 블록 모듈이 실행판을 만듦(브라우저 확인은 D 구역) | `pyodide-board-async-wait`(제한 모드, Node) |
| 실행 대상(E — 실제 보드) | — | `lab.setRunTarget({ label, run(code, ctx), stop() })`: [실행]·[정지]가 대상으로, `ctx.write(글, kind)`·`ctx.prompt(안내)`(공통 입력줄), 결과는 `RunResult`(오류면 `error.traceback` — 셸이 콘솔에 한 번 적고 오류 풀이 카드가 읽음), `'run'` 이벤트 `target` 이름, 뿌리 `data-run-target`·`data-state`(대상의 idle·running·stopping). 실행 중에는 바꿀 수 없음(오류) | `tests/e2e/lab-run-target.spec.ts`(Edge) |
| 모의 시리얼(E·F·통합) | — | 8절 | `tests/unit/serial/*`, `tests/e2e/serial-mock.spec.ts` |
| I2C 장치(다음 I2C 부품, P3-04) | 부품 장치에 `i2c_address`(7비트, 필수)·`i2c_start(read)`(False면 NACK)·`i2c_write(data)` → ACK한 바이트 수·`i2c_read(count)`·`i2c_stop()`·`i2c_hint(data)`(선택 — 가상 전용 설명 통로, 드라이버가 `bus._apc_hint(addr, data)`). 배선 역할 `scl`·`sda` 핀이 같은 버스에 매달린다. 도우미 `apc_board_i2c.wired_i2c_devices()`·`i2c_devices_on(scl, sda)` | `board.device` 상태 | `tests/unit/board-i2c/pyodide-i2c-{bus-lcd,oled}.test.ts` |
| 가상 직렬 선(UART 부품, P3-05) | `apc_board_uart.deliver(gpio, data, settings=None, at_ns=None)` → 받은 UART 수(부품 TX → 보드 RX). 장치에 `SERIAL_RX_ROLE`('rx')·`serial_receive(data, info)`·`serial_settings()`. `uart_on_rx_pin(gpio)`·`uart_on_tx_pin(gpio)` → `{baudrate, bits, parity, stop}`, `SERIAL_DEFAULT`(9600 8N1), 설정이 다르면 `reframe`이 비트 단위로 깨뜨림 | 부품 `controls`의 `api.sendToDevice` | `tests/unit/board-uart/pyodide-{uart,mp3}.test.ts` |
| 네오픽셀 신호(P3-05) | `machine.bitstream(pin, 0, timing, buf)` → 장치에 `BITSTREAM_ROLE`('din')·`receive_bitstream(data, timing)` | — | `tests/unit/board-uart/pyodide-neopixel.test.ts` |
| 보드 콘솔 `input()`(P3-05) | `src/lab/modules/board-console/`가 ESP32 실습실 `builtins.input`을 바꾼다(기다리는 동안 Timer·UART가 돈다) | 이벤트 `board-console.prompt {id, prompt}`, 채널 `board-console.line {id, value}`·`{id, cancelled: true}`·`board-console.ready`, 실습실 틀의 공개 `lab.prompt` | `tests/unit/board-uart/{board-console,pyodide-board-console}.test.ts` |
| [실행] 코드 바꾸기(D, P3-06) | — | `lab.setRunCodeTransform(fn \| null)`: [실행] 때 파이썬에 보낼 코드만 바꾼다(편집칸·공유 링크·내려받기·실제 보드에는 영향 없음) | `tests/unit/blocks/rules.test.ts`, `tests/e2e/esp32-blocks.spec.ts` |
| 예제 목록에 없는 코드의 배선(D, P3-06) | — | 실습실 뿌리 속성 `data-board-wiring-override`(WiringEntry[] JSON)와 이벤트 `apc:board-wiring`(`src/lab/blocks/board-link.ts`) → 보드 모듈이 예제 배선 대신 그린다 | `tests/unit/blocks/board-link.test.ts`, `tests/e2e/scenario-b.spec.ts` |
| 블루투스(Phase 4 P4-03) | `ext/ble/apc_board_ble.py` — `bluetooth`·`ubluetooth` 저수준(주변기기 노릇만, 20바이트 특성, `gatts_notify` 연결 없으면 `OSError [Errno 128] ENOTCONN`), 가상 무선 `RADIO`(`connect`·`write_from_peer` — 연결이 없으면 먼저 연결), `on_notify(함수)`. 코드가 끝나도 블루투스가 켜져 있으면 [정지]까지(`register_idle_hook`) | 부품 `ble`의 조작 칸, 창 이벤트 `apc:ble-write`·`apc:ble-notify` | `tests/unit/board-ble/pyodide-ble.test.ts`, `tests/e2e/esp32-ble.spec.ts` |
| 와이파이·MQTT(Phase 4 P4-06) | `ext/network/apc_board_network.py`(`network.WLAN` — `connect()` 뒤 가상 시계로 0.5초가 지나야 붙는다, 그동안 `STAT_CONNECTING` — 실물처럼 기다리는 코드여야 한다)·`apc_board_umqtt.py`(`umqtt.simple.MQTTClient` — 화면의 거절을 MicroPython과 같은 자리인 `OSError`로, 와이파이가 붙기 전 `connect()`는 한국어 `OSError`, `set_callback` 없는 `subscribe`는 실물과 같은 `AssertionError`) | 모듈 `src/lab/modules/mqtt/`(요청 `mqtt.connect`·`publish`·`subscribe`·`disconnect`, 이벤트 `mqtt.wifi`, 채널 `mqtt.inbox`) | `tests/unit/mqtt/pyodide-network.test.ts`, `tests/e2e/mqtt.spec.ts` |
| 보드 → 컴퓨터 UART 바이트(Phase 4) | `apc_part_uart.py`의 `serial_receive`가 이벤트 `board.uart.tx` `{id, port, bytes, baud}`를 보낸다(2026-09-24 통합) | `vision-bridge` 보드 쪽이 받아 선(탭 통로)으로 컴퓨터에 넘긴다. 이벤트가 오기 전에는 부품 상태의 `rxTail`로 받는다 | `tests/e2e/bridge-vision-board.spec.ts`("보드 → 컴퓨터") |

---

### 7.11 블록 모드(P3-06) — 새 블록 더하기

ESP32 실습실 코드 칸 제목 아래 [블록]·[코드] 전환이 있고, [블록]을 누를 때만 Blockly를 `import()`한다(코드 모드만 쓰면 받지 않는다).

- **새 블록 = 세 곳에 한 줄:** `src/lab/blocks/blocks.ts`(블록 JSON — 한국어 `message0`·`tooltip`) + `codegen.ts`(그 블록이 만들 파이썬) +
  `toolbox.ts`(도구 상자 칸). 바깥 부품을 쓰는 블록이면 `catalog.ts`의 `PART_KIND_LIST`에 한 줄(보드 부품 폴더 id `boardPart`·기본 핀·변수 이름·설정 줄).
- **기다리기·반복은 생성기 함수로만:** `waitLine()`·`whileHeader()`·`forHeader()`를 써야 블록 전용 호환 모드의 실행판이 저절로 따라오고 **두 판의 줄 수가 같다**
  (트레이스백 줄 번호가 화면 코드와 맞는 까닭). 줄 수가 달라지는 코드를 만들지 않는다.
- **화면 코드 머리말:** 첫 줄 `# 블록으로 만든 코드`, 다음 줄들 `# @part <부품 id> <핀>`(예제 사이드카의 배선 문법). 실물 보드에서는 주석일 뿐이다.
- **배선 알림:** 블록이 쓰는 부품은 실습실 뿌리 속성 `data-board-wiring-override`(WiringEntry[] JSON)와 이벤트 `apc:board-wiring`으로 알리고
  (`src/lab/blocks/board-link.ts`), 보드 모듈이 예제 배선 대신 그것을 그린다. 코드 모드에서는 블록에서 온 코드의 머리말을 읽는다.
- **호환 모드(PD-27):** 실행기가 제한 모드이고 편집칸이 생성 코드와 글자까지 같을 때만 실행판을 보낸다(`compat.ts` + 실습실 틀의 `lab.setRunCodeTransform`).
  고친 코드는 제한 모드 그대로다. 실행판의 기다리기는 `src/lab/modules/blocks/apc_blocks.py`(`await apc_board.wait_ns_async`).
- **저장·주소:** `module:blocks:{workspace,mode,generated,converted}`, `?blocks=1`로 열면 블록 모드(차시 링크용), `?example=`·`#code=`로 열면 코드 모드.
- **테스트:** `tests/unit/blocks/`(도구 상자의 모든 블록에 한국어 글·코드 함수가 있는지, 만든 코드가 파이썬으로 컴파일되는지, 두 판의 줄 수가 같은지,
  부품 폴더가 있는지, 블록 색이 흰 글자와 대비 4.5:1 이상인지) + `tests/e2e/esp32-blocks.spec.ts`·`scenario-b.spec.ts`(도구 `tests/e2e/helpers/blocks.ts`).

## 8. 모의 시리얼 — 실제 보드 없이 Web Serial 흐름 시험(`src/lab/serial/mock/`)

실제 보드 연결(P3-07·P3-08)·펌웨어 굽기(P3-09)·실물 점검 도우미(P3-11)가 보드 없이 테스트하도록 `navigator.serial`·`SerialPort`와 USB 너머의 MicroPython 보드를 흉내 내요. **테스트 도구**라 사이트 페이지는 import하지 않아요(배포 번들에 없음). 흉내에서 된다는 것이 실물에서 된다는 증거는 아니에요 — 실물은 부록 B-2(운영자 할 일 2번).

| 파일 | 하는 일 |
|---|---|
| `mock-port.ts` `MockSerialPort` | SerialPort: `open`(인자 검사·못 열면 NetworkError, 결과는 다음 작업 차례)·`readable`/`writable`(진짜 ReadableStream·WritableStream, 장치 출력은 64바이트 조각)·`setSignals`/`getSignals`·`close`(잠긴 스트림이면 TypeError)·`forget`·`getInfo`(기본 CH340 `1a86:7523`, `USB_IDS.cp2102` `10c4:ea60`). 테스트 조작 `unplug()`·`plug()`, 기록 `writtenText()`·`deliveredText()`·`signalLog`·`openLog` |
| `fake-serial.ts` `FakeSerial`·`installFakeSerial` | navigator.serial: `requestPort`(사용자 조작이 없으면 SecurityError·필터 TypeError·고른 포트 없으면 NotFoundError·다음 선택 `chooseNext`)·`getPorts`·connect/disconnect 이벤트(`event.target` = 포트) |
| `micropython-device.ts` `MicroPythonDevice` | 보드: 보통 REPL(배너·되울림·Ctrl-A/B/C/D/E·붙여넣기 모드)·raw REPL·raw-paste(창 128, 흐름 제어를 어긴 바이트 수 `flowControlOverrun`)·소프트/하드 리셋(boot.py → main.py)·`input()`·Ctrl-C·실행 중 받은 바이트는 끝난 뒤 REPL이 이어 읽음·자동 리셋 회로(DTR·RTS → 리셋·다운로드 모드)·`scripts`(정한 응답)·`mini-python.ts` |
| `mini-python.ts` | 도구·수업 코드에 흔한 작은 파이썬(대입·if/while/for·try·with open·print·input·글자 메서드·format·os·time·sys·machine.Pin·ubinascii) + MicroPython 모양 오류 글(`name 'x' isn't defined`·`divide by zero`·`[Errno 2] ENOENT`). 모르는 문장(def·class·lambda·f-string …)은 `NotImplementedError: mock board can't run: …`(옵션 `unknownStatement: 'ignore'`면 건너뜀) — 그런 코드는 `scripts`로 응답을 정해요 |
| `device.ts` | 장치 약속 `SerialDevice`와 `SilentDevice`(응답 없음 — 펌웨어 없는 보드)·`TextDevice`(다른 펌웨어)·`EchoDevice` |
| `config.ts` | 설정(JSON) → 한 벌 `createSerialMock` + 조작 도구 `createSerialMockController` |
| `browser-entry.ts` | 브라우저에 끼우기 `bootSerialMock(plugins)` → `window.__apcSerialMock` |

### 8.1 규약 근거(2026-09-17 원문 확인)

- MicroPython `shared/runtime/pyexec.c`: raw REPL에 들어가면 `raw REPL; CTRL-B to exit\r\n>`. 코드 + `\x04` → `OK` + 출력 + `\x04` + 오류 트레이스백 + `\x04` + `>`. 빈 코드 + `\x04` → `OK\r\n` + 소프트 리셋(raw 그대로). raw-paste `\x05A\x01` → `R\x01` + 창 크기 2바이트(little endian — `MICROPY_REPL_STDIN_BUFFER_MAX` 256의 절반 128) + `\x01`, 창만큼 받을 때마다 `\x01`, 호스트의 `\x04` → `\x04`(받음). `\x05` 뒤가 `A`가 아니면 `R\x00`. SystemExit는 트레이스백 없이 끝. 트레이스백 줄 `File "<stdin>", line N, in <module>`(구문 오류는 `, in …` 없음). 보통 REPL Ctrl-C → `\r\n>>> `, Ctrl-E → `\r\npaste mode; Ctrl-C to cancel, Ctrl-D to finish\r\n=== `.
- ESP32 포트: 소프트 리셋 `MPY: soft reboot`, 보통 REPL일 때만 main.py, 배너 `MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32` + `Type "help()" for more information.`
- WICG Web Serial 명세의 open·readable·writable·close·setSignals·getSignals·requestPort·forget 알고리즘과 오류 이름. 선이 빠지면 읽기가 `NetworkError`("The device has been lost." — esptool-js도 이 문장을 찾음)로 끝나고 포트는 opened 그대로라 `close()`가 성공해요. `setSignals`의 멤버가 하나도 없으면 TypeError.
- esptool-js 0.6.1 `lib/reset.js` ClassicReset(D0·R1·100ms·D1·R0·50ms·D0)과 `lib/webserial.js`(setRTS 뒤 setDTR을 한 번 더 — usbser.sys 우회, open에 dataBits 등을 undefined로 넘김)를 모의 포트가 그대로 받아요 — 다운로드 모드 진입까지 확인(`mock-micropython.test.ts`, Edge `serial-mock.spec.ts`).

### 8.2 Node 테스트(Vitest)

```ts
import { FakeSerial, MicroPythonDevice, MockSerialPort, installFakeSerial } from '../../../src/lab/serial/mock/index.ts';
const device = new MicroPythonDevice({ files: { 'main.py': "print('hi')\n" }, scripts: [{ match: '^import esp32', output: 'ok\n' }] });
const port = new MockSerialPort({ device });          // 만들면 USB 전원이 들어와 부팅 — 포트를 열기 전 출력은 실물처럼 사라진다
const serial = new FakeSerial({ ports: [port], requireUserActivation: false });
const restore = installFakeSerial(serial);             // navigator.serial 자리에(Node 22+), 끝나면 restore()
// 내 연결 코드가 navigator.serial.requestPort() → open → raw REPL … 을 하게 두고 device·port 기록으로 확인
```

- 기준 호스트: `tests/unit/serial/helpers/raw-repl-host.ts`(pyboard.py와 같은 순서 — `enterRawRepl`·`exec`(raw-paste 흐름 제어)) — 내 구현과 비교할 때 import해요.
- 관찰: `device.mode`(off·reset-held·booting·friendly·paste·raw·raw-paste·running·bootloader), `executed`(via friendly·paste·raw·raw-paste·boot.py·main.py), `flowControlOverrun`, `hardResets`·`softResets`, `pins`, `files.snapshot()`.
- 조절: `timeScale: 0.01`(sleep 100배 빠르게), `bootDelayMs`(부팅 중 받은 바이트는 사라짐 — 리셋 직후 바로 보내는 코드 시험), `rawPaste: false`(옛 펌웨어), `SilentDevice`(응답 없는 보드 → [펌웨어 굽기] 안내), `openError: 'NetworkError'`(다른 프로그램이 쓰는 포트), `deliveryDelayMs`·`chunkSize`(느린·잘게 오는 USB), `port.unplug()`(선 뽑기), `device.addScript({ match, output, error, delayMs, untilInterrupt, run })`, `device.setBootloaderHandler((bytes, io, device) => …)`.

**멈춤 신호를 삼키는 프로그램 흉내(P3-08 되찾기 시험, 2026-09-18):** `scripts`의 `run`으로 만들되 **보드가 리셋되면 끝나게** 짠다 —
`ctx.device.hardResets + softResets`가 바뀌거나 `ctx.device.mode === 'off'`가 되면 반복을 끝낸다. 그러지 않으면 보드가 다시 켜져도 옛 반복이
타이머를 남겨 새 실행의 Ctrl-C를 가로챈다. 본보기는 `tests/unit/serial/real-board-recovery.test.ts`의 `SWALLOW_SCRIPT`이고, 브라우저에서는
`page.evaluate`로 `window.__apcSerialMock.device('board').addScript({ match, run })`처럼 붙인다(`tests/e2e/esp32-real-board-run.spec.ts`).

### 8.3 브라우저 테스트(Playwright)

```ts
import { ESP32_USB_FILTERS, installSerialMock, serialMock, utf8Text } from './helpers/serial.ts';
await installSerialMock(page, { ports: [{ id: 'board', micropython: { files: { 'main.py': '…' }, scripts: [{ match: 'esp32', output: 'ok\n' }] } }] });
await page.goto(withBase('labs/esp32/'));                       // installSerialMock은 goto 전에
await page.getByRole('button', { name: '보드 연결' }).click();   // requestPort는 클릭 안에서만 된다
const board = serialMock(page);                                  // 기본 포트 id 'board'
await expect.poll(() => board.mode()).toBe('raw');
expect(utf8Text(await board.deliveredText())).toContain('MicroPython v1.29.0');
await board.unplug();                                            // 선 뽑기 → "연결이 끊겼어요" 흐름
```

- 설정(JSON): `ports[]` — `id`·`label`·`usb`(`'ch340'`·`'cp2102'`·`{ usbVendorId, usbProductId }`)·`granted`(처음부터 허락 → getPorts)·`plugged`·`device`(`'micropython'`·`'silent'`·`'text'`·`'echo'`·`'none'`)·`text`·`micropython`(8.2의 옵션 — `scripts[].match`는 정규식 글자)·`openError`·`chunkSize`·`deliveryDelayMs`, 그리고 `requireUserActivation`.
- 조작 도구 `serialMock(page)`: `mode`·`writtenText`·`deliveredText`(0~255 글자 — 한글은 `utf8Text`)·`files`·`setFile`·`executed`·`pins`·`signals`·`openLog`·`isOpen`·`requests`·`chooseNext(id | null)`(null = 학생이 선택 창을 닫음)·`plug`·`unplug`·`send`·`reset('hard'|'soft')`·`addScript`·`flowControlOverrun`·`hardResets`·`softResets`.
- 함수가 필요한 흉내(ROM 부트로더 응답 등)는 **플러그인**: `tests/e2e/helpers/serial-plugins/<이름>.ts`(기본 내보내기 `({ kit, controller, config }) => void`, 브라우저에서 돌므로 Node 모듈 금지)를 `installSerialMock(page, 설정, { plugins: ['tests/e2e/helpers/serial-plugins/<이름>.ts'] })`로 넣어요. 본보기 `bootloader-echo.ts`.
- 문서가 새로 열릴 때마다 새 보드예요(새로 고침·이동·iframe마다).
- **Playwright의 `page.evaluate`는 사용자 조작이 있는 것으로 돌아요**(requestPort가 통과) → "클릭 없이 부르면 SecurityError"는 `page.addInitScript`처럼 evaluate 밖에서 시험해요(`tests/e2e/serial-mock.spec.ts`).

### 8.4 흉내 내지 않는 것

보통 REPL의 자동 들여쓰기·탭 완성·기록, raw-paste 도중 구문 오류로 일찍 끝내기(코드를 다 받은 뒤 검사), 실제 ROM 부팅 글 전체, USB 드라이버·포트 이름·버퍼 넘침(BufferOverrunError), 한 번의 `setSignals` 안에서 선이 차례로 바뀌는 순간(한꺼번에 바뀐 것으로 봄), mini-python 밖의 문법, 보드의 `hashlib.sha256`(없어서 [보드에 저장]의 "같은 파일 건너뜀" 갈래는 `scripts`의 정한 응답으로 시험해요). 이런 차이는 실물 점검 목록(부록 B-2)으로 확인해요.

**ROM 부트로더는 흉내 낸다(P3-09):** `src/lab/firmware/mock/esp32-rom.ts`가 SLIP·SYNC 8번 응답·READ/WRITE_REG·SPI 사용자 명령 RDID·SPI_ATTACH(8바이트)·SPI_SET_PARAMS·FLASH_BEGIN/DATA·FLASH_DEFL_BEGIN/DATA(0x400 블록, pako로 풀어 플래시에 씀)·SPI_FLASH_MD5(ASCII)·CHANGE_BAUDRATE를 받고, 스텁 전용 명령에는 오류로 답해요(PD-38 — 스텁을 싣지 않으므로 그 길이 막힌 것을 테스트가 지켜요). Playwright 플러그인은 `src/lab/firmware/mock/serial-plugin.ts`이고, `globalThis.__APC_ESP32_BOARD_OPTIONS__ = { <포트 id>: { firmware: 'none' } }`이면 펌웨어가 지워진 보드처럼 굽기 전까지 REPL 대답을 막고 `invalid header: 0xffffffff`를 되풀이해요(모의 보드 파일은 고치지 않고 받기·내보내기만 감쌈).

**P3-11에서 실물과 더 맞춘 것:** ① `input()`의 줄 읽기는 실물 `readline`처럼 32~126 글자만 줄에 넣고 되울려요(0x80 이상의 한글 바이트는 버려요 — 실물 보드의 한글 input()이 빈 글자가 되는 까닭). ② raw REPL에서 `sys.exit()`·`machine.soft_reset()`은 실물 순서로 `\x04\x04` → `MPY: soft reboot` → boot.py → raw 알림을 보내요(둘은 같은 바이트라 사이트가 구별할 수 없고, 오류 없이 끝난 실행에 `softReboot` 표지가 붙어요).

## 8.5 실제 보드 연결·실행·저장(P3-07·P3-08)

실습실 입력·출력 칸 위의 [가상 보드]/[실제 보드] 탭이 `lab.setRunTarget`으로 같은 [실행]·[정지]·콘솔·입력줄·오류 풀이 카드를 실제 보드로 보낸다.
파일은 `src/lab/serial/`(사이트 코드)과 `src/lab/modules/real-board/`(화면)·`src/components/lab/real-board/`(HTML)다.

- **연결 상태 기계** `BoardConnection`: `unsupported`·`idle`·`choosing`·`opening`·`checking`·`ready`·`running`·`no-micropython`·`busy`·`writing`·`recovering`·`lost`·`error`.
  `connect()`·`reconnect()`·`openPort(port)`·`check()`·`restartBoard()`·`run(code, handlers)`·`stop()`·`sendInput(bytes)`·`save(code, options)`·
  `disableAutorun(file?)`·`recover()`·`disconnect()`·`dispose()`·`subscribe(listener)`·`snapshot`. **한 포트에 주인은 하나**다(다른 탭·Thonny가 열어 두면 못 연다).
- **판별:** Ctrl-C → Ctrl-C·Enter → Ctrl-B(리셋 없이 배너)로 7가지를 가른다 — `micropython`·`other-python`·`no-firmware`·`download-mode`·`busy`·`other-output`·`silent`.
  포트 선택 창은 거르지 않고, USB 칩 이름은 `usb-chips.ts` `describePortInfo`가 VID·PID로 만든다(보조 정보).
- **실행:** 실행마다 raw REPL 소프트 리셋 → raw-paste(안 되면 보통 raw). [정지]는 Ctrl-C를 0.5초 간격으로 최대 6번. 기다림 값은 `raw-repl.ts` `DEFAULT_REPL_TIMING` 한 곳.
- **파일:** `board-files.ts` — mpremote `fs_writefile` 방식(256바이트씩 `w(b'…')`), 임시 이름(`<경로>.part`)에 쓰고 크기를 확인한 뒤 제자리로, SHA256이 같으면 건너뜀.
  자리는 **보드 뿌리**(`/main.py`·`/i2c_lcd.py`). [실행]은 코드가 부르는 사이트 라이브러리가 없을 때만 올린다(`provisionLibraries`).
- **input():** `board-input.ts` — `prepareBoardInputLine(글)`이 실물 readline이 받는 32~126 글자 + `\r`만 남기고(한글은 빼고 안내, 250자 상한),
  `InputEchoFilter`가 보드 되울림을 한 번 걸러 콘솔에 두 번 보이지 않게 한다.
- **되찾기:** `board-recovery.ts` + `BoardConnection.recover()` — Ctrl-C 되풀이 → RTS로 다시 켜며 되풀이 → EN 버튼 안내. [boot.py 끄기]는 파일을 지우지 않고 `boot_off.py`로 이름만 바꾼다.
- **호환 안내:** `compat.ts` `findRealBoardCompatIssues(code)` — 실물에서 안 되는 여섯 모양을 줄 번호와 함께 알린다(막지 않음). 자르기(`slice-step`) 규칙은 대괄호 안에 중괄호·쉼표가 있으면 건너뛴다(2026-09-18 검토 반영 — `colors = [{'r':255,'g':0,'b':0}]`처럼 자르기가 없는 흔한 줄을 지적했다).
- **사이트가 실물용 파일을 주지 못하는 모듈:** `esp32/board-libraries.ts`의 `VIRTUAL_ONLY_MODULES`(지금은 OLED 드라이버 `ssd1306`·`sh1106`). 가상 보드에서는 부품 폴더의 흉내로 돌지만 실물에는 그 파일이 없어서 [실제 보드] [실행] 전에 한국어로 알린다(`virtualOnlyModuleNotice`). `examples/esp32/lib/`에 같은 이름의 파일을 두면 보드 라이브러리가 되어 저절로 올라가므로 표에서 빼면 된다(PROGRESS 미해결 64).
- **[보드에 저장] 덮어쓰기 확인:** `saveFilesToBoard`의 `confirmOverwrite`(→ `BoardConnection.save`의 같은 이름 칸)가 **보드에 이미 있는 다른 내용의 파일**을 바꿔 쓰기 직전에 한 번 묻는다. "아니요"면 `BoardSaveCancelled`로 그 파일부터 멈추고 결과 상자가 파랑 "바꾸지 않았어요"(`data-real-board-saved-state="cancelled"`)가 된다. 내용이 같은 파일은 해시로 건너뛰므로 묻지 않는다(2026-09-18 검토 반영 — 공용 키트 보드의 `main.py`가 확인 없이 사라졌다).
- **화면 표시(테스트가 읽는 것):** `[data-real-board]`의 `data-real-board-state`·`tone`·`verdict`·`problem`·`recovery`·`autorun`·`saved-state`,
  단추 `[data-real-board-action="connect|reconnect|check|restart|choose|disconnect|save|recover|disable-autorun"]`. 글 만들기는 `modules/real-board/status-text.ts`(순수 함수).
- **실행 대상이 상태 줄을 잠깐 바꾸기:** `LabRunContext.setStatus(글 | null)` — 실제 보드가 포트 선택 창을 여는 동안처럼 아직 아무것도 실행되지 않았을 때 "실행 중이에요" 대신 무엇을 기다리는지 적는다. `null`이면 기본 글로 돌아가고, 실행이 끝나면 저절로 지워진다(2026-09-18 검토 반영).
- **패널 예외:** [가상 보드]/[실제 보드] 탭은 코드와 상관없이 늘 보여야 해서 `real-board` 모듈은 mount에서 `showPanel()`을 바로 부르고
  패널을 입력·출력 칸의 가상 보드 위로 옮긴다(4절 "패널은 쓸 때만 연다"의 예외).

## 8.6 실물 점검 도우미(P3-11) — 항목 더하기

`/labs/esp32/check/`는 키트 보드가 사이트 예제대로 움직이는지 선생님이 확인하는 화면이다(부록 B-2 Phase 3 항목 = 운영자 할 일 2번).
항목 하나 = `src/lab/esp32/check/items.ts`의 `CHECK_ITEMS` 한 줄이고, 그 파일만 고치면 화면·복사 글·테스트가 따라온다.

- **칸:** `id`·`b2`(부록 B-2 번호)·`title`·`why`·`minutes`(추정)·`wiring`(사이드카 `parts`와 같은 모양)·`prepare`(사람이 먼저 할 일)·`code`·`seconds`(지켜볼 시간)·
  `questions`(예/아니오)·`expect`(콘솔에서 읽을 값 안내)·`libraries`(쓰는 보드 라이브러리).
- **코드 규칙:** 실물 MicroPython 이름만(사이트 흉내 이름 금지), 끝없는 반복 금지, 눈으로 볼 시간은 `seconds`로.
- **안전 안내:** 움직이거나 빛을 내는 부품(팬·서보·레이저)은 `prepare` 끝에 한 줄로 적는다. 화면 머리의 "안전하게 쓰기" 칸(`BoardCheckHelper.astro`)은 `/start/board/`와 같은 문구이고, 부품이 늘어도 그 칸은 그대로 쓴다(2026-09-18 검토 반영).
- **배선 그림:** `wiring-figure.ts`가 가상 보드 그림을 **꺼진 모습으로 한 장** 그린다(누를 수 없다). 예제 배선도와 같은 자리·같은 색이다.
- **판정·복사 글:** `report.ts` — 질문이 모두 예면 "예(같음)", 하나라도 아니오면 "다름", 답이 없으면 "아직". [결과 복사]는 PROGRESS에 붙일 마크다운 표를 만든다.
- **저장:** `board-check:answers`(이 컴퓨터의 브라우저에만, [기록 지우기]가 함께 지운다).
- **테스트:** `tests/unit/esp32-check/`(항목 규칙·복사 글) + `tests/e2e/esp32-board-check.spec.ts`(모의 포트로 항목 전체를 끝까지 — 실물의 증거는 아니다).

## 8.7 가짜 블루투스 — 실제 기기 없이 Web Bluetooth 흐름 시험(`src/lab/ble/mock/`, P4-04)

Node 단위 테스트: `new BleConnection({ bluetooth: createMockBluetooth({ devices: [{ name: 'ESP32-07', echo: true }] }) })`.
브라우저 테스트: `browser-entry.ts`를 esbuild로 묶어 `page.addInitScript`로 넣는다(`tests/e2e/web-bluetooth.spec.ts`의 `installBleMock`).
설정 `globalThis.__APC_BLE_MOCK_CONFIG__`(`devices`·`chooser: 'first'|'cancel'`·`unsupported: true`),
조작·확인 `globalThis.__APC_BLE_MOCK__`(`writtenText`·`receivedText`·`notify`·`drop`·`calls`·`maxConcurrentWrites`·`connectCount`·`notifying`).
`calls()`는 선택 창을 부른 순간의 `navigator.userActivation.isActive`를 함께 남긴다 — **권한 요청이 클릭 안에서 났는지**를 검사가 본다.
흉내 내지 않는 것: 스캔·페어링 창·MTU 협상·여러 기기 동시 연결. 모의는 실물의 증거가 아니다(부록 B-2 15번).

---

## 9. 통신 브릿지 — `src/lab/bridge/`(P4-01)

"브릿지"는 **영상처리 실습실이 알아낸 값(손가락 개수·좌표·클릭)을 ESP32로 보내는 다리**다. 규칙은 `docs/PLAN.md` §7(특히 §7.2 PD-06·§7.4 PD-29·§7.6)이 헌법이고, 이 절은 그것을 코드로 옮긴 결과와 **Phase 4 여섯 구역이 지켜야 할 약속**이다. 규칙 하나하나에 단위 테스트가 있다(`tests/unit/bridge/`).

### 9.0 세 층과 파일

```
 보내는 쪽(영상처리·대시보드·블록)                통로                    받는 쪽(가상 보드·실제 보드·다른 탭)
 ────────────────────────────────────  ──────────────────────  ────────────────────────────────
 bridge.send('355,152')   ─▶ ① 메시지   ─▶ ② 보낼 차례        ─▶ ③ 통로 ─▶ (같은 바이트)
 bridge.event('DATA,…,1,0')  message.ts     outbox.ts               channels/
 bridge.sendBytes(b)         모양·길이·끝 문자  초당 10회·병합·보존     direct / tab / (mqtt·ble·serial 자리)
 bridge.receive()         ◀─ 받는 차례 inbox.ts(줄 모으기·허용 목록) ◀─┘
```

| 파일 | 하는 일 |
|---|---|
| `types.ts` | 값 모양 한 곳(`BridgeMessage`·`BridgeEnvelope`·`BridgeChannel`·`BridgeChannelFactory`). DOM·워커를 모른다 |
| `messages.ts` | **학생이 보는 한국어 문장과 오류 종류 전부**(`bridgeText`, `BridgeError`·`BridgeClosedError`·`BridgeNoPeerError`). 문장을 여기 밖에서 쓰지 않는다 |
| `message.ts` | 메시지 만들기·모양 판정·길이 검사(§7.2-1·2·3·7·8) |
| `outbox.ts` | 언제 보내나(§7.2-4·5, §7.6-①~⑤). 시계·타이머를 인자로 받는다 |
| `inbox.ts` | 받은 바이트를 줄로 모으고 거른다(§7.7, PD-29) |
| `prefix.ts` | 무작위 접두어 12글자(PD-29) |
| `bridge.ts` | 셋을 묶은 `Bridge`(`send`·`event`·`sendBytes`·`receive`·`setChannel`) |
| `channels/` | 통로 구현과 등록표. `direct`(같은 탭)·`tab`(BroadcastChannel) 붙박이 + `registry.ts`(MQTT·BLE·Web Serial 자리) |
| `index.ts` | **공개 자리 — 쓰는 쪽은 `src/lab/bridge/index.ts`에서만 가져온다** |

### 9.1 통로 약속(`BridgeChannel`)

보내기·받기·닫기와 "누가 보냈는지"만 있는 작은 약속이라 구현을 갈아 끼울 수 있다.

```ts
interface BridgeChannel {
  readonly id: string;            // 'direct' | 'tab' | 'mqtt' | 'ble' | 'serial'
  readonly label: string;         // 화면에 보일 한국어 이름
  readonly from: BridgeParty;     // 이 끝의 이름 — "누가 보냈는지"
  readonly state: 'open' | 'closed';
  readonly peers: readonly BridgeParty[];   // 지금 보이는 상대(모르면 빈 목록)
  readonly knowsPeers: boolean;
  send(bytes: Uint8Array, options?: { to?; port?; baud?; type? }): Promise<void>;
  on('message' | 'peers' | 'close', listener): () => void;   // 돌려주는 함수로 그만 듣는다
  close(reason?: string): void;
}
```

- **이름(`from`)에 개인정보를 넣지 않는다.** 학생 이름·학번·기기 주소가 아니라 자리 이름을 쓴다: `pc`·`board`·`phone`·`dash`(`BRIDGE_PARTY_LABELS`).
- 봉투(`BridgeEnvelope`)는 `{ v: 1, type, from, to?, port?, baud?, bytes, at }`이고 **바이트만 싣는다**. 인사 봉투에는 내용이 실리지 않는다.
- 통로는 인사 봉투만 걸러 내고 **나머지는 그대로 올려 준다.** 한 접두어에 여러 줄기(예: `bridge.data`와 `uart.data`)를 함께 쓰면 받는 쪽이 `envelope.type`을 보고 가른다.
- 통로가 닫혔으면 `BridgeClosedError`, 상대가 없다고 알 수 있으면 `BridgeNoPeerError`를 던진다. 둘 다 한국어 문장이 들어 있다.

붙박이 통로 둘

| id | 무엇 | 쓰는 곳 |
|---|---|---|
| `direct` | 같은 탭 **같은 문서** 안에서 잇는다(`createDirectPair`·`createDirectHub`). 브라우저 API를 하나도 쓰지 않아 단위 테스트가 이것으로 규칙을 확인한다 | 테스트, 한 문서 안에서 두 쪽을 잇는 곳(4단원 통합 화면의 컴퓨터 쪽 `bluetooth` 흉내 — P4-09) |
| `tab` | 같은 컴퓨터의 다른 탭·**같은 출처의 iframe**(BroadcastChannel, PD-17). 채널 이름은 `ai-physical-computing:bridge:<접두어>` | 탭 통로와 한 화면 모드(P4-02·P4-06·P4-07·P4-08) — iframe은 같은 출처의 다른 문서라 `direct`로는 닿지 않는다 |

상대가 없어도 조용히 보내야 하는 쪽(대시보드처럼 듣는 사람이 없을 수 있는 방송)은 `requirePeer: false`로 연다 — 그래야 보낼 때마다 오류 안내가 나오지 않는다.

화면의 [보내기] 패널이 통로를 바꿀 때는 `bridge.setChannel(새 통로)`를 쓴다 — 보낼 차례에 남아 있던 것이 그대로 새 통로로 나가고, 받는 길도 함께 옮겨진다. 옛 통로는 닫지 않으므로 필요하면 부른 쪽이 닫는다.

`tab` 통로는 BroadcastChannel에 상대를 세는 기능이 없어서 **인사로 안다**: 열 때 `bridge.hello` → 받은 쪽이 `bridge.here`로 답 → 그 뒤 2초마다 `bridge.here`, 6초 동안 소식이 없으면 목록에서 뺌, 닫을 때 `bridge.bye`. `requirePeer`(기본 참)면 상대가 없을 때 보내기가 `BridgeNoPeerError`를 던지고, 그 전에 `discoveryMs`(기본 500ms)만큼 한 번 더 기다려 본다(막 열린 탭이 답할 시간).

채널 이름 앞의 `ai-physical-computing:bridge:`는 PD-29의 "고정 루트"가 아니다 — BroadcastChannel은 **같은 출처 안에서만** 통하고 이름이 밖에서 보이지 않는다. 이 사이트는 같은 계정의 다른 GitHub Pages 사이트와 출처를 나눠 쓰므로(`src/lib/storage.ts`와 같은 사정) 다른 사이트의 채널과 섞이지 않게 사이트 이름을 붙였다.

### 9.2 메시지 규칙(§7.2) — 어디에 있고 어떤 테스트가 지키나

| 규칙 | 구현 | 테스트 |
|---|---|---|
| 1 모양 세 가지(명령 한 글자 / 값 목록 / 머리말+필드) | `classifyText` → `shape`·`category`·`mergeKey` | `message.test.ts` "규칙 1" |
| 2 끝 문자 `\n` 한 개 | `textMessage(text)`(이미 있으면 더 붙이지 않음, `terminator: ''`로 끌 수 있음) | "규칙 2" |
| 3 끝 문자까지 20바이트(`BRIDGE_MAX_BYTES`) | `inspectBytes` → `warnings`에 `too-long` **경고만**(실물처럼 잘리는 것을 보여 주려고 막지 않는다, §7.7) | "규칙 3" |
| 4 최대 초당 10회(`BRIDGE_MIN_INTERVAL_MS` 100ms) | `BridgeOutbox` — 넘친 것은 **버리지 않고** 차례에서 병합 | `outbox.test.ts` "규칙 4" |
| 4 값이 바뀔 때만 | `skipUnchangedState`(기본 꺼짐. `bridge.send()`는 켠다) | "값이 바뀔 때만" |
| 5 상태는 최신 값 / 이벤트는 대기열 | `category` + `mergeKey`(이벤트는 `null`이라 절대 안 바뀜) | "규칙 5" |
| 6 같은 문자열을 모든 통로에 | 통로는 바이트만 받는다 — 메시지 층이 통로를 모른다 | `channels.test.ts` |
| 7 원시 바이트(끝 문자 없음) | `rawMessage(bytes)`·`bridge.sendBytes` | "규칙 7·8" |
| 8 원본 PC 코드는 고치지 않는다 | `rawMessage`는 바이트를 **복사만** 한다(한 바이트도 더하거나 빼지 않음). 글자로 읽히면 모양만 알아본다 | "규칙 7·8" |

상태와 이벤트를 가르는 기준(자료 기준 — `docs/CODE_MAPPING.md` §6.1)

- `DATA,mx,my,d,r` **5필드에서 4·5번째(클릭 표시)가 1이면 이벤트**다. 윙크 한 번이 사라지면 안 된다(§7.6-③).
- 그 밖의 좌표·개수·명령 한 글자는 상태다. `bridge.event(text)`로 보내면 모양과 상관없이 이벤트가 된다.
- 손가락 개수 `3`은 한 글자지만 **명령이 아니라 값**이라 다음 개수 `4`와 같은 자리다(`values:1`).
- 글자로 읽히더라도 제어 문자가 섞였으면(f007의 `0x03`, MP3 명령의 `0x06`) 글이 아니라 원시 바이트로 본다.

### 9.3 보낼 차례(`BridgeOutbox`)와 §7.6 병합 규칙

```ts
const outbox = new BridgeOutbox((message) => channel.send(message.bytes), { scheduler, onWarn, onSend, onError });
outbox.send(textMessage('355,152'));   // 'queued' | 'merged' | 'skipped' | 'dropped'
```

| §7.6 | 뜻 | 구현 |
|---|---|---|
| ① 한 번에 하나만 쓴다 | 앞 보내기 약속이 풀려야 다음이 나간다 | `inFlight` |
| ② 머리말·필드 수가 같으면 바꿔 끼운다 | 차례의 **그 자리에서** 값만 바뀐다(순서 그대로) | `mergeKey = fields:<머리말>:<필드 수>` |
| ③ 클릭 표시가 1인 DATA 5필드는 안 바꾼다 | 이벤트라 `mergeKey`가 `null` | `classifyText` |
| ④ 같은 한 글자 명령은 합친다 | `command:<글자>`라 **같은 글자끼리만** — `a` 뒤의 `b`는 둘 다 나간다 | `classifyText` |
| ⑤ 콘솔에 `Sent: …` | `onSend(message, line)` + `sentLineOf` | `outbox.ts` |

- 병합은 **차례에 남아 있는 것끼리만** 한다. 이미 나간 값과 견주는 "값이 바뀔 때만"은 `skipUnchangedState`로 따로 켠다 — 원본 PC 코드를 돌릴 때는 꺼 둔다(보낸 것이 조용히 사라지면 원본과 달라 보인다).
- 차례가 `maxQueue`(기본 64)를 넘으면 **바꿔 끼울 수 있는 상태부터** 버리고 한국어로 알린다. 이벤트는 마지막까지 지킨다.
- 시계는 `BridgeScheduler`(`now`·`setTimeout`·`clearTimeout`)로 갈아 끼운다. 테스트는 `tests/unit/bridge/helpers/fake.ts`의 `FakeScheduler`를 쓴다.

### 9.4 받는 차례(`BridgeInbox`)와 거르기(PD-29)

- **줄로 모은다**: 끝 문자가 올 때까지 이어 붙인다(실물 UART 링버퍼처럼 누적 — 두 글자가 한꺼번에 오면 한 덩어리). `\r\n`은 `\r`을 뗀다. 끝 문자를 기다리지 않으려면 `raw: true`.
- **거르기**: `allow`(허용 명령 목록)와 `maxBytes`(기본 20). 목록 밖·너무 긴 줄은 버리고 `onRejected`로 한국어 이유를 준다. 순수 함수 `checkInbound(text, policy)`를 파이썬 템플릿 쪽과 같은 규칙으로 쓴다.
- **실제 보드로 가는 MQTT 수신은 `allow`를 반드시 준다**(PD-29). 레이저·모터·서보를 움직이는 명령은 공개 브로커 통로에 두지 않는다.

### 9.5 접두어(PD-29)

`createPrefix()` → 헷갈리는 글자(l·1·O·0)를 뺀 **무작위 12글자**. 고정 루트를 쓰지 않는다. `ensurePrefix()`는 이 탭(`sessionStorage`)에 적어 두고, [이 접두어 고정]은 `pinPrefix()`로 이 컴퓨터(`localStorage`, 저장 이름 `bridge:prefix` — [기록 지우기]가 함께 지운다)에 남긴다. 친구 접두어는 `parsePrefix()`가 다듬고 틀리면 한국어 이유를 준다.

### 9.6 새 통로 더하기 — MQTT·BLE·Web Serial이 끼워질 자리

**`channels/registry.ts`를 고치지 않는다.** 자기 폴더(예: `src/lab/modules/mqtt/`)에서 등록한다.

```ts
registerBridgeChannel({
  id: 'mqtt',                       // 저장소 전체에서 하나. 두 번 등록하면 오류
  label: '공개 브로커(MQTT)',        // 화면에 보일 한국어 이름
  notice: bridgeText.publicBrokerNotice(),   // 화면에 늘 보일 경고(§7.4)
  available: () => true,            // 이 브라우저에서 쓸 수 있나
  open: async (options) => { /* { from, prefix, type, extra } → BridgeChannel */ },
});
```

**등록된 통로(2026-09-24 통합 기준 — [보내기] 패널의 통로 고르기 상자에 저절로 들어간다):**

| id | 이름 | 등록하는 곳 | 성질 |
|---|---|---|---|
| `mqtt` | 공개 중계 서버(MQTT) | `src/lab/mqtt/channel.ts` `registerMqttChannel` | `notice` = 공개 브로커 경고(늘 보임). 실제 보드로 가는 수신에는 `extra.inbound`(허용 목록·20바이트)를 준다 |
| `ble` | 블루투스(실제 보드) | `src/lab/ble/channel.ts` `registerBleChannel` | `knowsPeers = true`(이어져 있으면 상대는 `board` 하나), 연결 전 보내기는 `BridgeClosedError`. **20바이트를 넘어도 통로가 자르지 않는다** — 자르는 쪽은 실물 보드(§7.7) |
| `serial` | USB 데이터 포트 | `src/lab/serial/data-port/channel.ts` `registerDataPortChannel` | 봉투 type `uart.data`(탭 통로와 같음), `from`은 늘 `board`, `baud`를 싣는다. `knowsPeers = false` — 선 반대쪽에 누가 듣는지 브라우저가 알 수 없다. 포트가 닫혀 있으면 `BridgeClosedError` |

체크리스트

1. `BridgeChannel`의 칸을 모두 채운다(상대를 셀 수 없으면 `knowsPeers = false`, `peers = []`).
2. 실패는 **`messages.ts`의 오류 종류**로 던진다(새 문장이 필요하면 `bridgeText`에 함수를 더한다 — 통로 파일에 한국어 문장을 적지 않는다).
3. 봉투는 `makeEnvelope`·`parseEnvelope`로 만들고 읽는다. 받은 값은 **믿지 않고 검사**한다(깨진 봉투는 버린다).
4. 통로가 바이트를 자르거나 이어 붙이면(BLE 20바이트, UART 속도 불일치) **실물과 같게** 자르고 콘솔에 알린다(§7.7).
5. 단위 테스트는 `tests/unit/bridge/channels.test.ts`와 같은 모양으로 — 가짜 전송로를 넣고 "보낸 바이트가 그대로 간다 / 닫으면 오류 / 상대가 없으면 오류"를 확인한다.

### 9.7 금지·주의

- **통로 이름·토픽·봉투에 개인정보를 넣지 않는다**(학생 이름·학번·얼굴·BLE 주소). 실제 기기 주소는 문서·테스트·로그에도 적지 않는다(자리표시자만).
- 공개 브로커 통로는 `notice`를 화면에 **늘** 보이게 한다. 움직이는 장치(레이저·팬·서보)를 공개 브로커 수신에 잇지 않는다(PD-29).
- 한국어 문장은 `messages.ts` 한 곳에만 쓴다. 같은 상황에 두 문구가 생기면 학생이 다른 문제로 읽는다.
  이 규칙의 범위는 **브릿지 핵심과 통로 공통 문장**(닫힘·상대 없음·길이·공개 브로커 경고)이다. 통로 구현 폴더는 자기 화면·안내 문장을 **자기 폴더의 한 파일**에 모은다 —
  `src/lab/mqtt/messages.ts`(`mqttText`)·`src/lab/ble/text.ts`(`bleText`)·`src/lab/serial/data-port/text.ts`(`dataPortText`)·`src/lab/dashboard/messages.ts`(`dashText`).
  같은 상황의 문장은 `bridgeText`를 불러 쓴다(2026-09-24 통합 판단 — 구역 요청 "통로 이름을 bridgeText로 옮기기"는 이 규칙으로 대신했다).
- `examples/`의 원본 예제 코드를 고쳐 브릿지에 맞추지 않는다(PD-10·§7.2-8). 맞추는 쪽은 흉내 모듈이다.
- 브릿지는 **보드 메시지(`board.*`)와 다른 층**이다. 핀 전압은 `board.state`, 기기 사이 글자 한 줄은 브릿지다. 보드 모듈에 새 메시지 이름이 필요하면 7.3·manifest 규약을 따른다.

### 9.8 테스트

| 층 | 어떻게 | 파일 |
|---|---|---|
| 규칙 | Vitest, 가짜 시계 | `tests/unit/bridge/{message,outbox,inbox,prefix}.test.ts` |
| 통로 | Vitest, 가짜 BroadcastChannel(`FakeBroadcastHub`) | `tests/unit/bridge/channels.test.ts` |
| 전체 | 자료의 실제 메시지(f084·f085·f089·f104·f007)로 §7.5 보기 다섯 가지 | `tests/unit/bridge/bridge.test.ts` |
| 브라우저 | 두 탭·한 화면이 서로의 가상 보드를 움직이는지(진짜 BroadcastChannel) | `tests/e2e/{bridge-vision-board,mqtt,dashboard,scenario-f,unit4}.spec.ts` |

### 9.9 MQTT·같은 컴퓨터 탭 통로 — `src/lab/mqtt/`(P4-06)

- **가져오는 곳은 `src/lab/mqtt/index.ts` 하나**(안쪽 파일을 직접 가져오지 않는다): `registerMqttChannel`·`getMqttSession`·`peekMqttSession`·`deviceRxTopic`·`deviceTxTopic`·`dashTopic`·`prefixFilter`·`MQTT_BROKERS`·`checkBrokerUrl`·`readMqttSettings`·`writeMqttSettings`·`mqttText`.
- **연결은 탭 하나에 하나**(`session.ts`) — ESP32 실습실의 MQTT 칸·대시보드·[보내기] 패널이 같은 연결을 나눠 쓴다. 방식은 두 가지: 공개 중계 서버(`broker-transport.ts`, MQTT.js를 **누를 때만** `import('mqtt')`) 또는 같은 컴퓨터 탭(`tab-transport.ts`, BroadcastChannel — 인터넷이 없어도 된다).
- **통로 고르기 세 가지(`MqttMode`, 2026-09-25 Phase 4 검토 반영):** `tab`(같은 컴퓨터 탭), `broker`("공개 중계 서버" — 못 붙으면 **몰래 바꾸지 않고** `mqttText.brokerFailed`로 실패를 알린다. 친구 컴퓨터와 이어지는 줄 알고 기다리지 않게), `auto`("중계 서버 먼저, 안 되면 탭" — 못 붙으면 `mqttText.switchedToTab`으로 "지금은 같은 컴퓨터의 탭끼리만 이어져요"를 알리고 탭 통로로 바꾼다). 공개 중계 서버로 보낼 때는 늘 `qos 0`·`retain false`(학생 코드의 `retain=True`는 무시하고 한 번 안내 — PLAN §7.4).
- **주소로 접두어 넘기기:** 대시보드 ↔ ESP32 실습실 링크는 `?prefix=<접두어>`를 싣고(`prefixFromQuery` — 브릿지 선의 `?bridge=`도 받는다), MQTT 칸·대시보드에 [접두어 복사]가 있다. 실행마다 파이썬이 구독한 필터만 파이썬으로 넘긴다(지난 실행의 구독이 새어 들지 않게 — `runFilters`).
- **실제 보드 관문(`real-board-guard.ts`):** 코드가 MQTT를 쓰는데 토픽 앞 접두어 글자(`PREFIX = "…"`)가 비어 있으면 [실제 보드] [실행]·[보드에 저장]을 멈추고(`MQTT_NO_PREFIX_ERROR` = 오류 사전 `comm-mqtt-real-no-prefix`) MQTT 칸의 [코드에 접두어 적기]를 알린다. 접두어가 있으면 "실물은 코드에 적은 중계 서버에 직접 붙어요" 경고를 한 번 적는다(PD-29).
- **토픽 규칙(PD-29, `topics.ts`)**: 늘 `<접두어 12글자>/<장치>/<rx|tx>`·`<접두어>/dash/<위젯>`. 가상 보드는 코드의 토픽 앞에 접두어를 붙이고, **이미 접두어로 시작하면 한 번 더 붙이지 않는다**(실제 보드 코드는 접두어를 직접 적는다 — 템플릿 `examples/esp32/templates/mqtt-pub-sub.py` 주석). 고정 뿌리 토픽은 없다.
- **공개 중계 서버 목록** `brokers.ts`의 `MQTT_BROKERS`(`verified`가 참인 주소만 기본값·점검 페이지 연결 시험에 쓴다). 브라우저는 `wss://`만(`checkBrokerUrl`).
- **실제 보드로 가는 수신**은 통로의 `extra.inbound`(허용 목록·20바이트)로 거른다 — LED·LCD만 움직이는 값. 움직이는 장치(레이저·팬·서보)를 공개 중계 서버 수신에 잇지 않는다.
- 보드 쪽 흉내(`network`·`umqtt.simple`)는 7.10 표. 화면 모듈은 `src/lab/modules/mqtt/`(ESP32 실습실, 코드에 `umqtt`·`network`가 보일 때만 칸이 열림).
- 테스트: `tests/unit/mqtt/**`(토픽·설정·세션·탭 통로·파이썬 흉내·실제 보드 관문), `tests/e2e/mqtt.spec.ts`(두 탭이 서로의 가상 LED를 켠다 — 탭 통로는 인터넷 없이, "공개 중계 서버" 실패 알림은 닫힌 주소로 흉내, **공개 서버 시험은 실제 EMQX**(`wss://broker.emqx.io:8084/mqtt`)에 실행마다 새 무작위 접두어로 붙고, 막히면 "외부 요인"으로 적고 건너뛴다).

### 9.10 대시보드 — `src/lab/dashboard/`(P4-07)

- 페이지 `/labs/iot/dashboard/`(`src/pages/labs/iot/dashboard/index.astro` — 통합에서 통신 실습실 아래로 옮김), 판 전체는 `mountDashboard(뿌리)`, 위젯 판만 쓸 때는 `new DashboardView({ grid, announce, helpId, onToggle, onStatus })` + `view.receive(message)`.
- 위젯 네 가지(`WIDGET_KINDS` — 그래프·게이지·스위치·기록). **새 위젯 = `defaults.ts` 표 한 줄 + `widgets.ts`의 몸통·받기 한 갈래**(저장·배치·키보드 옮기기는 따라온다). 그래프·게이지는 라이브러리 없이 SVG로 그린다(`chart.ts`·`gauge.ts`).
- 값이 오는 곳(`source.ts`): 같은 MQTT 연결(`createMqttSource(getMqttSession())`) 또는 브릿지(`listenBridge(channel, …)` → 토픽 `bridge/<보낸 쪽>`, 실행 상태 알림 봉투 `uart.status`는 거른다). 가상 보드 예제는 예제 파일 `examples/esp32/templates/dashboard-demo.py`(`DASHBOARD_DEMO_FILE` — iframe은 `?example=…&embed=1`로 열어 예제 이름·설명이 편집칸 코드와 같다).
- [이 자리에서 가상 보드 열기]는 통로가 "같은 컴퓨터 탭"이면 [연결]까지 해 두고(인터넷이 필요 없다), 공개 중계 서버를 골랐으면 3단계 옆에 "[연결]을 눌러야 값이 들어와요"를 띄운다. 스위치는 **보내기에 성공한 뒤에만** 모양이 바뀌고(`onToggle`이 참을 돌려줄 때), 실패 까닭은 스위치 위젯 안 줄(`data-dash-switch-problem`)에, 이 자리 가상 보드의 LED가 따라 바뀌었는지도 그 줄에 보인다.
- 낭독기: 게이지·기록 위젯은 값마다 읽지 않는다(`aria-live="off"`), 옮기기·크기 안내는 판 아래 알림 칸 한 곳에서만 읽는다.
- 배치 저장은 `readBoard()`·`writeBoard()`(저장 이름 `BOARD_STORAGE_NAME` — [이 컴퓨터에서 내 기록 지우기]가 함께 지움). 문장은 `dashText` 한 곳.
- 테스트: `tests/unit/dashboard/**`, `tests/e2e/dashboard.spec.ts`(시나리오 D — 대시보드에서 스위치를 누르면 가상 보드 LED가 켜지고, 보드 값이 그래프에 쌓인다).

### 9.11 컴퓨터 쪽 흉내 — `serial`·`bluetooth`·`bridge`(P4-02·P4-08·P4-09)

영상처리 실습실(컴퓨터 쪽)의 파이썬이 원고 그대로 `import serial`·`import bluetooth`를 하면 아래 흉내가 받는다. **파일 이름이 곧 import 이름**이다(Pyodide에 없는 패키지 — shims 표를 쓰지 않는다).

| 흉내 | 파이썬 파일 | 화면 쪽 | 통로 |
|---|---|---|---|
| pyserial(`serial.Serial`) | `modules/serial-pc/serial.py` | `modules/serial-pc/index.ts` — 요청 `serial-pc.open` → `{ok, label, notices, error?, reason?: 'closed'|'no-peer'}`, 이벤트 `serial-pc.tx {bytes, baud, category?}` | `vision-bridge`의 선(`getBridgeLink`) — [보내기] 패널이 고른 통로(같은 컴퓨터 탭·USB 데이터 포트·블루투스·MQTT) |
| `bridge`(사이트가 만든 새 예제용) | `modules/vision-bridge/finger-count/bridge.py` | 위와 같은 `serial-pc.tx`(`category` — 값은 `state`, 클릭은 `event`) | 위와 같음. `bridge.send(글)`은 **바뀔 때만** 보내고, 끝 문자는 `\n` 하나, 20바이트 넘으면 안내 |
| 블루투스(`bluetooth`·`bluetooth_lib`) | `modules/ble-pc/{bluetooth,bluetooth_lib}.py` | `modules/ble-pc/index.ts` — 요청 `ble-pc.open`, 이벤트 `ble-pc.tx`, 채널 `ble-pc.rx`·`ble-pc.info` | 같은 **문서**에 가상 보드가 있으면 그 블루투스 칸(창 이벤트 `apc:ble-write`/`apc:ble-notify`, `direct` 통로), 없고 블루투스 칸에서 **실제 보드가 이어져 있으면** 그 통로(`ble`)로 보낸다(2026-09-25 Phase 4 검토 반영 — 뿌리 `data-ble-pc-target` = `virtual`·`real`). 다른 탭의 가상 보드는 남김 |

- 영상처리 ↔ 가상 보드 짝(`vision-bridge/index.ts`의 `BOARD_EXAMPLES`·`BOARD_PAIR_OF`): 3-1-2 키 보내기·얼굴 UART → **3-1-2 사이트판**(`esp32/u3/3-1-2-uart-laser-site.py`, 기본), C3 손가락 개수 → `esp32/u4/c3-neopixel-count-rx.py`. 보드 쪽이 UART 부품 없이 `ble` 부품만 그렸으면 받은 바이트를 `apc:ble-write`로 넣는다(`c3-neopixel-count-rx-ble.py`).
- 한 화면 모드: [한 화면에 가상 보드 열기]가 같은 출처 iframe으로 ESP32 실습실을 열고, 두 문서는 `tab` 통로로 잇는다(접두어는 주소 `?bridge=`). 보드 틀은 [보내기] 패널이 아니라 **입력·출력 칸 바로 아래**로 옮겨 카메라 결과와 가상 보드를 함께 본다(`data-bridge-frame-place="io"`).
- **보드 → 컴퓨터는 바이트 흐름**이라 합치지 않는다(`link.sendStream` — 아직 나가지 않은 앞 조각에 이어 붙여 초당 10회로만 보낸다). 병합(§7.6)은 컴퓨터 → 보드 원본 코드용이고, 같은 열쇠가 **차례 맨 뒤**에 있을 때만 바꿔 끼운다(`BridgeOutbox`).
- **보드 쪽 역할 띠·실행 상태 되알림:** `?bridge=`로 열린 ESP32 실습실은 조작 줄 위에 "이 탭은 보드 쪽이에요 · 먼저 [실행] · 컴퓨터 쪽과 이어졌어요 ●" 띠(`[data-bridge-role-band]`의 `data-running`·`data-peer`)를 보이고, 컴퓨터 쪽이 나타날 때·[실행]이 시작·끝날 때·돌지 않는데 글자가 왔을 때 `idle`·`running`을 알린다(봉투 `uart.status` — 같은 컴퓨터 탭 통로에서만, 데이터로 읽는 쪽은 `isSignalType`으로 거른다). 컴퓨터 쪽은 상태 줄(`data-bridge-board-run`)에 적고, 코드가 도는 중에 `idle`을 받으면 콘솔에 한 번 안내한다.
- [보내기] 패널의 통로 목록은 등록표가 바뀔 때(`onBridgeChannelsChanged`)와 목록에 초점이 올 때 다시 그린다(모듈이 붙는 차례와 상관없이 탭·USB 데이터 포트·블루투스·MQTT가 다 보이게). 영상처리 실습실도 `registerMqttChannel()`을 부른다.
- 테스트: `tests/unit/bridge-serial/**`(링크·보드 UART·실제 Pyodide `serial`·`bridge` 흉내), `tests/e2e/bridge-vision-board.spec.ts`, `tests/e2e/scenario-f.spec.ts`.

### 9.12 가상 BLE — 보드 쪽(P4-03)

7.5의 부품 `ble`와 7.10의 블루투스 줄을 본다. 사이트판 예제(원본이 가상 보드에서 멈추는 까닭을 한 줄씩 고친 것 — 파일 이름 `…-site.py`, 머리말 없음·줄 수 같음·고친 줄 끝 `# [사이트판]`)와
보드 라이브러리 `examples/esp32/lib/third-party/esp32_ble_util.py`(MicroPython 공식 예제 MIT, `sources.yaml`)가 함께 간다. 테스트 `tests/unit/board-ble/**`·`tests/e2e/esp32-ble.spec.ts`.

- 연결 번호는 **비어 있는 가장 작은 번호**를 준다(상대가 하나면 늘 0 — 원본 `ESP32BLE.send()`가 `gatts_notify(0, …)`로 고정해 보내므로, 다시 연결해도 보내기가 닿는다).
- 알림(보드 → 상대)은 가상 MTU 23에서 20바이트로 잘린다 — "기본 MTU(23)에서는"이라고 적고, 실물(Chrome·Windows는 더 크게 정하기도 함)은 부록 B-2 31번에서 확인한다.
- 보드 코드의 반복문에 `sleep`이 없으면 블루투스 값을 받을 틈이 없다(콜백은 입력 확인 지점에서만 돈다 — 7.2). 조작 칸이 넣은 값이 몇 초 동안 소비되지 않으면 칸 아래에 그 까닭을 알린다(`BLE_STARVED_MS`·`bleStarvedText`). 움직임 줄이기 설정이면 상태 LED는 깜빡이지 않고 "광고·깜빡임" 글로 보인다.

### 9.13 실제 기기 잇기 — Web Bluetooth(P4-04)·USB 데이터 포트(P4-05)

| | Web Bluetooth `src/lab/ble/` + 모듈 `web-bluetooth` | USB 데이터 포트 `src/lab/serial/data-port/` + 모듈 `data-port` |
|---|---|---|
| 가져오는 곳 | `src/lab/ble/index.ts` | `src/lab/serial/data-port/index.ts` |
| 통로 id | `ble`(9.6 표) | `serial`(9.6 표) |
| 칸이 열리는 때 | 코드에 `ESP32BLE`·`bluetooth`·`ubluetooth`·`bluetooth_lib`(`BLE_CODE_PATTERN`) 또는 창 이벤트 `apc:web-bluetooth-show` | 코드에 `import serial`·`serial.Serial`·`machine.UART`·`UART(`(`DATA_PORT_CODE_PATTERN`) 또는 `apc:data-port-show` |
| 권한 요청 | [연결] 단추 클릭 안에서만(가짜 블루투스가 `userActivation`을 기록해 검사) | [데이터 포트 연결] 단추 클릭 안에서만 |
| 교실 규칙 | 보드 이름 `ESP32-07`처럼 자리 번호(`checkBoardName`·`suggestBoardName`) — 주소로 연결하지 않는다 | 보드 REPL 포트로 한 줄 보낼 때 제어 바이트 검사(`checkSingleUsbLine`), 속도·이름표 저장(`module:data-port:*`) |
| 문장 | `bleText`(`text.ts`) | `dataPortText`(`text.ts`) |
| 테스트 | `tests/unit/board-ble/web-bluetooth-*.test.ts`, `tests/e2e/web-bluetooth.spec.ts`(가짜 블루투스 8.7) | `tests/unit/serial/data-port-*.test.ts`, `tests/e2e/data-port.spec.ts`(모의 시리얼 8절) |

- ESP32 실습실의 USB 데이터 포트 칸은 코드가 UART를 써도 **[실제 보드] 탭일 때만** 열린다(가상 보드의 UART는 선으로 이어져 실물 포트 단추가 필요 없다 — `showPanelWhenUsed`의 `also`·`watchAttributes`). 영상처리 실습실은 코드가 시리얼을 쓰면 연다.

실물로 확인할 것은 부록 B-2(블루투스 15번·UART 8번 등) — 모의 통과는 실물의 증거가 아니다.

### 9.14 통신 템플릿·통신 블록(P4-10)

- 템플릿 `examples/esp32/templates/{uart-echo,ble-notify,mqtt-pub-sub}.py` — 베껴 쓰는 뼈대(머리말 있음, 사이드카 `title`은 머리말 첫 줄과 같게 — `tests/unit/blocks/comm-templates.test.ts`). 예제 목록 묶음 "통신 템플릿(베껴 쓰는 뼈대 코드)".
- 블록: `src/lab/blocks/comm/index.ts`에서 `installCommBlocks({ Blockly, python, forBlock, generator })`(두 번 불러도 한 번)·`withCommCategory(도구 상자)`·`COMM_BLOCK_PRESETS`·`findCommPreset`. 블록 모드(`kit.ts`·`BlocksPanel.astro`·`mode-ui.ts`)가 통합에서 이것을 부른다. 색은 `theme.ts`의 `apc_comm_blocks`.
- 기본값 한 곳: `COMM_UART`(tx 17·rx 16·9600)·`COMM_BLE_NAME`·`COMM_MQTT`·`COMM_WIFI`·`COMM_TOOLBOX_BROKER_NOTE` — 차시·대시보드가 같은 값을 쓴다.
- 테스트 `tests/unit/blocks/comm-*.test.ts`, `tests/e2e/esp32-comm-blocks.spec.ts`.

### 9.15 4단원 통합 화면 — `/labs/unit4/`(P4-09)

- 한 문서에 영상처리 실습실과 ESP32 실습실(가상 보드)을 함께 둔다(`src/pages/labs/unit4/`, 화면 논리 `src/lab/unit4/`, 가져오는 곳 `index.ts`). 두 번째 뿌리의 id는 `dedupeIdsWithin`으로 꼬리를 붙여 겹치지 않게 한다.
- 짝 예제 표 `examples.ts`의 `PAIRS`(4단원 폴더 밖 예제는 `UNIT4_EXTRA_*`와 페이지 glob에도). [함께 실행]은 보드 코드 → 블루투스 광고 기다리기 → [연결] → 컴퓨터 코드 차례로 돌린다. 한 문서에 실습실 틀이 둘이라 주소의 공유 링크(`#code=`)·`?example=`은 페이지 머리의 인라인 스크립트가 먼저 맡아 두고, `address.ts`의 규칙으로 맞는 칸에 넣는다(`takeAddressStash`·`sideForExampleId`·`guessSideFromCode`).
- 성능: `perf.ts`의 `summarize(samples)` → `reportMarkdown(…)`(fps·메모리 표). 오래 켜 두면 렌더러 메모리가 느는 것은 PROGRESS 미해결.
- 카메라 없이: 재생 입력(동작 10개 — 얼굴 `face-wink` "윙크·두 눈 감기(클릭)"가 클릭을 만든다). 테스트 `tests/e2e/unit4.spec.ts`.
- 느린 학교망(2026-09-25 Phase 4 검토 반영): 준비 단계 글에 두 칸의 받는 양·지난 시간을 싣고(각 칸 준비 모듈이 뿌리에 적는 `data-loading-text`), 컴퓨터 칸이 OpenCV를 아직 받는 중이면 다 받을 때까지 기다린 뒤 컴퓨터 코드를 돌린다. 상태 글이 화면 밖이면 화면 위에 같은 글을 한 줄로 띄운다(`[data-unit4-float]` — [조작 줄 보기]·[닫기]).

### 9.16 예제 갤러리 — `/labs/gallery/`(P4-11)

- 카드·태그는 빌드 때 `src/lab/gallery/cards.ts`의 `buildGallery`가 만든다. **새 예제 `.py` 하나로 카드가 생기고**, 태그 차례는 차시 md → 사이드카(`unit`·`difficulty`·`virtual_ok`·`comm`·`tags`) → 사이트 규칙(`infer.ts` — 폴더 이름의 단원, import 줄의 통신 방식).
- 거르기·낱말 찾기(`filters.ts`)는 빌드와 브라우저가 같은 함수를 쓰고, 고른 것이 주소(`?comm=ble` 등)에 실린다. 사본은 한 장으로 합치고 변형은 "비교해 보기"로 잇는다(`variants.ts`).
- **하드웨어 없이(`virtual_ok`)는 사이트 규칙으로 채운다**(`infer.ts`의 `virtualOkByRule` — 두 실습실 예제는 모두 가상으로 끝까지 되고, 옮긴 ESP32 예제는 예제 스모크가 가상 보드에서 확인한다). 실물에서만 되는 예제는 사이드카에 `virtual_ok: false`. 모두 참이면 거르기 단추 대신 "모두 하드웨어 없이 돼요" 한 줄을 보이고 카드 딱지를 달지 않는다. 난이도는 적은 예제에만 있어 칸 이름에 적은 수를 밝힌다.
- 고를 때마다 칸마다의 개수를 지금 조건으로 다시 센다(그 값을 고르면 몇 개가 되나, 0개면 흐리게 `data-empty`). 고른 결과 개수 줄은 거르기 칸을 보는 동안 화면 아래에 붙어 있고 [결과 보기]로 첫 카드로 건너뛴다. 부품 칸의 블루투스는 "블루투스 부품(상태 LED)"으로 통신 방식 칸과 구별한다.
- 검색 색인은 카드 단위(`src/config/search.ts`의 `anchorPages`에 `/labs/gallery/`). 테스트 `tests/unit/gallery/**`, `tests/e2e/examples-gallery.spec.ts`.
