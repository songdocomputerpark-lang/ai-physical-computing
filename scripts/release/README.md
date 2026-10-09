# 대응 소스 사본 — 운영자 안내(운영자 할 일 26)

## 0. 이게 뭐예요?

사이트는 다른 사람이 만든 프로그램 두 가지를 **고치지 않고 함께 나눠요**.

| 사이트가 나누는 파일 | 안에 든 것 | 라이선스 |
|---|---|---|
| OpenCV 휠(영상 처리 실습의 파이썬 라이브러리)의 `cv2.so` | FFmpeg 4.4.1 | GNU LGPL 2.1 이상 |
| 사이트 검색 엔진 파일 `pagefind/wasm.unknown.pagefind` | pagefind_microjson 0.1.4 | GNU GPL 3.0 |

두 라이선스는 "이 파일을 받은 사람이 **소스(프로그램을 만든 원래 글)**도 받을 수 있게 해 달라"고 해요. 지금은 고지 파일에 적은
**서면 제안**("3년 동안 무료로 드려요, 요청은 저장소 이슈로")으로 대신하고 있어요(DECISIONS C36). 공식 주소에서 소스를 받아
이 저장소의 **GitHub 릴리스**(태그 `license-sources-2026-09`)에 올려 두면, 요청이 와도 그 주소로 바로 답할 수 있고
"받는 곳에서 소스도 받게"라는 조건을 가장 곧이곧대로 지킬 수 있어요(DECISIONS C22·C23·C33).

Claude는 소스 압축 파일을 내려받지 않아요(내려받기 규칙). 그래서 **받기는 운영자 컴퓨터에서 스크립트 한 줄**로 하고,
**올리기는 운영자가 "예"라고 한 뒤** Claude가 해요.

## 1. 운영자가 할 일(한 번, 약 10~20분)

준비: 인터넷이 되는 이 컴퓨터, 빈 공간 1GB쯤(가장 큰 opencv-python 소스가 약 95MB라 모두 합쳐 적어도 110MB — 정확한 크기는 받은 뒤 결과에 나와요). 학교망이 github.com·crates.io·ffmpeg.org·
pythonhosted.org·storage.googleapis.com·download.osgeo.org를 막으면 집 인터넷에서 해요.

