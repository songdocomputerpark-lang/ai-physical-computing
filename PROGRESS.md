# PROGRESS.md — 진행 상황

> 새 세션은 `CLAUDE.md` → `docs/SPEC.md` → `docs/DECISIONS.md` → 이 파일 → `docs/PLAN.md` 순서로 읽는다. 작업 묶음이 끝날 때마다 이 파일을 고친다.

마지막 갱신: 2026-09-15 (운영자 PC 로컬 세션, Phase 0 2차 검토 반영)

## 한눈에 보기

- **지금:** 자료 목록·코드 대응표·계획서를 검토 의견대로 고쳐 Phase 0을 마무리했다. 다음은 문서를 공개 저장소에 올리고 사이트의 뼈대를 만드는 Phase 1이다.
- **운영자 할 일:** 아래 표의 10개이며, 모두 작업을 막지 않는다. 지금 당장 답해야 하는 것은 없다.
- **다음에 볼 수 있는 결과:** Phase 1이 끝나면 https://songdocomputerpark-lang.github.io/ai-physical-computing/ 에 첫 화면이 뜬다.

## 운영자 할 일 (유일한 목록)

다른 문서(PLAN §1.3·§12.1·부록 B-2, INVENTORY §10.8)는 이 표의 번호만 가리킨다. 답이 없으면 오른쪽 기본값으로 계속 진행한다.

| # | 언제 | 무엇을 (예/아니오로 답할 수 있게) | 어떻게 | 답이 없을 때 기본값 |
|---|---|---|---|---|
| 1 | Phase 2 끝 | 운영자 PC 크롬에서 실제 웹캠으로 첫 실습(에지 결과, 슬라이더로 변화)이 되나요? | 사이트 홈 [카메라로 바로 해보기]를 눌러 보고 결과를 한 줄로 알려 주기(약 10분) | 가짜 카메라 자동 테스트까지만 "통과", 실물은 "확인 필요" |
| 2 | Phase 3 끝(약 2시간, 나눠도 됨), Phase 4(약 40분) | 키트 보드로 "실물 점검 도우미"의 항목이 모두 "예"인가요? | `/labs/esp32/check/`에서 항목마다 [보드에 보내기] → 예/아니오 → [결과 복사]한 내용을 붙여 주기(PLAN 부록 B-2, 시간은 추정) | 가상 보드·모의 시리얼 테스트까지만 통과, 핀·프레임·드라이버 사실은 "실물 확인 전" |
| 3 | Phase 1 뒤 | 교실 PC(가능하면 학교 태블릿 한 대 포함)에서 점검 페이지 결과가 모두 "지원"인가요? | `/start/check/`를 열고 [결과 복사](기기당 5~10분) | 안내문 기준. JSPI가 없는 기기는 제한 모드와 블록 전용 호환 모드(PD-27) |
| 4 | 나중에 | 얼굴이 나온 실행 캡처가 운영자·공동 저자 본인인가요? — 교과서 1단원 원고 029·034·035·037·040쪽, 3단원 원고 194·200·202·204·206쪽, 블루투스 교안 p9·p84·p91 | 쪽 번호별로 예/아니오 | 계속 공개하지 않음(손만 잘라 쓰거나 그림으로 대체) |
| 5 | 나중에 | 교과서가 인천광역시교육청 누리집 교육과정정보센터 > 교육감승인과목의 "인공지능과 피지컬 컴퓨팅"(2024.10.04. 등록) 교육과정을 따른 것이 맞나요? 원문 hwp와 대조하려고 그 첨부 파일을 내려받아도 되나요? | 예/아니오 두 개 | 맞는 것으로 보고 성취기준 15개와 차시 대응표 초안(PLAN §2.2)을 쓴다. 파일은 내려받지 않고 게시물 문서뷰어 내용 기준 |
| 6 | 나중에 | 추가 자료가 있나요? 평가·운영계획서, 1단원 03·04와 4단원 원고, 자료에 없는 라이브러리 원본(`servo_library.py`, PWM판 `gorillacell_dcmotors.py`, `ESP32BLE_LIB.py`, OLED 드라이버), II·III 대단원 마무리 정답 | 있으면 빈 폴더 `2022_인피컴_교수,학습운영계획` 등 원본 폴더에 넣고 알려 주기 | 코드와 원고 스크린숏 기준으로 새로 쓴다 |
| 7 | 나중에(클라우드 루틴을 다시 켜기 전에는 필요) | `docs/SPEC.md` 6행의 학교명·직위와 블루투스 교안 표지(p1)의 학교명을 공개 저장소·교사용 편집본에 올려도 되나요? | 예/아니오 | 공개하지 않는다: SPEC.md는 공개 커밋에서 빼고 로컬에만 두며, 편집본 p1은 가린다 |
| 8 | 나중에(P1-10 전이면 좋음) | 교과서·수업 자료에서 옮긴 예제 코드(`examples/`)를 MIT(상업적 이용도 허용)로 넓혀도 되나요? | 예/아니오 | CC BY-NC-SA 4.0(콘텐츠와 같은 조건). 넓히기는 나중에도 되지만 먼저 넓게 공개하면 되돌릴 수 없다. CC FAQ는 소프트웨어에 CC 라이선스를 권하지 않는다는 점도 참고 |
| 9 | P1-03에서 API로 Pages 켜기가 거절될 때만 | 저장소 Settings > Pages > Source에서 "GitHub Actions"를 한 번 골라 주시겠어요? | https://github.com/songdocomputerpark-lang/ai-physical-computing/settings/pages | 워크플로만 만들어 두고 첫 배포 확인은 보류, 나머지 Phase 1 작업은 계속 |
| 10 | 클라우드 야간 루틴을 다시 쓸 때만 | claude.ai/code에서 GitHub 연결을 해 주시겠어요? | claude.ai/code 설정(야간 루틴 저장 실패 HTTP 401의 원인) | 운영자 PC 로컬 세션으로 작업(O8) |

