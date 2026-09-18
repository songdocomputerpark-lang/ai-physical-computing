# 이어받기 (계정·대화가 바뀐 뒤)

운영자가 **다른 Claude 계정으로 로그인**하거나 **새 대화**를 열고 "사이트 작업 재개"라고 말했을 때, 새 Claude가 헤매지 않고 이어서 일하기 위한 문서다. 마지막 갱신 2026-09-18(이어받기 실측 반영).

## 0. 먼저 `.cache/resume/STATE.md`를 읽는다 (자동 기록)

사용량 한도에 걸리면 Claude는 "저장하고 정지"조차 할 수 없다. 그래서 `scripts/resume-snapshot.mjs`가 **10분마다** 지금 상태를 `.cache/resume/STATE.md`(git 제외, 이 노트북)에 적어 둔다 — git HEAD·커밋 안 된 파일, 돌고 있는 워크플로의 run id·스크립트 경로·진행 기록 폴더, 단계별 시작·끝·마지막 활동 시각, **끊긴 단계**(결과를 못 남기고 죽은 것)까지. 갑자기 멈춘 자리는 이 파일이 알려 준다.

- 새 대화를 열면 이 파일을 먼저 읽고, 이어서 `PROGRESS.md`를 읽는다. 둘이 어긋나면 `PROGRESS.md`가 맞다(단계가 끝날 때마다 사람이 검토한 기록이다).
- 기록이 멈춰 있으면(마지막 기록이 20분보다 오래됐으면) 다시 띄운다:
  `Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile","-Command","node scripts/resume-snapshot.mjs --watch 600"`
- 한 번만 적어 보려면 `node scripts/resume-snapshot.mjs`.

> **정본은 `PROGRESS.md`다.** 이 문서와 어긋나면 `PROGRESS.md`(특히 "현재 Phase"·"진행 중"·"다음 할 일")가 맞다. 이 문서는 *어디에 무엇이 있고 어떤 순서로 이어받는지*만 적는다.

---

## 1. 먼저 읽을 파일 (이 순서대로)

1. `CLAUDE.md` — 작업 규칙·기술 스택·명령어·파일 위치
2. `docs/SPEC.md` — 요구사항 전문. **공개 저장소에 없다**(학교 이름 때문에 git 제외). 운영자 PC 로컬에만 있다
3. `docs/DECISIONS.md` — 운영자 결정(승인 위임, 원본 자료 전부 사용 허락 등)과 Claude 결정. SPEC과 충돌하면 이 문서가 우선
4. `PROGRESS.md` — 어디까지 했고 다음이 무엇인지, 운영자 할 일, 미해결 목록
5. `docs/PLAN.md` — 해당 Phase 절(§8.1~§8.6)과 그 Phase의 구현 메모

---

## 2. 환경 준비 (같은 노트북, 계정만 바뀐 경우)

```
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm ci
git status --short
git fetch origin
git rev-list --left-right --count main...origin/main
```

- `node_modules`·`dist`·`.astro`·`public/vendor`는 git 제외다. `npm ci` 한 번이면 다시 생긴다(`predev`·`prebuild`가 `public/vendor/`를 채운다).
- **절전 방지:** 앱의 keep-awake(`session_idle`)를 켜고, 이 노트북의 도우미 `%TEMP%\claude_keep_awake.ps1`을 숨김 창으로 실행한다(12시간 동안 대기 절전을 막는다. 덮개를 닫으면 그래도 잠든다).
- 커밋 전 훅은 `npm ci`가 `git config core.hooksPath .githooks`로 켠다. 확인: `git config --get core.hooksPath`.
- **세션 설정:** 모델 **Opus 5**, 노력 **max**, Ultracode 켬(작업은 Workflow로). 워크플로 에이전트도 `effort: 'max'`.
- **push가 멈추면:** 이 PC의 Git Credential Manager가 `credential-manager get`에서 멈추는 일이 있다(2026-09-18). 그 창은 **운영자 화면에만 보이므로 먼저 "깃 승인 창이 떠 있는지" 물어본다** — 승인하면 바로 정상으로 돌아온다. 급하면 멈춘 `git.exe`·`git credential-manager` 프로세스를 끝내고 `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin main`으로 올린다(`gh`는 이미 로그인돼 있다). 커밋은 이미 로컬에 있으니 잃는 것은 없다.
- **자동 기록·절전 방지 도우미**는 계정을 바꿔도 이 노트북에서 계속 돌지만, 노트북을 껐다 켰으면 다시 띄운다(0번, 2번).

