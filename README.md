# AI 피지컬 컴퓨팅 오픈랩(가칭)

설치 없이 브라우저만으로 인공지능(영상 처리)과 피지컬 컴퓨팅(ESP32 보드)을 배우고 실습하는 무료 교육 사이트예요.
2022 개정 교육과정의 교육감 승인 과목 「인공지능과 피지컬 컴퓨팅」 수업을 돕기 위해 만들어요.

- 사이트: https://songdocomputerpark-lang.github.io/ai-physical-computing/
- 저장소: https://github.com/songdocomputerpark-lang/ai-physical-computing
- 문제 알리기·질문: [GitHub Issues](https://github.com/songdocomputerpark-lang/ai-physical-computing/issues) — 누구나 보는 공개 게시판이니 개인정보는 적지 마세요.
- 만든 사람: 박상진·김석전

> 지금은 사이트 뼈대를 만드는 단계예요. 실습실은 차례로 열려요. 진행 상황은 [PROGRESS.md](PROGRESS.md)에 있어요.

## 이 사이트가 지키는 약속

1. **설치 없이** — 파이썬 실행도 보드 연결도 브라우저 안에서 해요.
2. **서버 없이** — 로그인·회원가입이 없고, 실습 기록은 내 브라우저에만 남아요.
3. **보드가 없어도** — 모든 피지컬 실습을 화면 속 가상 보드로 끝까지 할 수 있게 만들어요.
4. **처음 배우는 사람 먼저** — 한 페이지에 한 개념, 어려운 낱말은 바로 풀어요.
5. **저작권 깨끗하게** — 쓰는 외부 자료는 모두 출처 등록부(`sources.yaml`)에 적어요.
6. **고치기 쉽게** — 새 차시는 마크다운 파일 1개와 예제 파일 1개로 더해요.
7. **한국어로** — 화면·문서·오류 설명을 한국어로 써요.

## 폴더 구조

```text
.
├── content/              학습 자료 마크다운(lessons/ 차시, glossary/ 용어사전)
├── examples/             실습 예제 코드(.py)
├── public/               그대로 배포하는 파일(글꼴·그림·시험 파일)
├── src/
│   ├── components/       화면 부품(common/ 공통, credits/ 출처 페이지, search/ 검색 등)
│   ├── config/           설정 한 곳: site.ts(사이트 정보), nav.ts(사이트 지도), search.ts(검색), content-schemas.ts(차시 규칙)
│   ├── layouts/          공통 레이아웃(머리글·바닥글)
│   ├── lib/              주소·조사·마크다운 상자 문법 도우미
│   ├── pages/            페이지(폴더 경로가 곧 주소)
│   └── styles/           디자인 토큰과 전역 스타일
├── scripts/              빌드·검사 스크립트(출처 검사, 저장소 검사)
├── tests/                unit/(Vitest 단위 테스트), e2e/(Playwright 브라우저 테스트)
├── docs/                 계획·결정·자료 분석 문서
├── .github/              배포 워크플로(workflows/)와 이슈 양식(ISSUE_TEMPLATE/)
├── .githooks/            커밋 전 저장소 안전 검사
├── sources.yaml          출처 등록부 → /credits/ 페이지를 자동으로 만든다
├── astro.config.mjs      Astro 설정
├── playwright.config.ts  브라우저 테스트 설정
└── package.json          의존성과 npm 명령
```

원본 수업 자료(교과서 원고 PDF, 코드 압축 파일 등)는 이 저장소에 넣지 않아요. 사이트에 필요한 내용만 `content/`·`examples/`·`public/`으로 옮겨요.

## 명령어

Node.js 22.12.0 이상이 필요해요(권장: 24 LTS). 프로젝트 폴더에서 실행해요.

| 하는 일 | 명령 |
|---|---|
| 의존성 설치(`package-lock.json` 그대로) | `npm ci` |
| 개발 서버 | `npm run dev` → http://localhost:4321/ai-physical-computing/ |
| 빌드(출처 검사·검색 색인 포함, 결과는 `dist/`) | `npm run build` |
| 빌드 결과 미리 보기 | `npm run preview` |
| 타입 검사 | `npm run check` |
| 단위 테스트 | `npm test` |
| 브라우저 테스트(빌드부터 다시 함) | `npm run test:e2e` |
| 출처 검사만 | `npm run check:sources` |
| 저장소 안전 검사(스테이징된 파일) | `npm run check:repo` |
| 사이트 안 링크·그림·#위치 검사(빌드 뒤) | `npm run check:links` |
| 검색 색인만 다시 만들기 | `npm run search:index` |

- 개발 서버에는 검색 색인이 없어요. 사이트 검색은 `npm run build` 뒤 `npm run preview`에서 확인해요.
- AI 에이전트 안에서 `npm run preview`를 실행하면 Astro가 백그라운드 서버로 띄워요. 다 본 뒤 `npx astro preview stop`으로 닫아요.
- `npm ci`(또는 `npm install`)는 커밋 전 저장소 검사 훅도 켜요.

## 배포

`main` 브랜치에 push하면 GitHub Actions의 "사이트 배포" 워크플로가 저장소 안전 검사와 빌드를 한 뒤 GitHub Pages에 올려요.
push와 풀 리퀘스트마다 "테스트" 워크플로(단위 테스트·타입 검사·브라우저 테스트·링크 검사)도 따로 돌아요. 이 워크플로가 실패해도 배포는 막히지 않아요.
차시 추가 방법과 빌드가 실패했을 때 할 일은 [MAINTENANCE.md](MAINTENANCE.md)에 있어요.

## 라이선스

| 대상 | 라이선스 |
|---|---|
| 사이트 프로그램(`src/`·`scripts/`·`tests/`와 사이트가 새로 쓴 소프트웨어, 컴포넌트 안에 코드로 그린 그림 포함) | MIT — [LICENSE](LICENSE) |
| 실습 예제 코드(`examples/` — 교과서·수업 자료에서 옮긴 예제 코드와 사이트판, 사이트가 쓴 예제. `third-party/` 폴더의 다른 저작자 파일은 제외) | MIT — [LICENSE](LICENSE)(운영자 결정 O13, 2026-09-25) |
| 학습 자료(`content/`), 그림 파일(`public/images/`), 가린 편집본 교안(`public/teacher/handouts/`), 안내 문서 | CC BY-NC-SA 4.0 — [LICENSE-CONTENT.md](LICENSE-CONTENT.md) |

**제외 조항:** `sources.yaml`에 개별 표기된 제3자 자료와 공개 라이브러리(`third-party/` 폴더의 파일, 글꼴 등)는 이 두 라이선스에서 제외되고 각자의 원래 조건을 따라요.
목록은 사이트의 [출처와 라이선스](https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/) 페이지와 [제3자 권리 표기 자료 목록](https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/#credits-third-party)에 있어요.

## 기여

- 틀린 곳·사이트 문제·자료 요청은 [이슈 양식](https://github.com/songdocomputerpark-lang/ai-physical-computing/issues/new/choose)으로 알려 주세요.
- 개인정보를 발견하면 그 내용을 옮겨 적지 말고, 페이지 주소와 위치만 알려 주세요.
- 고치거나 보태는 방법과 기여물의 라이선스는 [CONTRIBUTING.md](CONTRIBUTING.md)에 있어요.

## 문서

- [docs/DECISIONS.md](docs/DECISIONS.md) — 운영자 결정 기록
- [docs/PLAN.md](docs/PLAN.md) — 계획서(사이트 지도·기술 스택·단계별 작업)
- [docs/INVENTORY.md](docs/INVENTORY.md), [docs/CODE_MAPPING.md](docs/CODE_MAPPING.md) — 자료 목록과 예제 코드 대응표
- [PROGRESS.md](PROGRESS.md) — 진행 상황
- [MAINTENANCE.md](MAINTENANCE.md) — 유지보수 안내
