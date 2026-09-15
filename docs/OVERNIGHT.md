# 야간 자동 작업 규칙 (클라우드 루틴용)

> 운영자가 노트북을 끈 동안 Anthropic 클라우드에서 **2시간마다**(한국 시각 18·20·22·0·2·4·6시) 실행되는 Claude Code 세션이 따르는 규칙입니다.
> 세션은 이전 대화를 기억하지 못합니다. 이 문서, `CLAUDE.md`, `docs/SPEC.md`, `docs/DECISIONS.md`, `PROGRESS.md`가 기억의 전부입니다.
> 운영자는 자고 있습니다. **질문하느라 멈추지 말고**, `docs/DECISIONS.md` 원칙으로 스스로 결정한 뒤 근거를 기록하세요.

## 0. 시작 절차 (순서대로, 매 실행마다)

1. **시간 확인**: `date -u +%Y-%m-%dT%H:%M:%SZ`. 루틴 프롬프트에 적힌 **종료 시각** 이후면 아무것도 바꾸지 말고 "야간 작업 시간 종료"라고 출력한 뒤 끝낸다. (종료 시각은 루틴을 켤 때마다 프롬프트에 적는다. 이 문서에는 날짜를 고정하지 않는다.)
2. **git 설정과 최신화**
   ```bash
   git config user.name "songdocomputerpark-lang"
   git config user.email "249858253+songdocomputerpark-lang@users.noreply.github.com"
   git fetch origin && git checkout main && git pull --rebase origin main
   ```
3. **잠금 확인**: `.agent/lock.json`이 있고 `heartbeat_at`(없으면 `started_at`)이 **130분 이내**이면 다른 세션이 작업 중이다. 운영자 PC의 로컬 세션(`"holder": "local"`)일 수도 있다. "다른 세션 작업 중"이라고 출력하고 끝낸다. 130분이 넘었으면 이전 세션이 비정상 종료한 것(또는 노트북이 꺼진 것)이므로 이어받고, `PROGRESS.md` 야간 로그에 적는다.
4. **잠금 쓰기**: `.agent/lock.json`에 `{"holder": "cloud", "started_at": "<UTC 시각>", "heartbeat_at": "<UTC 시각>", "plan": "<이번에 할 일 한 줄>"}`을 쓰고, 커밋("야간 작업: 잠금 시작") 후 push한다. push가 거부되면(다른 세션이 먼저 잠금) 끝낸다. 작업 묶음을 커밋할 때마다(적어도 30분마다) `heartbeat_at`을 갱신한다.
5. **시작 시각을 기억한다.** 시작 후 **100분**이 지나면 새 작업을 시작하지 않고 §5 종료 절차로 간다.

## 1. 읽을 것

- `CLAUDE.md` → `docs/SPEC.md`(전체) → `docs/DECISIONS.md` → `PROGRESS.md` → `docs/PLAN.md` → 필요할 때 `docs/INVENTORY.md`, `docs/CODE_MAPPING.md`
- **원본 자료(비공개 저장소)**: `songdocomputerpark-lang/ai-physical-computing-materials`
  - 세션에 함께 체크아웃되어 있으면 그 경로를 쓴다. 찾기: `find / -maxdepth 5 -type d -name 'ai-physical-computing-materials' 2>/dev/null | head`
  - 없으면 `git clone --depth 1 https://github.com/songdocomputerpark-lang/ai-physical-computing-materials.git /tmp/materials`를 시도한다.
  - 둘 다 실패하면 `PROGRESS.md`에 "자료 저장소 접근 실패"를 적고, 자료가 필요 없는 작업(사이트 뼈대, 실습실 엔진, shim, 테스트)만 한다.
  - 자료 구조는 그 저장소의 `README.md`에 있다. 코드 목록은 `extracted/code_index.tsv`, 원고 사진은 `extracted/pdf_images/`.
  - **예제 코드는 `originals/`의 원본 zip에서 옮긴다(PLAN PD-33).** `extracted/flat/`·`extracted/groups/` 사본은 줄 끝이 망가져(`
`) 있어 내용 참고용으로만 쓰고 절대 복사하지 않는다.
  - **자료 저장소는 읽기 전용**이다. 커밋·push하지 않는다.

## 2. 무엇을 할까