## 현재 Phase

**Phase 0 완료(2차 검토 반영) → Phase 1 시작 전.** 승인은 운영자가 위임했으므로(DECISIONS O1) 기다리지 않고 Phase 1을 바로 시작한다.

## 완료

- Phase 0 산출물: `docs/INVENTORY.md`(자료 20개·코드 158개), `docs/CODE_MAPPING.md`(코드 158개 → 브라우저 실행 매핑, id 누락 없음), `docs/PLAN.md`(정보 구조, 기술 스택, 기술 결정 2건, Phase 1~6 작업 묶음, 위험, 결정 목록 PD-01~PD-37).
- **2차 검토 반영(2026-09-15):** 검토 지적을 하나씩 근거를 확인해 판정하고 세 문서에 반영했다. 주요 내용:
  - 교육과정: 과목 교육과정의 성취기준 15개를 인천광역시교육청 게시물에서 확인해 반영(INVENTORY §9.2), 차시 대응표 초안(PLAN §2.2, PD-21), 진동 모터를 1차 부품으로(PD-36).
  - 예제 이관: 코드 추출 사본은 158개 전부 줄 끝이 손상돼 쓰지 않고 원본 zip에서 옮긴다(PD-33).
  - 공개 안전: 경로 지정 커밋과 저장소 검사(PD-32), 공개 전 문서 점검과 학교명 비공개 기본값(PD-37), BT p5 얼굴 공개 제외, 교사용 자료실은 가린 편집본 PDF(PD-31).
  - 라이선스: 사이트 소프트웨어 MIT / 학습 자료·예제 CC BY-NC-SA 4.0 / 제3자 자료 제외(PD-26), `buzzer.py` 게임 음악 배열 제외, Apache·LGPL 고지 조건 보강.
  - 실습 범위: iPad·휴대폰용 블록 전용 호환 모드(PD-27)와 SPEC 이탈 기록, 카메라 없는 PC용 합성 랜드마크 재생(PD-30), 시나리오 B 입력은 터치 센서(PD-34), f113 레이저 끄기 논리 새로 추가(PD-23), MQTT 안전 규칙(PD-29).
  - 누락 묶음 추가: P1-11 사이트 검색, P3-11 실물 점검 도우미, P4-10 ESP32 통신 템플릿·블록, P4-11 예제 갤러리.
  - 외부 사실 갱신: Android·Firefox Web Serial, Pages 권한(`contents: read`)·REST·한도, 개인정보 안내의 제3자 처리(GitHub Pages·jsDelivr), CH340 자동 설치 가능성, `time_pulse_us`·UART 기본값, mediapipe 판 순서, BroadcastChannel 같은 출처, Teachable Machine 의존성.
