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
(Phase 0에서 확정 후 기록 — 권장안: Astro + TypeScript, Pyodide, MediaPipe Tasks JS, Blockly, Web Serial + esptool-js, mqtt.js, GitHub Actions → Pages)

## 명령어
(설정 후 기록)
- 개발 서버: `npm run dev`
- 빌드: `npm run build`
- 테스트: `npm test`
- 오프라인 배포판: `npm run build:offline`

## 작업 규칙
- 계획 → 구현 → 실제 브라우저 테스트 → 보고. 한 번에 한 Phase. (승인은 운영자가 위임함 — `docs/DECISIONS.md` O1. 결정은 근거와 함께 기록하고 진행)
- 브라우저 전용 기능(Pyodide, 카메라, Web Serial)은 브라우저에서 확인하기 전에 "완료"라고 하지 않는다.
- 확실하지 않은 API·패키지·라이선스는 공식 문서로 확인. 추측으로 쓰지 않는다.
- 학생이 보는 모든 문장은 "고1이 처음 읽어도 이해되는가?"로 검토한다.
- 작은 커밋 단위. 커밋 메시지는 한국어로 "무엇을 왜".