1. 파일 탐색기로 **이 저장소 폴더**(`package.json` 파일이 있는 폴더)를 열어요.
2. 탐색기 위쪽 **주소창**을 한 번 누르고, `powershell`이라고 쓰고 Enter를 눌러요. 그 폴더에서 파란 창이 열려요.
3. 아래 한 줄을 붙여 넣고 Enter를 눌러요.

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release\fetch-sources.ps1
   ```

   `-ExecutionPolicy Bypass`는 **이번 한 번만** 이 스크립트를 실행하게 허락하는 것이고, 컴퓨터 설정은 바꾸지 않아요.
4. 기다려요(5~15분). 파일마다 `[3/34] 파일 이름` 줄 다음에 결과가 나와요.
   - **PASS**(초록): 공식 값과 같아요.
   - **RECORD**(하늘색): 공식 값이 없는 GitHub 압축 3개 — 압축 안에 적힌 git 커밋이 목록과 같고 압축이 끝까지 풀리는 것을 확인한 뒤
     받은 파일의 값을 적어 두었어요(정상이에요). 학교망 차단 안내 쪽을 받았거나 받다 끊겼으면 FAIL이 돼요.
   - **FAIL**(빨강): 받지 못했거나 값이 달라요. 그 파일은 남기지 않아요. 잠시 뒤 **같은 명령을 다시** 돌려요
     (이미 받은 파일은 건너뛰어요). 계속 FAIL이면 그 줄을 그대로 Claude에게 알려 주세요.
5. 마지막에 `Summary: 31 PASS, 3 RECORD, 0 FAIL, 0 MISSING`처럼 나오면 끝이에요. Claude에게 **"소스 받기 끝났어요"**라고
   알려 주세요(`===== BEGIN` ~ `===== END` 줄을 붙여 넣어도 돼요). 받은 파일은 `.cache\release-sources\`에 있어요
   (git이 무시하는 폴더라 저장소에 섞이지 않아요).
6. Claude가 결과를 확인하고 릴리스 초안(제목·설명·올릴 파일 목록)을 보여 드려요. **"예"라고 하시기 전에는 아무것도 올리지 않아요.**

받는 파일(목록 `scripts/release/sources-manifest.json` — 34개):

| 무엇 | 파일 | 확인값 |
|---|---|---|
| FFmpeg 4.4.1 소스(휠 빌드가 쓴 GitHub 압축) + 공식 배포본·서명 | `FFmpeg-n4.4.1.tar.gz`, `ffmpeg-4.4.1.tar.xz`, `ffmpeg-4.4.1.tar.xz.asc` | 레시피·Ubuntu 소스 패키지의 SHA-256 |
| FFmpeg를 쓰는 쪽(cv2.so)의 소스: OpenCV·파이썬 연결, 빌드 때 받는 ADE, 함께 연결된 libwebp·libtiff | `opencv-python-4.11.0.86.tar.gz`, `ade-0.1.2e.zip`, `libwebp-1.2.2.tar.gz`, `tiff-4.4.0.tar.gz` | PyPI·레시피의 SHA-256, OpenCV CMake의 MD5 |
| 컴파일러(Emscripten 5.0.3)가 포트로 만들어 cv2.so에 넣은 zlib·libjpeg·libpng | `zlib-1.3.1.tar.gz`, `jpegsrc.v9f.tar.gz`, `libpng-1.6.55.tar.gz` | Emscripten 포트 파일의 SHA-512 |
| 휠을 만든 방법: Pyodide 레시피 커밋과 그 하위 모듈(빌드 도구) | `pyodide-recipes-fc85872….tar.gz`, `pyodide-build-26a30ea….tar.gz` | 공식 값 없음 → 압축 안 git 커밋 확인 후 RECORD |
| 검색 엔진 소스: Pagefind v1.5.2(태그가 아니라 커밋 bf17396 주소로 받아요 — 태그는 옮겨질 수 있어서) | `pagefind-1.5.2.tar.gz` | 공식 값 없음 → 압축 안 git 커밋 확인 후 RECORD |
| 검색 엔진이 쓰는 크레이트 21개(GPL 크레이트 포함, `Cargo.lock` 전부) | `pagefind_microjson-0.1.4.crate` 등 `.crate` 21개 | `Cargo.lock`의 체크섬(= crates.io) |

넣지 않은 것과 까닭: 컴파일러 자체와 그와 함께 나오는 것(Emscripten 5.0.3 본체, Rust nightly와 표준 라이브러리)은 라이선스가 요구하지
않아서 이름과 판만 적어요(목록의 `tools`). Emscripten이 빌드 때 밖에서 받아 cv2.so에 넣는 포트(zlib·libjpeg·libpng)는 "컴파일러와 함께
나오는 것"으로 보기 어려워 소스를 넣었어요(2026-09-29 — 1.1.0 안전 검토, DECISIONS C61). 공식 값을 어디서 가져왔는지는 목록의 `hashSource`
칸에 파일마다 있어요(2026-09-28·29 Claude가 공식 텍스트로 확인 — 두 곳 이상에서 같은 값인지 대조).

## 2. 안 될 때

| 보이는 것 | 뜻 | 할 일 |
|---|---|---|
| `STOP  Run this script from the project root folder` | 파란 창이 다른 폴더에서 열렸어요 | 1번부터 다시(주소창에서 `powershell`) |
| 빨간 글 "스크립트를 실행할 수 없습니다"(PSSecurityException) | 명령에서 `-ExecutionPolicy Bypass`가 빠졌어요 | 위 명령을 그대로 붙여 넣어요 |
| `FAIL … download failed` | 인터넷·학교망이 그 주소를 막았어요 | 잠시 뒤 다시, 안 되면 다른 망에서 |
| `FAIL … sha256 is …, the list says …` | 받는 곳의 파일이 목록과 달라요 | 그 줄을 Claude에게 — 공식 자료를 다시 확인해 목록을 고쳐요 |
| 멈춘 것처럼 오래 조용해요 | 큰 파일(opencv-python 약 95MB)을 받는 중이에요 | 기다려요(진행 막대는 느려져서 껐어요) |

## 3. Claude가 할 일(운영자가 "소스 받기 끝났어요"라고 한 뒤)

아무것도 올리지 않는 준비 단계와, 운영자의 **"예"** 뒤에만 하는 공개 단계로 나뉘어요. 명령은 저장소 뿌리에서 Git Bash로 돌려요
(`gh`가 PATH에 없으면 `"/c/Program Files/GitHub CLI/gh.exe"`).

준비(올리지 않음)
1. `.cache/release-sources/fetch-result.json`을 읽고 FAIL·MISSING이 없는지 본다.
2. RECORD 3개는 `fetch-result.json`의 `commit`이 목록의 `commit`과 같은지(스크립트가 이미 확인했지만 한 번 더 눈으로) 본 뒤,
   그 SHA-256을 목록 `sources-manifest.json`의 `sha256` 칸에 고정하고 `hashSource`에
   `measured by scripts/release/fetch-sources.ps1 on <날짜> (operator PC); git commit checked inside the archive`를 적는다 →
   `npm test`(목록 검사) → 경로를 적어 커밋. 이제부터 이 세 파일도 PASS·FAIL로 확인돼요. **고정하기 전에는 3번(`release-notes.mjs`)과
   `build:offline --sources`가 멈춰요**(고정 전 값은 같은 폴더의 기록과만 대조되기 때문 — DECISIONS C60).
3. `node scripts/release/release-notes.mjs` — 받은 폴더를 목록과 다시 대조하고(`build:offline --sources`와 같은 규칙),
   `.cache/release-sources/release-notes.md`(한국어·영어 설명)를 쓰고, 공개 단계의 명령 세 줄을 찍는다.
   28번(오프라인판) 답이 "예"면 `--offline-zip .cache/offline/apc-offline-<판>.zip`을 붙인다(4절).
4. 운영자에게 제목·파일 수·크기·태그와 설명 요약을 보여 드리고 올려도 되는지 묻는다.

공개(운영자가 "예"라고 한 뒤에만)

5. 3에서 찍힌 `gh release create license-sources-2026-09 … --draft …`(초안 — 아직 아무도 못 봐요).
6. `node scripts/release/release-notes.mjs --check-uploaded` — 초안에 올라간 파일의 이름·크기·SHA-256(GitHub가 적는 digest)을
   받은 폴더와 대조(읽기만). 모두 PASS여야 한다.
7. `gh release edit license-sources-2026-09 --repo songdocomputerpark-lang/ai-physical-computing --draft=false`(공개).
8. 고지 두 파일(`public/licenses/pyodide-wheels-3rd-party.txt` 1절, `public/licenses/pagefind-wasm-3rd-party.txt` 머리 상자)의
   "릴리스에도 사본을 함께 올려 두기로 했어요" 문장에 릴리스 주소
   `https://github.com/songdocomputerpark-lang/ai-physical-computing/releases/tag/license-sources-2026-09`를 적고,
   PROGRESS.md 운영자 할 일 26을 끝남으로 옮긴다.