- 운영자 결정 기록 `docs/DECISIONS.md`(O1~O8, C1~C9), 야간 규칙 `docs/OVERNIGHT.md`, `CLAUDE.md`, 원본 폴더를 뺀 `.gitignore`(이번 검토에서 고치지 않음).
- 환경: Node.js 24.19.0, GitHub CLI 로그인, 공개 저장소 생성(2026-09-15 확인: 파일 0개, Pages 꺼짐), 비공개 자료 저장소 업로드, Astro 7.3.2 최소 프로젝트가 현재 한글·공백 경로에서 빌드됨.
- 핵심 기술 결정: 실행 중 입력 전달은 JSPI(브라우저가 파이썬을 잠깐 멈췄다 이어 실행하는 기능, PD-01), Pyodide 314.0.7은 jsDelivr + 같은 사이트 예비본(PD-02), MediaPipe Tasks Vision 0.10.35 고정(PD-03), 가상 보드 1차 부품·예제별 배선(PD-05), 브릿지 규약(PD-06).

## 진행 중

- 없음. 프로젝트 루트는 아직 git 저장소가 아니고 공개 저장소에 파일이 없다.

## 다음 할 일 (순서대로 — `docs/PLAN.md` §8.1, §13)

1. **P1-01 저장소 연결과 첫 커밋 — 운영자 PC 로컬 세션에서만.** 문서가 운영자 PC에만 있어 클라우드 세션은 할 수 없다.
   - 먼저 **공개 전 문서 점검**(PD-37): 올릴 파일에서 학교명·기관 계정 경로·사용자 폴더 경로·MAC 주소 형태를 검색하고 결과를 이 파일에 적는다. `docs/SPEC.md`는 6행에 학교명이 있어 운영자 할 일 7번 답 전까지 커밋하지 않는다(SPEC.md는 고치지 않음).
   - 명령은 PLAN §13 그대로: `git init -b main` → 작성자(C5)·`core.longpaths true`·`core.quotepath false` → `.gitattributes`(텍스트 LF) → **파일 이름을 적어** `git add`(`git add .`·`-A` 금지, 원본 폴더·SPEC.md 제외) → `git status --ignored --short`로 **파일이 있는 원본 폴더 7개**가 `!!`인지 확인(빈 폴더 2개는 git이 보여 주지 않음) → `git ls-files`에 원본 경로 0개 → 커밋 → `origin` 연결 → `git push -u origin main`.
   - 완료 확인: `gh api repos/songdocomputerpark-lang/ai-physical-computing/contents`에 문서가 보이고 원본 폴더·SPEC.md가 없다. 이후 작업부터 `.agent/lock.json`(`"holder": "local"`)을 쓴다.
2. **P1-02 Astro 뼈대:** astro 7.3.2 · typescript 6.0.3 · @astrojs/check 0.9.10을 고정 설치 → 가장 작은 빌드 상태 커밋 → 폴더(`content/`, `examples/`, `public/`, `src/`, `scripts/`, `tests/`), `src/config/site.ts`(사이트 이름·저작자·라이선스), `base: '/ai-physical-computing'`, npm 스크립트. 완료: Windows에서 `npm run build`·`npm run check` 통과. **끝나면 `CLAUDE.md`의 "기술 스택"(PLAN §3.1 요약, PD-01~03)·"명령어"(dev/build/check/test) 절을 채운다.**
3. **P1-03 첫 배포:** 로컬 `gh`로 Pages 켜기(`POST /repos/songdocomputerpark-lang/ai-physical-computing/pages`에 `{"build_type":"workflow"}`만. 거절되면 응답을 기록하고 운영자 할 일 9번) → `.github/workflows/deploy.yml`(권한 `contents: read`·`pages: write`·`id-token: write`, checkout v7 → configure-pages v6 → withastro/action v6 → deploy-pages v5, `paths-ignore`: `.agent/**`, `PROGRESS.md`, Playwright는 넣지 않음) → push → `curl -sSfL https://songdocomputerpark-lang.github.io/ai-physical-computing/`가 200인지 확인(**SPEC Phase 1 완료 기준**). `.mjs`·`.wasm` 응답 형식도 `curl -sI`로 확인.
4. **P1-04** `sources.yaml` 틀(분류 `category` 포함) + `public/`·`examples/**`·`content/**`와 번들 의존성 전체에서 미등록·중복 매칭이면 빌드 실패 + 저장소 검사(`scripts/check-repo.mjs`, `.githooks/pre-commit`, CI) + `/credits/` 자동 생성(제3자 권리 표기 목록 포함).
5. **P1-05** 공통 레이아웃·홈(큰 버튼 3개, 흐름 SVG) → 이어서 P1-06~P1-11(PLAN §8.1 표. P1-08 점검 페이지에서 Android Chrome·iPad Safari 실측 기록, P1-10 라이선스 적용 범위·제외 조항, P1-11 사이트 검색).

