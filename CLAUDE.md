# CLAUDE.md

## 프로젝트
AI 피지컬 컴퓨팅 오픈랩(가칭) — 2022 개정교육과정 인공지능·피지컬 컴퓨팅(ESP32) 오픈 교육 사이트.
완전 정적 사이트, 백엔드 없음, GitHub Pages 배포, 전국 무료 배포 목적.

- 전체 요구사항: `docs/SPEC.md` — **세션 시작 시 반드시 읽기.**
- 결정 기록: `docs/DECISIONS.md` — **세션 시작 시 반드시 읽기.** 운영자 결정(승인 위임, 원본 자료 전부 사용 허락 등). SPEC과 충돌하면 이 문서가 우선.
- 진행 상황: `PROGRESS.md` — 세션 시작 시 읽고, 작업 묶음이 끝날 때마다 갱신.
- 계획·자료 분석: `docs/PLAN.md`, `docs/INVENTORY.md`, `docs/CODE_MAPPING.md`
- 클라우드 야간 루틴으로 실행 중이면: `docs/OVERNIGHT.md` 절차를 따른다.
- 원본 자료: **읽기 전용. 절대 수정·삭제 금지.** 사이트에 쓸 것만 골라 `content/`, `examples/`, `public/`으로 변환.
  - 운영자 PC: 프로젝트 루트의 원본 폴더들(`교과서_안/` 등, git 제외)
  - 그 밖(클라우드 등): 비공개 저장소 `songdocomputerpark-lang/ai-physical-computing-materials`(`originals/` 원본, `extracted/` 텍스트·코드·사진 추출본)
- 저장소: https://github.com/songdocomputerpark-lang/ai-physical-computing → Pages https://songdocomputerpark-lang.github.io/ai-physical-computing/

## 절대 원칙 (요약, 상세는 SPEC §2)
1. 설치 제로 — 파이썬은 Pyodide, ESP32는 Web Serial. 브라우저만으로 끝.
2. 서버 제로 — 백엔드·DB·로그인·유료 API 키 추가 금지. 상태는 localStorage.
3. 하드웨어 없어도 100% — 모든 피지컬 실습은 가상 ESP32 보드로 완료 가능. 실제 보드는 같은 코드.
4. 초보자 우선 — 한 페이지 한 개념, 용어 즉시 풀이, 그림(직접 만든 SVG) 우선.
5. 저작권 깨끗 — 외부 자료는 `sources.yaml` 등록 후에만 사용. 애매하면 직접 만든다.
6. 유지보수 쉬움 — 새 차시 = md 1개 + py 1개. 코드 수정 없이 추가 가능해야 함.
7. 한국어 — UI·문서·오류 설명·커밋 메시지는 한국어, 코드 식별자는 영어.