- `PROGRESS.md`의 **다음 할 일**부터 시작한다. Phase 순서는 SPEC §11을 따른다.
- 운영자가 모든 Phase 승인을 위임했다(DECISIONS O1). Phase 완료 기준을 스스로 검증해 `PROGRESS.md`에 기록한 뒤 다음 Phase로 넘어간다. 검증하지 못한 기준은 "확인 필요"로 남기고, 막히지 않는 다음 작업으로 넘어간다.
- 한 번 실행할 때 **100분 안에 끝나는 작업 묶음 여러 개**를 한다(묶음 하나는 30분 안팎). 묶음마다 빌드·테스트·커밋·push.
- **오늘 밤 우선순위**
  1. Phase 1 전체: Astro 뼈대, 레이아웃·내비게이션·홈(큰 버튼 3개)·시작하기·용어사전 틀, `sources.yaml` → 출처 페이지 자동 생성(등록 안 된 외부 자료는 빌드 실패), GitHub Actions → Pages 배포
  2. **첫 배포 성공 확인**: `curl -sSfL https://songdocomputerpark-lang.github.io/ai-physical-computing/`가 200인지 확인
  3. Phase 2 최소 버전: 에디터 + Pyodide 워커 + `cv2` 예제 1개 + `# @slider` 규약 → 이어서 PLAN.md 순서대로

## 3. 커밋·push·배포 규칙

- 커밋 메시지는 한국어 "무엇을 왜". 마지막 줄은 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- push 전에 항상 `git pull --rebase origin main`. **force push와 히스토리 재작성은 금지.**
- `main`에 직접 push한다. 권한 문제로 `main` push가 거부되면 `overnight` 브랜치에 push하고 `PROGRESS.md`에 적는다(운영자 PC에서 아침에 병합).
- 배포 워크플로(`.github/workflows/`)는 `.agent/**`, `PROGRESS.md`만 바뀐 push에서는 돌지 않도록 `paths-ignore`를 건다.
- Pages는 운영자 PC의 로컬 세션이 `gh`로 한 번 켠다(PLAN PD-12). `actions/configure-pages`의 `enablement`는 `GITHUB_TOKEN`으로는 켜지지 않으므로 클라우드 세션은 Pages를 켜려고 하지 말고, 꺼져 있으면 `PROGRESS.md`에 "운영자 PC에서 Pages 켜기 필요"라고 적는다.
- 토큰·비밀값을 파일이나 로그에 쓰지 않는다.

## 4. 검증 (CLAUDE.md 작업 규칙과 같음)

- 뼈대가 생긴 뒤에는 `npm run build`가 성공해야 push한다. 단위 테스트가 있으면 `npm test`도 통과해야 한다.
- 브라우저 전용 기능(Pyodide, 카메라, Web Serial, 가상 보드 화면)은 Playwright + Chromium 헤드리스로 확인을 시도한다. 카메라는 가짜 장치 플래그(`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`)를 쓴다.
- 브라우저 설치가 안 되거나 확인하지 못하면 **"완료"라고 쓰지 않는다.** `PROGRESS.md`에 "브라우저 확인 필요"로 남긴다.
- 라이브러리 버전·API·라이선스는 공식 문서로 확인한다(WebSearch/WebFetch). 새 외부 자료는 쓰기 전에 `sources.yaml`에 먼저 등록한다.

## 5. 종료 절차 (시작 후 100분이 되었거나 할 일을 마쳤을 때)

1. `PROGRESS.md` 갱신: 현재 Phase / 완료 / 진행 중 / 다음 할 일(다음 세션이 바로 시작할 수 있게 구체적으로) / 미해결 결정 / **야간 작업 로그**(UTC 시각, 한 일, 커밋 해시, 실패와 원인)
2. `.agent/lock.json` 삭제
3. 커밋("야간 작업: 진행 기록과 잠금 해제") 후 push

## 6. 절대 하지 말 것

- SPEC §2 절대 원칙과 §12 금지 목록 위반(백엔드·DB·로그인, 유료 키, 하드웨어 없이는 못 하는 실습 방치, 설명 없는 전문용어)
- **원본 자료 폴더를 공개 저장소에 통째로 복사하기.** 사이트에 필요한 변환본만 넣는다(DECISIONS C6). 학생 얼굴·이름이 보이는 이미지는 넣지 않는다.
- 다른 저장소(`songdo` 등)나 자료 저장소에 쓰기
- 운영자에게 질문만 남기고 작업 멈추기