**모든 묶음의 공통 규칙(PLAN §8.0):** 커밋은 경로 지정, 예제는 원본 zip에서 옮기고 줄 수·구문 대조(추출 사본 `extracted/flat` 금지), 원고·교안 이미지는 한 장씩 눈 확인 기록, 테스트 랜드마크는 합성만 커밋, 코드를 바꾼 묶음은 push 전 Vitest·Playwright 통과.

### 클라우드 세션이 이어받을 때의 전제 (모두 갖춰졌을 때만 `docs/OVERNIGHT.md` 절차를 적용)

1. P1-01로 문서가 원격 `main`에 있다(지금은 저장소가 비어 있어 OVERNIGHT §0-2의 `git checkout main`이 실패한다).
2. 운영자 할 일 10번(claude.ai GitHub 연결)이 끝나 저장 실패(HTTP 401)가 해결됐다.
3. OVERNIGHT §0-1의 종료 시각이 `2026-09-15T23:00:00Z`로 고정되어 있어 이후 실행은 첫 단계에서 끝난다 → 루틴을 다시 켜기 전에 운영자 확인 아래 로컬 세션이 그 줄을 그날 밤 시각으로 고쳐 커밋한다(이번 검토에서는 OVERNIGHT를 고치지 않음).
4. `docs/SPEC.md`가 원격에 없으면(운영자 할 일 7번 답 전) 클라우드 세션은 SPEC을 읽을 수 없다 → 7번 답 뒤에 켜거나, DECISIONS·PLAN만으로 할 수 있는 묶음으로 제한한다.
5. OVERNIGHT §1은 코드 위치로 `extracted/flat`을 적지만 줄 끝이 손상돼 있으므로 PLAN PD-33 규칙(원본 zip `originals/`에서 옮김)을 따른다.
6. Pages가 아직 꺼져 있으면 워크플로만 만들어 두고 여기에 "운영자 PC에서 Pages 켜기 필요"를 적는다(`configure-pages`의 `enablement`는 `GITHUB_TOKEN`으로 안 됨, action.yml 확인).

## 미해결 결정·확인 사항 (Claude 몫, 모두 작업을 막지 않음)

| # | 항목 | 지금 기본값 | 언제 |
|---|---|---|---|
| 1 | 기술 확인: Node에서 Pyodide `run_sync`(P2-01), tasks-vision 0.10.35 모듈 워커 실행(P2-08), glob 로더 루트 `content/`(P1-06) | PLAN 기본안 | 해당 묶음에서 |
| 2 | Android Chrome·iPad Safari의 JSPI·Web Serial 실측 | MDN 호환성 표 기준(JSPI 미지원) | P1-08 |
| 3 | 블록 전용 호환 모드(PD-27) 채택 여부 | 실험 전, 채택 못 하면 §4.6 4번 | P3-06 |
| 4 | 차시 ↔ 성취기준 대응표 확정(PD-21) | 초안 | P5 차시 작성 때(운영자 할 일 5번 반영) |
| 5 | opencv·Pillow 휠에 실제로 들어간 라이브러리와 고지 문구(PD-19, FreeType·IJG 등) | 레시피 기준 추정 | P6-04 |
| 6 | `ESP32BLE.py`가 2black0 구현(MIT)과 같은 코드인지 → MIT 고지 여부 | 제3자 항목으로 등록, 사이트 라이선스 제외 | P4-03 |
| 7 | 진동 모터 사이트 배정 핀 | 스트래핑 핀·차시 사용 핀을 뺀 빈 핀으로 정하고 "실물 확인 전" 표시 | P3-02 |
| 8 | workbox 사전 캐시 기본값(공식 문서 확인 후 PD-11 설정) | 셸만 사전 캐시 | P2-05 |

## 야간 작업 로그

| UTC 시각 | 세션(로컬·클라우드) | 한 일 | 커밋 | 실패와 원인 |
|---|---|---|---|---|
| 2026-09-15T13:30Z | 로컬 | P1-01 공개 전 문서 점검(PD-37): 올릴 9개 파일에서 학교명(`송도`·"○○고등학교" 형태)·사용자 폴더 경로·AppData·MAC 주소·이메일·전화번호 검색 → 실제 노출 0건(검색어 설명 문장 1건, 일반 계정 경로 예시 `C:/Users/COM` 1건만). 인명은 저작자 표기(박상진·김석전)만. `OVERNIGHT.md`의 고정 종료 시각·`extracted/flat` 안내·Pages 켜기 방법을 PLAN §13.1 6·7번대로 고침 | (첫 커밋) | — |