## 기술 스택
확정안 요약. 버전·근거·라이선스 전체는 `docs/PLAN.md` §3.1, 결정 번호(PD)는 부록 A. 버전은 `^` 없이 정확히 고정한다(`.npmrc`의 `save-exact=true`).
- **설치됨(P1-02):** Astro 7.3.2(정적 출력) + TypeScript 6.0.3 + @astrojs/check 0.9.10(TypeScript 7은 이 검사 도구가 받지 않아 보류), Vitest 5.0.0, yaml 2.9.1(등록부 읽기, P1-04). Node.js 22.12.0 이상(운영자 PC 24.19.0).
- **설치됨(공통 기반):** 마크다운 처리기 @astrojs/markdown-remark 7.3.1(unified) + remark-directive 4.0.0 — Astro 7 기본 처리기(Sätteri) 대신 `astro.config.mjs`의 `markdown.processor: unified(...)`로 상자 문법·용어 문법 플러그인을 쓴다. Pagefind 1.5.2(빌드 뒤 `dist/pagefind/` 색인), Pretendard 1.3.9(`public/fonts/pretendard/`, 공식 가변 글꼴 다이내믹 서브셋 파일 그대로), @playwright/test 1.63.0.
- **공통 기반 파일(여러 페이지가 함께 쓰므로 바꿀 때 영향 범위를 확인):** 사이트 지도 `src/config/nav.ts`, 주소 도우미 `src/lib/url.ts`(`withBase()` — 사이트 안 링크는 이것으로만 만든다), 검색 설정 `src/config/search.ts`, 콘텐츠 규칙 `src/config/content-schemas.ts` + `src/content.config.ts`(루트 `content/lessons`·`content/glossary`), 상자 문법 `src/lib/remark-boxes.mjs`(교사용·정답 상자는 검색 색인 제외), 용어 문법 `src/lib/remark-glossary.mjs`(1단계 표시 자리), 디자인 토큰·전역 스타일 `src/styles/`, 공통 레이아웃 `src/layouts/`(BaseLayout·머리글·바닥글). 쓰는 부품은 `src/components/common/`(ComingSoon·Breadcrumb·Callout·PageLinks).
- **Phase 2 실습실 기반(P2-01):** 파이썬 실행기 `src/lab/runtime/` — 화면은 `client.ts`의 `PythonRuntime` 클래스만 쓴다(`load`·`run`·`stop`·`setValue`·`pushEvent`·`writeFile`·`loadPackages`, 이벤트 state·ready·progress·stdout·stderr·notice·request·done). 워커 `worker.ts`(모듈 워커, Pyodide를 `config.ts`의 jsDelivr 주소에서 `import()`), 메시지 형식 `protocol.ts`, 파이썬↔JS 다리 `bridge.ts`, 파이썬 쪽 도우미 `apc_runtime.py`(`block_on`·`sleep`·`input`·`request`·`get`·`poll` — 흉내 모듈은 이 함수만 쓴다). Pyodide 버전·주소·정지 유예(1초)·양보 간격(16ms)은 `config.ts` 한 곳. 브라우저 저장 이름 규칙 `src/lib/storage.ts`(머리말 `ai-physical-computing:`, `clearOurs()`는 이 사이트 이름만 지운다). 개발용 시험 페이지 `src/pages/labs/dev/runtime/`(주소 `/labs/dev/runtime/`, noindex·검색 색인 제외·사이트 지도에 없음, `?limited=1`이면 제한 모드). Node 단위 테스트 `tests/unit/lab/`(실제 Pyodide를 `--experimental-wasm-jspi`로 띄움), 브라우저 테스트 `tests/e2e/lab-runtime.spec.ts`(jsDelivr 접속 필요).
- **Phase 2 실습실 화면(P2-02):** 실습실 공통 틀 `src/components/lab/LabShell.astro`(props `labId`·`examples`·`initialExampleId`, 슬롯 `io`(오른쪽 위 입력·출력)·`panel`(오른쪽 아래 조절 패널)·`after`; 조작 줄 [실행] [정지] [초기화] [예제 불러오기] [공유 링크] [.py 내려받기], 콘솔·`input()` 입력줄, [이 컴퓨터에서 내 기록 지우기]) — 화면 논리는 `src/lab/controls/lab-shell.ts`(페이지는 `getLabController(root)`로 받아 `on('code'|'run'|'done'|…)`, `onRequest(kind, handler)`, `runtime`·`editor`를 쓴다). 코드 에디터 `src/lab/editor/`(CodeMirror 6 부품 조합 `python-editor.ts`, 색·모양 `theme.ts`(차시 코드 블록과 같은 색), 글자 크기 단계 `font-size.ts`). 조작 부품 `src/lab/controls/`(예제 목록 모양 `examples.ts` — 새 예제는 .py 파일 하나를 목록에 넘기면 됨, 자동 저장 `autosave.ts`(`editor:<실습실>:<예제 id>`), 공유 링크 `share-link.ts`(lz-string, `#code=…&ex=…`, 2,000자 경고·16,000자 상한), 내려받기 `download.ts`, 기록 지우기 `records.ts` + `src/components/lab/ClearRecordsButton.astro`(도움말·교사용 페이지에도 있음)). 브라우저 테스트 `tests/e2e/lab-editor.spec.ts`, 도구 `tests/e2e/helpers/lab.ts`. CodeMirror·lz-string 고지 원문은 `public/licenses/`(고지 원문의 저작자 이메일은 `scripts/repo-allowlist.yaml`의 `privacy_exceptions`로만 허용).
- **Phase 2 영상처리 실습실(P2-03):** 페이지 `src/pages/labs/vision/index.astro`(`examples/vision/**/*.py`를 `import.meta.glob(?raw)`으로 읽어 `src/lab/vision/examples.ts`가 `LabExample[]`로 — 새 예제 = 그 폴더에 .py 하나, 첫 줄 주석이 제목·둘째 줄이 설명·파일 이름이 id), 입력·출력 칸 `src/components/lab/VisionIo.astro`(LabShell의 `io` 슬롯), 화면 논리 `src/lab/vision/vision-lab.ts`(`mountVisionLab(root)` — 파이썬 요청 `camera.open`·`read`·`set`·`release`와 이벤트 `window.show`·`open`·`close`, 키 입력 `pushEvent('cv2.keys', 코드)`, 창 닫기 `pushEvent('cv2.window', {name, closed})`, cap.read 초당 15장 제한, 제한 모드는 실행 직전 `setValue('camera.info'·'camera.frame')`), 입력 소스 `sources.ts`(웹캠 getUserMedia 640×480·샘플(코드로 그린 도형)·내 그림 파일, `registerVisionSource()`로 P2-08 재생 입력 추가, 웹캠 실패 시 한국어 이유 + 샘플로 자동 전환), 출력 창 `windows.ts`(창 이름별 캔버스·탭, 키 캡처), 순수 논리 `frame.ts`. **파이썬 쪽 모듈 `src/lab/python/`:** `modules.ts`가 폴더의 .py를 `?raw`로 묶어 워커가 Pyodide FS `/apc`(sys.path 맨 앞)에 씀 — `apc_runtime.py` 도우미(`request`·`emit`·`get`·`poll`·`sleep`·`register_reset_hook`), `apc_shims.py` 등록표(`SHIMS = {'cv2': 'apc_cv2'}`, 워커가 실행 직전 `install_available()`), `apc_cv2.py`(진짜 opencv-python 위에 `VideoCapture`·`imshow`·`waitKey`·`namedWindow`·`getWindowProperty`·`destroyWindow`·`destroyAllWindows` 등 창·카메라 이름만 덮어씀 — Pyodide의 opencv 빌드에는 창 백엔드가 없어 원래는 cv2.error). 새 흉내 모듈 = `apc_<이름>.py` + SHIMS 한 줄 + protocol.ts 머리말에 요청·이벤트 종류. **초기화 함수(`register_reset_hook`)와 `install()`은 워커가 동기 `runPython`으로 부르므로 양보하는 함수(`poll`·`get`·`sleep`·`request`·`block_on`)를 쓰지 않는다(동기 진입점에서는 JSPI 스택 전환이 거부됨) — 쌓인 값을 버릴 때는 `apc_runtime.drain(channel)`(PROGRESS 미해결 25번).** 테스트 `tests/unit/lab/{pyodide-cv2,vision}.test.ts`(Node 실제 Pyodide+OpenCV, 휠은 `.cache/pyodide-packages/`에 캐시), `tests/e2e/lab-vision.spec.ts`(가짜 카메라: `playwright.config.ts`의 `--use-fake-device-for-media-stream`, `tests/e2e/global-setup.ts`가 `scripts/gen-test-video.mjs`로 `.cache/test-camera/synthetic.y4m`(코드로 그린 도형, 커밋 안 함)을 만듦). OpenCV 4.11.0.86은 `sources.yaml`(Apache-2.0, `public/licenses/opencv.txt`).
- **Phase 2 조절 패널·예제 규약(P2-04):** 조절 값 규약 `src/lab/params/`(`parse.ts` 파서 — `이름 = 값  # @slider 최소 최대 간격`·`@select 낱말…`·`@toggle`, 들여쓰기 없는 줄만, 값 글자 위치·int/float·설명·한국어 경고; `panel.ts` 화면 논리 — 코드가 바뀌면 다시 읽고, 조작하면 코드의 그 자리 글자를 바꿔 쓰며(`lab.replaceCode`) 실행 중이면 `runtime.pushEvent('lab.params', {name, value, type})`). HTML `src/components/lab/ParamPanel.astro`는 LabShell `panel` 슬롯의 기본 내용(모든 실습실·시험 페이지에 들어감). 파이썬 쪽 반영: `apc_runtime.py`의 `bind_run_globals`(워커가 실행 직전에 학생 전역 사전을 넘김)·`sync_params`(`block_on` 뒤·`maybe_yield`에서 쌓인 값을 형대로 바꿔 전역 변수에, 양보 없음). **예제 파일 머리말 규약과 파라미터 반영 훅 설명은 `src/lab/README.md`**(`src/lab/controls/example-meta.ts`의 `readExampleMeta`: 제목·설명·`@lesson`·`@tags`·"바꿔볼 것 3가지"·"왜 이런 결과가 나올까" 상자 — 원본에서 옮긴 예제에는 머리말을 넣지 않음). 브라우저 테스트 `tests/e2e/scenario-a.spec.ts`(SPEC §13 시나리오 A, 경과 시간 기록)·`lab-params.spec.ts`, 도구 `tests/e2e/helpers/vision.ts`. 가짜 카메라 영상(`scripts/gen-test-video.mjs`)의 희미한 네모(밝기 100)는 시나리오 A의 임계값 판정용이라 지우지 않는다.
- **Phase 1 화면:** 홈 `src/components/home/`, 배우기 `src/pages/learn/`·`src/components/lesson/`(차시 틀 규칙은 `lesson-html.ts`·`curriculum.ts` 머리말), 용어사전 `content/glossary/`·`src/components/glossary/`, 시작하기·점검 `src/pages/start/`·`src/components/start/`·`src/lib/capabilities.ts`, 브라우저 권장 환경 안내 `src/components/compat/BrowserNotice.astro`(실습실·학생용·보드 준비 페이지의 notice 슬롯), 사이트 검색 화면 `src/components/search/`, 실습실 자리 `src/pages/labs/_labs.ts`, 라이선스 `LICENSE`(MIT)·`LICENSE-CONTENT.md`(CC BY-NC-SA 4.0), 안내 `README.md`·`MAINTENANCE.md`·`CONTRIBUTING.md`.
- **용어 표시:** 새 낱말 = `content/glossary/<영문-이름>.md` 하나. 본문에는 `:용어[낱말]`(조사는 대괄호 밖)을 쓰고, 사전에 없는 낱말은 빌드 경고만 낸다. 마크다운 본문을 보여 주는 페이지는 `GlossaryScope`로 감싼다(용어사전을 빌드마다 새로 읽어 풀이를 붙임 — Astro 콘텐츠 캐시가 remark 결과를 되살리므로 풀이를 remark 단계에서 넣지 않는다).
- **코드 블록 색:** Shiki 테마 `github-light-high-contrast`(`astro.config.mjs`, 코드 글자색 대비 모두 5.04:1 이상).
- **.astro 띄어쓰기 주의:** Astro 7은 줄바꿈이 든 글자와 태그 사이 공백을 지운다. 글 뒤에서 줄을 바꿔 `<a>`·`<strong>`·`<code>`를 쓰거나 `</dt>`·`<dd>`처럼 요소를 이어 쓰면 "알리려면문제"처럼 붙으므로, 줄 끝에 `{' '}`를 붙이거나 한 줄에 적는다(2026-09-16 통합 단계에서 22곳 발견·수정).
- **출처·저장소 검사(P1-04):** `sources.yaml`(출처 등록부) → 빌드 전후 검사와 `/credits/` 자동 생성(다른 저작자 파일은 `third-party/` 폴더 + 항목 따로, 밖에 두면 참고 경고). 커밋 전 훅·CI의 저장소 검사(`scripts/check-repo.mjs`, 허용 목록 `scripts/repo-allowlist.yaml`, 이미지 눈 확인 기록 `scripts/image-allowlist.yaml` — 추적 파일 전체의 래스터 이미지와 글·코드 파일 안 data: 그림, 개인정보 모양: 사용자·OneDrive 경로·MAC·이메일·전화번호, 학교 이름은 `scripts/privacy-needles.json`에 해시로만 두고 `node scripts/privacy-needle.mjs <이름>`으로 만든다. 문서·주석·커밋 메시지에 학교 전체 이름을 적지 않는다). `git commit --no-verify` 금지(노출 전 관문은 훅뿐).
- **글꼴 대체:** `src/styles/fonts.css`의 'Pretendard Fallback'(맑은 고딕을 Pretendard 폭·높이에 맞춤)이 글꼴을 받는 동안 보인다. Pretendard 파일은 고치지 않는다.
- **검색 결과:** 용어사전은 항목 단위(`sub_results`, `src/config/search.ts`의 `anchorPages`). 빌드 뒤 `scripts/prune-pagefind.mjs`가 쓰지 않는 Pagefind 화면 파일을 지운다(다른 라이브러리가 묶여 있어 배포하지 않음).
- **사이트 설정 한 곳:** `src/config/site.ts`(이름·설명·저작자·주소·라이선스·버전) → `astro.config.mjs`가 읽는다. `base: '/ai-physical-computing'`, `trailingSlash: 'always'`(내부 링크는 `import.meta.env.BASE_URL` 뒤에 `/`로 끝나는 경로를 붙인다).
- **파이썬 실행:** Pyodide 314.0.7(모듈 워커) — jsDelivr 고정 주소 + 같은 사이트 예비본(PD-02), 실행 중 입력 전달은 JSPI 기본(PD-01). 설치됨(P2-01): 브라우저는 CDN에서 직접 받고, npm `pyodide@314.0.7`은 타입 선언과 Node 단위 테스트에만 쓰는 devDependency(배포 번들에 없음).
- **비전 AI:** MediaPipe Tasks Vision 0.10.35 고정(PD-03, 1.0.x는 사용 지표 전송 때문에 쓰지 않음).
- **블록·에디터:** Blockly 13.3.0(Python 생성기), CodeMirror 6.
- **ESP32:** Web Serial API + raw REPL 자체 구현, 펌웨어 굽기 esptool-js 0.6.1, 블루투스는 Web Bluetooth.
- **통신:** MQTT.js 5.15.2(WebSocket), 같은 컴퓨터 탭끼리는 BroadcastChannel(PD-17).
- **그 밖:** Pagefind 1.5.2(검색), Pretendard 1.3.9(글꼴, 자체 호스팅), 순수 CSS, Playwright 1.63.0(브라우저 테스트), GitHub Actions → GitHub Pages(배포).
- 아직 설치하지 않은 것은 해당 묶음에서 위 버전으로 설치하고, 배포물에 들어가는 것은 먼저 `sources.yaml`에 등록한다.
- npm 설치 스크립트 허용 목록은 `package.json`의 `allowScripts`(지금은 esbuild만). 새 경고가 나오면 그 패키지를 확인한 뒤 `npm approve-scripts 이름`.