## 4. 오프라인판 zip(운영자 할 일 28)을 같은 릴리스에 넣을까요?

**권장: 28번 답이 "예"면 같은 릴리스에 넣어요.** LGPL-2.1 6조 d와 GPL-3.0 6조 d는 "실행 파일을 받는 곳에서 소스도 받게"를
요구해요. 같은 릴리스면 zip과 그 안 휠·검색 엔진의 소스가 한 쪽에 있어 가장 곧이곧대로예요(DECISIONS C33).

- 소스와 zip을 한 번에: 3번에 `--offline-zip .cache/offline/apc-offline-<판>.zip`을 붙여요. zip의 SHA-256을 빌드 요약
  (`.cache/offline/apc-offline-<판>.json`)과 대조한 뒤 설명과 명령에 함께 넣어요.
- 소스를 먼저 올렸다면: `gh release upload license-sources-2026-09 .cache/offline/apc-offline-<판>.zip --repo songdocomputerpark-lang/ai-physical-computing`,
  그리고 `--offline-zip`을 붙여 다시 만든 설명으로 `gh release edit … --notes-file .cache/release-sources/release-notes.md`.
- 다음 판의 오프라인판: 목록이 그대로면(사이트가 나누는 Pyodide·OpenCV 휠·Pagefind 판이 같으면) 같은 릴리스에 새 zip을 더해요.
  목록이 바뀌었으면 새 태그(예: `license-sources-2027-03`)로 새 소스와 그 판의 zip을 함께 올려요. 옛 릴리스는 지우지 않아요
  (옛 zip을 받은 사람에게 3년 동안 소스를 줄 약속이 있어요).