---

## 3. 이 노트북에만 있는 것 (git에 없음)

| 어디에 | 무엇 | 없으면 |
|---|---|---|
| `docs/SPEC.md` | 요구사항 전문 | 운영자에게 파일을 요청한다(공개 저장소에 올리지 않는다) |
| 프로젝트 루트의 원본 폴더들 | 교과서 원고·예제·사진 원본(**읽기 전용**) | 비공개 저장소 `songdocomputerpark-lang/ai-physical-computing-materials`의 `originals/`·`extracted/` |
| `.cache/phase3-requests/*.md` | 운영자 실물 확인 결과와 메인 세션 요청(웹캠, 모델·펌웨어) | 이미 반영됨. 남은 항목은 `PROGRESS.md` 미해결 121번 |
| `.cache/models-staging`, `.cache/firmware-staging` | 운영자가 내려받아 검증한 모델 5개·펌웨어 1개 원본 | 이미 `public/models/`·`public/firmware/`에 배치·등록됨. 다시 받으려면 검증 스크립트를 만들어 운영자에게 실행을 부탁한다 |
| `%LOCALAPPDATA%\Temp\claude\C--Users-----Desktop-2026yearwork-2026-9-15---------------------\e6855a12-1c8a-4ecc-8918-e3c58d3d247a\scratchpad\mat` | 원본 자료 추출본(`manifest.json`, 코드 색인 `code_index.tsv` f001~f158, `groups/`, `pdftext/`, 그림 폴더들). 워크플로 args의 `mat` | 비공개 저장소 `extracted/`에서 다시 만든다. `flat/`은 줄바꿈이 깨져 있어 쓰지 않는다 |
| `%USERPROFILE%\.claude\projects\C--Users-----Desktop-2026yearwork-2026-9-15---------------------\memory\` | 메모리(진행 상태·결정 위임·저작권·배포 대상·다운로드 권한) | 이 문서와 `PROGRESS.md`로 대신할 수 있다 |
| `%USERPROFILE%\.claude\projects\C--Users-----Desktop-2026yearwork-2026-9-15---------------------\<세션 id>\` | 대화 기록, 워크플로 스크립트(`workflows\scripts\`), **워크플로 진행 기록**(`subagents\workflows\wf_<run id>\`) | 진행 기록이 없으면 그 워크플로는 처음부터 다시 돈다(몇 시간 손해) |

**계정을 바꿔도 위 파일은 그대로 남는다**(이 노트북의 폴더이고 Claude 계정에 매달려 있지 않다). 그래서 같은 노트북·같은 작업 폴더면 그대로 이어받을 수 있다.

---

## 4. 워크플로 이어받기

Phase 하나는 워크플로(여러 에이전트) 하나로 만든다. 지금까지 쓴 것:

| Phase | run id | 스크립트 (세션 폴더 안) | 상태 |
|---|---|---|---|
| Phase 2 영상처리 실습실 | `wf_a1aac702-2a9` | `workflows\scripts\phase2-vision-lab-wf_a1aac702-2a9.js` | 완료 |
| Phase 3 ESP32 실습실 | `wf_86bbf998-bc6` | `workflows\scripts\phase3-esp32-lab-wf_86bbf998-bc6.js` | 제작·통합까지 끝(검토 도중 정지) |
| Phase 3 검토·수정 (이어받기) | `wf_db55fe07-fd6` | `workflows\scripts\phase3-review-fix-wf_db55fe07-fd6.js` | 완료(2026-09-18) — Phase 3 끝 |

세션 폴더는 `%USERPROFILE%\.claude\projects\C--Users-----Desktop-2026yearwork-2026-9-15---------------------\<세션 id>\`이고, Phase 3을 만든 세션 id는 `a0288169-2eb1-4ca5-9de8-5c263f0d24db`다.

### 끝난 것 — `wf_db55fe07-fd6` (2026-09-18 07:38 → 11:23, Phase 3 마무리)

Phase 3의 **남은 일만** 담은 작은 워크플로다: 적대적 검토 `criteria`(완료 기준 재현)·`ux`(초보자 사용성) 2명이 병렬(포트 4611·4612)로 돌고, 그다음 `fix:final`이 **검토 3명 결과를 모두 받아** 반영 → 전체 검증 → 커밋·push·배포 → `PROGRESS.md` 갱신까지 한다. 앞 세션에서 이미 끝난 `safety` 검토 결과는 스크립트 안에 `SAFETY` 상수로 박혀 있으므로 다시 돌지 않는다. 제작(P3-00~P3-10)과 통합(P3-11)은 이미 `main`에 커밋·배포돼 있어 이 워크플로에 들어 있지 않다.

**이 워크플로는 통째로 재개해도 안전하다** — 위 "주의"의 `build:E2` 사고와 달리, 여기에는 이어 붙인 제작 단계가 없다. 검토 2명은 서로 이어지지 않고 프롬프트가 상수뿐이라 캐시가 그대로 살고, `fix:final`은 프롬프트 자체가 "중간에 멈췄다가 다시 시작될 수 있으니 `git diff`로 이미 고친 것을 대조하고 나머지를 이어서 하라"고 지시하므로 처음부터 다시 돌아도 잃는 것은 시간뿐이고 이미 된 커밋을 망가뜨리지 않는다.

- 스크립트 사본 2개: 세션 폴더의 `workflows\scripts\phase3-review-fix-wf_db55fe07-fd6.js`, 그리고 안전 사본 `.cache\resume\phase3-review-fix-wf_db55fe07-fd6.js`(git 제외, 세션 폴더가 지워져도 남는다).
- args 세 값은 `.cache\resume\RESUME-ARGS.json`에 **글자 그대로** 적어 두었다. 그대로 복사해 쓴다.
- 재개: 진행 기록 `subagents\workflows\wf_db55fe07-fd6`를 새 세션의 같은 자리로 복사 → `Workflow({scriptPath: "<위 스크립트>", resumeFromRunId: "wf_db55fe07-fd6", args: <RESUME-ARGS.json 내용>})`.

**이어받는 순서**

1. `PROGRESS.md` "진행 중"에서 멈춘 단계를 확인한다.
2. 그 워크플로가 **아직 안 끝났으면**: 진행 기록 폴더 `…\a0288169-…\subagents\workflows\wf_86bbf998-bc6`를 **새 세션의 같은 자리**(`…\<새 세션 id>\subagents\workflows\`)로 복사한다. 스크립트 파일도 새 세션의 `workflows\scripts\`로 복사한다.
3. `Workflow({scriptPath: "<복사한 스크립트 경로>", resumeFromRunId: "wf_86bbf998-bc6", args: {…}})`로 재개한다. 끝난 단계는 캐시에서 그대로 돌아오고 안 끝난 단계만 다시 돈다.
4. args는 세 값이다 — `prj`(이 프로젝트 폴더 절대 경로), `mat`(위 표의 추출본 경로), `matrepo`(같은 스크래치패드의 `materials-repo`).

**주의**

- **이어 붙인 단계(`.then(e => stageAgent(… ${JSON.stringify(e)} …))`)는 캐시에서 돌아오지 않는다.** 2026-09-18 실측: `wf_86bbf998-bc6`을 그대로 재개하니 끝나 있던 `build:E2`·`build:F2`가 새 캐시 열쇠로 **다시 돌기 시작했다**(프롬프트에 앞 단계 결과 JSON이 박혀 있어 열쇠가 달라진다). 이미 커밋된 구역을 다시 만드는 셈이라 작업 트리가 더러워질 수 있으니 **바로 멈춘다**(`TaskStop`).
- 그래서 **검토·수정만 남은 자리에서는 통째 재개하지 말고, 끝난 결과를 꺼내 작은 이어받기 워크플로를 새로 쓴다.** 끝난 단계의 결과는 진행 기록 폴더의 `journal.jsonl`에 들어 있다(`started`의 `key`→`label`을 이어 붙여 `result`를 찾는다). 옛 스크립트의 머리(=`meta` 아래 `PRJ`~`brief`, 줄 12~63)를 **그대로** 복사하고 args도 그대로 주면 `COMMON`이 글자까지 같아지므로 에이전트가 받는 맥락이 달라지지 않는다. 남은 단계만 붙이고, 끝난 검토 결과는 상수로 박아 수정 단계에 넘긴다(`phase3-review-fix.js`가 그 예다).
- args는 **글자까지 똑같이** 준다. `prj`·`mat`·`matrepo`가 한 글자라도 다르면 `COMMON`이 바뀌어 모든 캐시가 무효가 된다. 확실하지 않으면 진행 기록의 아무 `agent-*.jsonl` 첫 줄에서 실제로 쓰인 경로를 꺼내 쓴다.
- 스크립트 파일은 **LF 줄바꿈**을 유지한다. CRLF가 섞이면 승인 창이 "control characters" 때문에 거절한다.
- 스크립트의 **COMMON(공통 프롬프트)을 건드리면 모든 에이전트의 캐시가 무효가 된다.** 주의 문구는 *다시 돌릴 단계의 프롬프트에만* 넣는다.
- 중간에 멈춘 단계가 이미 커밋까지 했으면, 그 단계 프롬프트에 "이미 커밋됨(커밋 해시 나열) — 처음부터 다시 만들지 말고 완료 기준만 확인하고 빠진 것만 보완" 주의를 넣고 재개한다.
- 에이전트 안에서 개발 서버는 `ASTRO_DEV_BACKGROUND=1 npm run dev -- --port 44xx`로 띄운다. 한 폴더에 서버는 하나만 뜬다.

**다음은 Phase 4다(Phase 3은 2026-09-18 검토 반영까지 끝났다 — 남은 것은 운영자의 실물 보드 확인뿐).** Phase가 끝났으면 다음 Phase 워크플로를 새로 쓴다. 남은 것은 Phase 4 통신 실습실(`docs/PLAN.md` §8.4, 11개), Phase 5 교육과정 콘텐츠 이관(§8.5, 14개), Phase 6 품질·유지보수(§8.6, 8개). 지금까지 쓴 틀은 **Core 순차 단계 → 병렬 구역(구역마다 고칠 파일을 못 박고 포트 4501~4507, `PW_BASE_URL`로 각자 시험) → 통합 → 적대적 검토 3명 → 수정·배포**이고, 에이전트는 `effort: 'max'`, 공통 프롬프트에 **파일 내려받기 금지**(외부 파일은 운영자만 받는다)를 넣는다.

---

## 5. 어기면 되돌리기 어려운 규칙

- `docs/SPEC.md`를 커밋·공개하지 않는다. 문서·주석·커밋 메시지에 학교 전체 이름을 적지 않는다(`scripts/privacy-needles.json`에 해시로만 둔다).
- `git add .`·`git add -A`·`git commit -a`·`git commit --no-verify` 금지. main 강제 push·역사 고치기 금지. 노출 전 관문은 커밋 전 훅 하나뿐이다.
- 원본 자료 폴더는 **읽기 전용**이고 공개 저장소에 올리지 않는다. 개인정보(얼굴·이름·연락처)는 공개하지 않는다.
- 외부 파일 내려받기는 Claude가 직접 하지 않는다. 공식 출처·크기·해시를 조사해 **검증까지 들어간 PowerShell 스크립트**를 만들고 운영자에게 실행을 부탁한다. 받은 파일은 `.cache/…-staging`에 두고 작업이 끝난 뒤 제자리로 옮긴다.
- 커밋 메시지는 한국어로 "무엇을 왜", 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **승인·선택은 운영자가 위임했다**(`docs/DECISIONS.md` O1). 원본 자료·사진·공동 저자 자료·업체 공개 라이브러리 사용도 이미 허락됐다(O2~O5). 다시 묻지 말고 근거를 기록하고 진행한다. 예외는 사실 확인, 외부 공개, 파일 내려받기다.

---

## 6. 운영자만 할 수 있는 일

`PROGRESS.md`의 "운영자 할 일"이 **유일한 목록**이다. 실물 하드웨어·실제 카메라·휴대폰 확인과 파일 내려받기는 Claude가 대신할 수 없다. 자동 테스트나 모의 장치 통과는 실물의 증거가 아니므로 "완료"로 적지 않는다.

---

## 7. 계정을 바꿀 때 (운영자용 순서)

1. 여유가 있으면 Claude에게 **"저장하고 정지"**(커밋·push·기록 갱신까지 확인). **한도에 걸려 말을 걸 수 없으면 그냥 넘어간다** — 단계마다 커밋·push가 끝나 있고, 0번의 자동 기록이 멈춘 자리를 남긴다.
2. 로그아웃하고 다른 아이디로 로그인한다.
3. **작업 폴더를 이 프로젝트 폴더로 그대로 지정한다**(폴더가 같아야 위 3번 표의 파일들을 쓴다).
4. **"사이트 작업 재개"** 라고 말한다.
5. 새 Claude는 이 문서 1~4번대로 읽고, 진행 기록을 새 세션 폴더로 복사한 뒤 이어서 만든다.

사용량 한도 때문에 바꾸는 경우, **한도에 걸려 멈춘 그때** 바꾸면 버리는 작업이 없다.