## 명령어
프로젝트 루트에서 실행한다. 운영자 PC 셸에는 Node.js가 PATH에 없을 수 있으니 먼저 붙인다 — Git Bash: `export PATH="/c/Program Files/nodejs:$PATH"`, PowerShell: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`.
- 의존성 설치: `npm ci`(package-lock.json 그대로). 새 패키지는 `npm install 이름@정확한버전`
- 개발 서버: `npm run dev` → http://localhost:4321/ai-physical-computing/
- 빌드: `npm run build`(결과는 `dist/`), 빌드 결과 미리 보기: `npm run preview` → http://localhost:4321/ai-physical-computing/ . Claude 같은 AI 에이전트 안에서 실행하면 Astro 7이 알아서 백그라운드 서버로 띄우므로, 다 보면 `npx astro preview stop`으로 닫는다(`npm run test:e2e`는 앞에서 돌게 막아 두었다)
- 타입 검사: `npm run check`(astro check, 오류 0이어야 한다)
- 단위 테스트: `npm test`(vitest run, `tests/unit/**/*.test.ts`)
- 브라우저 테스트: `npm run test:e2e`(Playwright, `tests/e2e/`) — `npm run build` 뒤 `astro preview`(포트 4329, `PW_PORT`로 바꿈)를 띄워 데스크톱 1366×768·모바일 375×812로 돈다. 브라우저는 Playwright 전용 Chromium이 설치돼 있으면 그것, 없으면 Windows에서 설치된 Microsoft Edge를 쓴다(`PW_CHANNEL=msedge|chrome|chromium`으로 정함). 같은 폴더에서 동시에 두 번 돌리지 않는다(dist/를 새로 빌드함)
- 링크 검사: `npm run check:links` — `dist/`의 사이트 안 링크·그림·글꼴·#위치가 모두 있는지, base(`/ai-physical-computing/`)가 빠진 주소가 없는지 본다(먼저 `npm run build`). 규칙은 `scripts/lib/link-check.mjs` 머리말
- CI: `.github/workflows/deploy.yml`(사이트 배포: 저장소 검사·빌드 → 배포)과 `.github/workflows/e2e.yml`(워크플로 이름 "테스트": push·PR마다 단위 테스트·타입 검사·Playwright 전용 Chromium 브라우저 테스트·링크 검사, 배포를 막지 않음 — PD-35). 코드를 바꾼 묶음은 push 전에 로컬에서 `npm test`·`npm run test:e2e`를 통과시킨다
- 검색 색인만 다시 만들기: `npm run search:index`(`pagefind --site dist`). `npm run build`가 뒤(postbuild)에서 자동으로 돌린다
- 출처 검사: `npm run check:sources` — `npm run build`가 앞(prebuild)에서 자동으로 돌리고, 뒤(postbuild)에서는 배포 번들 의존성을 검사한다. `npx astro build`로 직접 빌드하면 이 검사가 돌지 않는다
- 저장소 검사: `npm run check:repo` — 커밋 전 훅(`.githooks/pre-commit`)과 배포 워크플로가 같은 검사를 한다. 훅은 `npm install`·`npm ci`가 `git config core.hooksPath .githooks`로 켠다(확인: `git config --get core.hooksPath`)
- 오프라인 배포판: `npm run build:offline` — Phase 6에서 추가 예정(아직 없음)

## 작업 규칙
- 계획 → 구현 → 실제 브라우저 테스트 → 보고. 한 번에 한 Phase. (승인은 운영자가 위임함 — `docs/DECISIONS.md` O1. 결정은 근거와 함께 기록하고 진행)
- 브라우저 전용 기능(Pyodide, 카메라, Web Serial)은 브라우저에서 확인하기 전에 "완료"라고 하지 않는다.
- 확실하지 않은 API·패키지·라이선스는 공식 문서로 확인. 추측으로 쓰지 않는다.
- 학생이 보는 모든 문장은 "고1이 처음 읽어도 이해되는가?"로 검토한다.
- 작은 커밋 단위. 커밋 메시지는 한국어로 "무엇을 왜".
