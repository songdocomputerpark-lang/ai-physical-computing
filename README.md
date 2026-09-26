# AI 피지컬 컴퓨팅 오픈랩(가칭)

설치 없이 브라우저만으로 인공지능(영상 처리)과 피지컬 컴퓨팅(ESP32 보드)을 배우고 실습하는 무료 교육 사이트예요.
2022 개정 교육과정의 교육감 승인 과목 「인공지능과 피지컬 컴퓨팅」 수업을 돕기 위해 만들었어요.

## 한눈에

| 무엇 | 어디·어떻게 |
|---|---|
| **사이트** | https://songdocomputerpark-lang.github.io/ai-physical-computing/ |
| **선생님이 먼저 볼 곳** | [교사용 시작하기](https://songdocomputerpark-lang.github.io/ai-physical-computing/start/teacher/) · [교사용 자료실](https://songdocomputerpark-lang.github.io/ai-physical-computing/teacher/) · [학교 네트워크와 브라우저 점검](https://songdocomputerpark-lang.github.io/ai-physical-computing/start/check/) · [보드 준비하기](https://songdocomputerpark-lang.github.io/ai-physical-computing/start/board/) |
| **라이선스** | 학습 자료·그림은 **CC BY-NC-SA 4.0**, 사이트 프로그램과 예제 코드는 **MIT** — 아래 [라이선스](#라이선스) |
| **오프라인판** | 인터넷이 막힌 교실에서 쓰는 묶음(zip, 약 68MB) — `npm run build:offline`으로 만들고, 풀어서 `시작하기.bat`를 두 번 눌러요(Windows 10·11, 설치·관리자 권한 없음 — 이 컴퓨터 안에서만 여는 작은 서버). 만드는 법·쓰는 법은 [MAINTENANCE.md](MAINTENANCE.md) 12절. 받아 쓸 수 있게 릴리스에 올리는 것은 운영자 확인 뒤예요 |
| **문제 알리기·기여** | [이슈 양식 고르기](https://github.com/songdocomputerpark-lang/ai-physical-computing/issues/new/choose) — 누구나 보는 공개 게시판이니 개인정보는 적지 마세요. 자세한 방법은 [CONTRIBUTING.md](CONTRIBUTING.md) |
| **사이트를 고치는 법** | [MAINTENANCE.md](MAINTENANCE.md) — 새 차시는 마크다운 1개 + 예제 1개로 더해요 |
| **바뀐 내용** | [CHANGELOG.md](CHANGELOG.md) — 지금 판은 사이트 바닥글의 "버전"에 보여요 |
| **만든 사람** | 박상진·김석전 |
| **저장소** | https://github.com/songdocomputerpark-lang/ai-physical-computing |

사이트에는 차시 45편(`/learn/`), 영상처리·ESP32·통신 실습실, 대시보드, 4단원 통합 실습실, 예제 갤러리, 파이썬 오류 사전, 교사용 자료실이 있어요. 진행 상황은 [PROGRESS.md](PROGRESS.md)에 있어요.

## 문서

| 문서 | 누구를 위해 | 무엇이 있나 |
|---|---|---|
| [MAINTENANCE.md](MAINTENANCE.md) | 사이트를 고치고 늘리는 선생님 | 차시·예제·그림 더하기, 출처 등록, 배포 확인, 빌드가 실패했을 때, 판 올리기, 도메인 연결, 판 번호, 연 1회 점검 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 알리거나 보태려는 모든 분 | 이슈 양식 4가지, 개인정보 지키기, 고칠 파일 찾기, 풀 리퀘스트, 기여물 라이선스 |
| [CHANGELOG.md](CHANGELOG.md) | 모두 | 판마다 바뀐 것 |
| [LICENSE](LICENSE), [LICENSE-CONTENT.md](LICENSE-CONTENT.md) | 모두 | 라이선스 전문과 적용 범위 |
| [src/lab/README.md](src/lab/README.md) | 실습실 코드를 고치는 개발자 | 조절 막대·예제 머리말·흉내 모듈·가상 보드·통신 규약 |
| [docs/PLAN.md](docs/PLAN.md), [docs/DECISIONS.md](docs/DECISIONS.md) | 개발자 | 계획서(사이트 지도·기술 스택·단계별 작업)와 결정 기록 |
| [docs/INVENTORY.md](docs/INVENTORY.md), [docs/CODE_MAPPING.md](docs/CODE_MAPPING.md) | 개발자 | 원본 자료 목록과 예제 코드 대응표 |
| [PROGRESS.md](PROGRESS.md), [docs/HANDOFF.md](docs/HANDOFF.md) | 운영자·개발자 | 진행 상황·운영자 할 일, 작업을 이어받는 순서 |

## 이 사이트가 지키는 약속

1. **설치 없이** — 파이썬 실행도 보드 연결도 브라우저 안에서 해요.
2. **서버 없이** — 로그인·회원가입이 없고, 실습 기록은 내 브라우저에만 남아요.
3. **보드가 없어도** — 모든 피지컬 실습을 화면 속 가상 보드로 끝까지 할 수 있어요.
4. **처음 배우는 사람 먼저** — 한 페이지에 한 개념, 어려운 낱말은 바로 풀어요.
5. **저작권 깨끗하게** — 쓰는 외부 자료는 모두 출처 등록부(`sources.yaml`)에 적어요.
6. **고치기 쉽게** — 새 차시는 마크다운 파일 1개와 예제 파일 1개로 더해요.
7. **한국어로** — 화면·문서·오류 설명을 한국어로 써요.

## 폴더 구조

```text
.
├── content/              학습 자료: lessons/ 차시(md와 그림 목록), glossary/ 용어사전, help/ 오류 사전·선생님 FAQ, teacher/ 교사용 자료실 데이터
├── examples/             실습 예제 코드(.py): vision/ 영상처리, esp32/ ESP32(lib/ 보드 라이브러리), desktop/ 가상 데스크톱
├── public/               그대로 배포하는 파일: images/ 그림, fonts/ 글꼴, licenses/ 고지 전문, models/ 인식 모델, firmware/ 보드 펌웨어, teacher/ 가린 편집본
├── src/
│   ├── components/       화면 부품(common/ 공통, lesson/ 차시 틀, lab/ 실습실 화면, credits/ 출처 페이지 등)
│   ├── config/           설정 한 곳: site.ts(사이트 정보·주소), nav.ts(사이트 지도), search.ts(검색), content-schemas.ts(차시 규칙), standards.ts(성취기준)
│   ├── lab/              실습실 논리(파이썬 실행기·흉내 모듈·가상 보드·통신) — 안내는 src/lab/README.md
│   ├── layouts/          공통 레이아웃(머리글·바닥글)
│   ├── lib/              주소·조사·마크다운 상자 문법 도우미
│   ├── pages/            페이지(폴더 경로가 곧 주소)
│   ├── styles/           디자인 토큰과 전역 스타일
│   └── sw/               서비스 워커(재방문 캐시)
├── scripts/              빌드·검사 스크립트(출처·저장소·링크·차시 틀 검사, 예제·그림 옮기기)
├── tests/                unit/(Vitest 단위 테스트), e2e/(Playwright 브라우저 테스트)
├── docs/                 계획·결정·자료 분석 문서
├── .github/              워크플로(workflows/), 이슈 양식(ISSUE_TEMPLATE/), 풀 리퀘스트 양식
├── .githooks/            커밋 전 저장소 안전 검사
├── sources.yaml          출처 등록부 → /credits/ 페이지를 자동으로 만든다
├── astro.config.mjs      Astro 설정
├── playwright.config.ts  브라우저 테스트 설정
└── package.json          의존성, npm 명령, 사이트 판(version)
```

원본 수업 자료(교과서 원고 PDF, 코드 압축 파일 등)는 이 저장소에 넣지 않아요. 사이트에 필요한 내용만 `content/`·`examples/`·`public/`으로 옮겨요.

## 명령어

Node.js 22.12.0 이상이 필요해요(권장: 24 LTS). 프로젝트 폴더에서 실행해요.

| 하는 일 | 명령 |
|---|---|
| 의존성 설치(`package-lock.json` 그대로, 커밋 전 훅도 켬) | `npm ci` |
| 개발 서버 | `npm run dev` → http://localhost:4321/ai-physical-computing/ |
| 빌드(출처 검사·검색 색인·서비스 워커 포함, 결과는 `dist/`) | `npm run build` |
| 빌드 결과 미리 보기 | `npm run preview` |
| 타입 검사 | `npm run check` |
| 단위 테스트 | `npm test` |
| 브라우저 테스트(빌드부터 다시 함) | `npm run test:e2e` |
| 접근성 검사·성능 측정(브라우저 테스트 무리) | `npm run test:a11y` · `npm run perf:measure` |
| 차시 틀 검사(엄격 모드) | `npm run check:lessons` · `npm run check:lessons -- 2-1-1` |
| 출처 검사만 | `npm run check:sources` |
| 저장소 안전 검사(스테이징된 파일) · 작업 폴더 전체 · git 기록 전체 · 빌드 결과 | `npm run check:repo` · `npm run check:repo -- --worktree` · `-- --history` · `-- --dist dist` |
| 사이트 안 링크·그림·#위치 검사(빌드 뒤) | `npm run check:links` |
| 검색 색인만 다시 만들기 | `npm run search:index` |
| 원고 그림 보기·꺼내기·검사 | `npm run images:show` · `npm run images:extract` · `npm run images:check` |
| 예제 옮기기·대조 | `npm run examples:import` · `npm run examples:verify` |
| 가린 편집본 교안 만들기·보기·검사·원본 쪽 대조 | `npm run handouts:build` · `npm run handouts:preview` · `npm run handouts:check` · `npm run handouts:compare -- --baseline <옛 편집본 폴더>` |
| 같은 사이트 자산 복사·Pyodide 예비본·서비스 워커만 | `npm run vendor` · `npm run pyodide:fallback` · `npm run sw` |
| 오프라인판 만들기·확인 | `npm run build:offline` · `npm run test:offline` |

- 개발 서버에는 검색 색인이 없어요. 사이트 검색은 `npm run build` 뒤 `npm run preview`에서 확인해요.
- AI 에이전트 안에서 `npm run preview`를 실행하면 Astro가 백그라운드 서버로 띄워요. 다 본 뒤 `npx astro preview stop`으로 닫아요.
- 명령마다 자세한 설명과 실패했을 때 할 일은 [MAINTENANCE.md](MAINTENANCE.md)에 있어요.

## 배포

`main` 브랜치에 push하면 GitHub Actions의 "사이트 배포" 워크플로가 저장소 안전 검사와 빌드를 한 뒤 GitHub Pages에 올려요.
push와 풀 리퀘스트마다 "테스트" 워크플로(단위 테스트·차시 틀 검사·타입 검사·브라우저 테스트·링크 검사)와 "저장소 검사" 워크플로도 따로 돌아요. "테스트"가 실패해도 배포는 막히지 않아요.
배포 결과를 확인하는 법과 빌드가 실패했을 때 할 일은 [MAINTENANCE.md](MAINTENANCE.md) 5·6절에 있어요.

## 라이선스

| 대상 | 라이선스 |
|---|---|
| 사이트 프로그램(`src/`·`scripts/`·`tests/`와 사이트가 새로 쓴 소프트웨어, 컴포넌트 안에 코드로 그린 그림 포함) | MIT — [LICENSE](LICENSE) |
| 실습 예제 코드(`examples/` — 교과서·수업 자료에서 옮긴 예제 코드와 사이트판, 사이트가 쓴 예제. `third-party/` 폴더의 다른 저작자 파일은 제외) | MIT — [LICENSE](LICENSE)(운영자 결정 O13, 2026-09-25) |
| 학습 자료(`content/`), 그림 파일(`public/images/`), 가린 편집본 교안(`public/teacher/handouts/`), 안내 문서 | CC BY-NC-SA 4.0 — [LICENSE-CONTENT.md](LICENSE-CONTENT.md) |

**제외 조항:** `sources.yaml`에 개별 표기된 제3자 자료와 공개 라이브러리(`third-party/` 폴더의 파일, 글꼴 등)는 이 두 라이선스에서 제외되고 각자의 원래 조건을 따라요.
목록은 사이트의 [출처와 라이선스](https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/) 페이지와 [제3자 권리 표기 자료 목록](https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/#credits-third-party)에 있어요.

## 기여

- 틀린 곳·사이트 문제·예제 제안은 [이슈 양식](https://github.com/songdocomputerpark-lang/ai-physical-computing/issues/new/choose)으로 알려 주세요. 실습실 문제라면 [점검 페이지](https://songdocomputerpark-lang.github.io/ai-physical-computing/start/check/)의 [결과 복사] 글을 함께 붙여 주세요.
- 개인정보를 발견하면 그 내용을 옮겨 적지 말고, 페이지 주소와 위치만 알려 주세요.
- 고치거나 보태는 방법과 기여물의 라이선스는 [CONTRIBUTING.md](CONTRIBUTING.md)에 있어요.