- 28번 답이 "아니오"면 소스만 올려요. USB로 나눠 줄 오프라인판에는 소스를 zip 안에 넣을 수 있어요(미해결 211 — zip이 소스 크기만큼, 적어도 110MB 커져요):

  ```
  npm run build:offline -- --sources .cache/release-sources
  ```

  목록의 파일이 모두 있고 값이 맞을 때만 빌드를 시작하고, zip 안 `sources/`에 파일과 `읽어보세요.txt`(한국어·영어)·`SHA256SUMS.txt`를
  넣어요. 옵션이 없으면 zip은 지금과 같아요.

## 5. 판을 올릴 때(유지보수)

사이트가 나누는 Pyodide·OpenCV 휠·Pagefind 판이 바뀌면 `npm test`의 `tests/unit/release/sources-manifest.test.ts`가
"목록이 이 사이트가 나누는 판과 달라요"라고 멈춰요(`build:offline --sources`도 멈춰요). 다른 판의 소스를 싣지 않게 하려는 거예요.

1. 새 판의 공식 텍스트를 읽어 주소·해시를 다시 확인해요(내려받기 없이 — 레시피 태그의 `packages/libffmpeg`·`opencv-python`·
   `libwebp`·`libtiff`의 `meta.yaml`, OpenCV의 `modules/gapi/cmake/DownloadADE.cmake`, PyPI JSON, Pagefind 태그의 `pagefind_web/Cargo.lock`).
2. 크레이트 칸: `node scripts/release/crates-from-lock.mjs <받은 Cargo.lock 파일> --source "<어디서 받은 잠금 파일인지>"` →
   출력한 항목의 `license`(crates.io)·`use`(`wasm` | `build` — 고지 파일 `pagefind-wasm-3rd-party.txt`의 표)를 채워요. 비워 두면 목록 검사가 막아요.
3. `site` 칸, 새 `releaseTag`, `checkedOn`을 고치고 `npm test` → 고지 파일 두 개도 같은 판으로(테스트가 대조해요).
4. 운영자가 1절을 다시 해요 → 새 릴리스.

## 6. 파일

| 파일 | 하는 일 |
|---|---|
| `sources-manifest.json` | 대응 소스 목록 한 곳(주소·공식 해시(SHA-256·SHA-512·MD5)나 git 커밋·근거·라이선스·쓰임, 목록이 가리키는 사이트 판) |
| `fetch-sources.ps1` | 운영자가 돌리는 받기·확인(Windows PowerShell 5.1, **ASCII 글자만** — BOM 없는 한국어는 5.1이 깨뜨려요). `-ListOnly`(목록만)·`-VerifyOnly`(받지 않고 확인만)·`-Force`(다시 받기) |
| `release-notes.mjs` | 받은 폴더 확인 → 릴리스 설명 → 올릴 명령 찍기(올리지 않음), `--check-uploaded`로 올라간 파일 대조 |
| `crates-from-lock.mjs` | `Cargo.lock` → 목록의 크레이트 항목(판 올리기용) |
| `../lib/offline-sources.mjs` | 공통 규칙(목록 검사·폴더 대조·zip 안내 글) — `build:offline --sources`도 씀 |

테스트: `tests/unit/release/`(목록이 사이트 판·고지와 같은지 — 목록의 모든 파일이 고지 두 파일에 있는지, PowerShell 스크립트를 이 컴퓨터 안
작은 서버로 돌려 보기(가짜 git 압축의 커밋 확인·끊긴 압축·웹 쪽 거르기 포함), 릴리스 설명),
`tests/unit/offline/sources.test.ts`(폴더 대조·zip에 넣기).
