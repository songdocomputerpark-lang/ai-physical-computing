// 저장소 검사 본체(PLAN §8.0 PD-32, §9.3, PD-37).
// scripts/check-repo.mjs(커밋 전 훅·CI)와 단위 테스트가 부른다.
//
// 검사 대상은 git 인덱스(스테이징된 내용 = 커밋될 내용)다. CI에서는 내려받은 커밋과 같다.
// 1) 올리면 안 되는 파일: docs/SPEC.md(학교명, PD-37), 원본 자료 폴더 안 파일(C6)
// 2) 원본 형식: .pdf .pptx .hwp .hwpx .zip .pyc, __pycache__ (scripts/repo-allowlist.yaml의 original_formats 제외)
// 3) 5MB 넘는 파일(large_files 허용 목록 제외, 허용해도 max_mb를 넘으면 실패)
// 4) public/ examples/ content/ src/ 안의 원본 파일 이름(원본 zip·PDF·폴더 이름)
// 5) 모든 추적 텍스트 파일(UTF-16으로 저장된 파일 포함)의 개인정보 형태: 사용자 폴더 경로, OneDrive 경로,
//    기기 주소(MAC — 콜론·붙임표·점 모양, 파이썬 bytes 글자, 주소 낱말 옆의 12자리·여섯 바이트 목록 등, 자리표시자 제외 — findDeviceAddresses),
//    이메일 주소(noreply·example 계열 제외), 전화번호 모양,
//    그리고 scripts/privacy-needles.json에 해시로만 적어 둔 비공개 이름(학교명 등, PD-37).
//    예외는 하나뿐이다: public/licenses/ 아래의 제3자 라이선스 고지 원문(저작권 표기에 저작자가 스스로 적은 주소가 들어 있음)은
//    scripts/repo-allowlist.yaml의 privacy_exceptions에 경로·이유를 적으면 이메일 모양 검사만 건너뛴다(2026-09-16 P2-02, CodeMirror MIT 고지).
// 6) 추적 파일 어디에 있든 래스터 이미지의 눈 확인 기록(reviewed). 기록은 두 곳에서 모은다(P5-01, 2026-09-25):
//    차시마다 따로인 그림 목록 content/lessons/**/*.images.yaml(원고 이미지 추출 도구가 file·sha256을 적는다)과
//    옛 공용 기록 scripts/image-allowlist.yaml(차시 밖 그림). 둘 다 git 인덱스(커밋될 내용)에서 읽으므로 기록을 스테이징하지
//    않으면 통과하지 못한다. 기록에 sha256이 있으면 그림 내용과 같아야 한다(눈으로 본 뒤 그림이 바뀌면 다시 봐야 한다).
//    글·코드 파일(SVG·마크다운·Astro·CSS 등) 안에 data: 주소로 넣은 래스터 그림도 그 파일의 기록이 있어야 한다.
// 7) 래스터 이미지 안의 메타데이터(PLAN §9.3 4번): WebP의 EXIF·XMP·ICC 조각, PNG의 eXIf·tEXt·iTXt·zTXt·iCCP·tIME,
//    JPEG의 APP1(EXIF·XMP)·APP2(ICC)·APP13(IPTC)·주석, GIF의 주석·XMP. 확인할 수 없는 형식(avif·tif·heic)도 막는다.
//    보탬(2026-09-26 P6-05 — inspectRasterLeftovers): 그림 끝 뒤에 붙은 바이트, PNG의 모르는 부가 조각(편집기 전용·출처 기록 등),
//    JPEG JFIF 썸네일(가리기 전 모습이 남는 곳), GIF의 글 확장·모르는 응용 확장, BMP 색 프로필(경로 연결 포함), ICO 안 PNG의 메타데이터,
//    형식을 알 수 없는 그림.
// 8) 가린 편집본 PDF(public/teacher/handouts/*.pdf, PD-31·P5-14)의 쪽별 눈 확인 기록: scripts/handout-redactions.yaml(git 인덱스)의
//    documents.*.output.path가 그 파일이고, output.sha256이 파일과 같고, review에 1쪽부터 source.pages쪽까지 모두
//    by·date·result("통과"로 시작)가 있어야 한다(Phase 5 통합 2026-09-25 — 편집본을 다시 만들고 기록을 고치지 않으면 막는다).
//    끝에 출처·라이선스 쪽(credits_page)을 덧붙인 문서는 그 쪽(source.pages + 1)의 기록도 있어야 한다(2026-09-26 P6-04).
//    이 규칙은 Node만으로 돌아 CI에서도 돈다(CI에는 PyMuPDF가 없어 python scripts/redact-handouts.py check는 못 돈다).
// 9) (2026-09-26 Phase 6 안전 검토 반영) 영상·소리 파일은 사람이 보고(듣고) 적은 기록(sha256 포함)이 있어야 하고 바이트도 글처럼 한 번 훑는다,
//    이진 확장자(.bin·.task·.tflite·글꼴·.wasm)는 정해진 자리에만(BINARY_ALLOWED_ROOTS — .bin은 펌웨어 목록의 sha256과도 같아야),
//    예제·차시(examples/·content/)의 와이파이 비밀번호 모양(findWifiSecrets). 개인정보 모양도 넓혔다: 국제 형식·괄호·줄표 전화번호,
//    전각 ＠ 이메일, 네트워크 공유(UNC)·%5C로 적은 사용자 폴더 경로, 기기 주소의 unique_id·fromhex·0x 정수·밑줄·전각 쌍점·EUI-64·표 머리 줄 문맥.
//
// 손으로 돌리는 훑기(2026-09-26 P6-05 개인정보 최종 점검에서 만듦 — 커밋 전 훅·CI에는 걸지 않는다, scripts/check-repo.mjs의 선택):
//  - --worktree: 스테이징 전 작업 폴더 전체(추적 파일 + 새 파일)를 위 규칙 그대로(readWorktreeFiles)
//  - --history: git 기록 전체의 파일 내용(지운 파일 포함 — 공개 저장소는 기록도 공개)을 개인정보·그림 규칙으로(runHistoryCheck).
//    기록은 고칠 수 없으므로, 사람이 보고 개인정보가 아니라고 확인한 blob은 scripts/repo-allowlist.yaml의 history_reviewed에 적는다
//  - --dist <폴더>: 빌드 결과(배포물·오프라인판)에 이 컴퓨터의 절대 경로·개인정보 모양·그림 메타데이터가 없는지(runBuildOutputCheck)
//
// 이 파일의 주석에는 검사에 걸리는 실제 모양(경로·주소·이름)을 적지 않는다. 이 파일도 검사 대상이기 때문이다.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { matchesGlob, validateGlob } from './glob.mjs';
import {
  LEGACY_IMAGE_ALLOWLIST,
  MANIFEST_SUFFIX,
  collectImageRecords,
  inspectImageMetadata,
  isUncheckableRaster,
  reviewedProblem,
  sha256Hex,
} from './lesson-images.mjs';

export const REPO_ALLOWLIST_FILE = 'scripts/repo-allowlist.yaml';
/** 옛 공용 눈 확인 기록(차시 밖 그림). 원고에서 꺼낸 차시 그림의 기록은 각 차시의 그림 목록(P5-01) */
export const IMAGE_ALLOWLIST_FILE = LEGACY_IMAGE_ALLOWLIST;
export const PRIVACY_NEEDLES_FILE = 'scripts/privacy-needles.json';
/** 가린 편집본 PDF의 가릴 곳·쪽별 눈 확인 기록(P5-14)과 편집본을 두는 폴더 */
export const HANDOUT_RECORD_FILE = 'scripts/handout-redactions.yaml';
export const HANDOUT_ROOT = 'public/teacher/handouts/';
export const FORBIDDEN_TRACKED_FILES = Object.freeze(['docs/SPEC.md']);
export const ORIGINAL_FORMAT_EXTENSIONS = Object.freeze(['.pdf', '.pptx', '.hwp', '.hwpx', '.zip', '.pyc']);
/** 5MB 기준(5 × 1024 × 1024바이트) */
export const LARGE_FILE_LIMIT_BYTES = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_MAX_MB = 50;
/** 원본 파일 이름을 찾는 폴더(docs/와 .gitignore는 원본 이름을 설명하므로 뺀다, PLAN §8.0) */
export const ORIGINAL_NAME_SCAN_ROOTS = Object.freeze(['public/', 'examples/', 'content/', 'src/']);

const RASTER_IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.tif', '.tiff', '.heic', '.heif', '.ico',
]);
/**
 * 영상·소리 파일(2026-09-26 Phase 6 안전 검토 지적 6): 얼굴·목소리·촬영자 이름·위치가 담기기 쉬운데 글 검사도 메타데이터 검사도
 * 할 수 없어, 래스터 그림처럼 사람이 끝까지 보고(듣고) 적은 기록(scripts/image-allowlist.yaml — reviewed와 sha256)이 있어야 한다.
 * 지금 저장소에는 하나도 없고, 넣으려면 먼저 이슈로 의논한다(MAINTENANCE 3절·CONTRIBUTING 5절).
 */
const MEDIA_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.mp3', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.flac', '.weba']);
/**
 * 이진 확장자마다 둘 수 있는 자리(그 밖에 두면 막는다). 이진 파일은 글 검사를 건너뛰므로, 이름만 바꾼 글 파일이나 보드 플래시 통째 백업
 * (.bin — 와이파이 이름·비밀번호가 평문으로 들어 있다) 같은 것이 검사를 피하지 못하게 자리를 정한다(2026-09-26 Phase 6 안전 검토 지적 6).
 * 펌웨어(.bin)는 펌웨어 목록(public/firmware/manifest.json)에 적힌 sha256과도 같아야 한다.
 */
const BINARY_ALLOWED_ROOTS = Object.freeze({
  '.bin': ['public/firmware/'],
  '.task': ['public/models/'],
  '.tflite': ['public/models/'],
  '.woff': ['public/fonts/'],
  '.woff2': ['public/fonts/'],
  '.ttf': ['public/fonts/'],
  '.otf': ['public/fonts/'],
  '.wasm': ['public/vendor/'],
});
const FIRMWARE_MANIFEST_FILE = 'public/firmware/manifest.json';
const BINARY_EXTENSIONS = new Set([
  ...RASTER_IMAGE_EXTENSIONS,
  ...ORIGINAL_FORMAT_EXTENSIONS,
  ...MEDIA_EXTENSIONS,
  ...Object.keys(BINARY_ALLOWED_ROOTS),
]);
/** 내용을 읽어 검사하는 파일 크기 한도 */
const MAX_CONTENT_BYTES = 64 * 1024 * 1024;
/**
 * 글·코드 파일 안에 data: 주소로 넣은 래스터 그림(png·jpg·webp 등, SVG는 제외).
 * SVG의 image·feImage(href·xlink:href), CSS의 url(data:…), 마크다운·HTML의 img가 모두 이 모양을 지난다(2026-09-16 검토 반영).
 */
const EMBEDDED_RASTER = /data:image\/(?!svg\+xml)/iu;
const ORIGINAL_DOCUMENT_NAME = /\.(?:pdf|pptx|zip|hwp|hwpx)$/iu;

// 개인정보 형태. 사용자 이름 칸에는 구분자·공백·따옴표·괄호 등이 오지 않는다.
const WINDOWS_USER_DIR = /(?<![A-Za-z0-9])[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)([^\\\/\s"'`<>|?*:;,()[\]{}]+)/giu;
const DRIVE_MOUNT_USER_DIR = /(?<![\w.~%:-])\/(?:mnt\/)?[A-Za-z]\/Users\/([^\\\/\s"'`<>|?*:;,()[\]{}]+)/giu;
const MAC_USER_DIR = /(?<![\w.~%:-])\/Users\/([^\\\/\s"'`<>|?*:;,()[\]{}]+)/gu;
const LINUX_HOME_DIR = /(?<![\w.~%:-])\/home\/([^\\\/\s"'`<>|?*:;,()[\]{}]+)/gu;
/**
 * 네트워크 공유(UNC) 경로의 사용자 폴더 — 역슬래시(또는 빗금) 두 개 + 컴퓨터 이름 + (공유 이름 하나) + Users + 사용자 이름
 * (2026-09-26 Phase 6 안전 검토 지적 10). 인터넷 주소(https://…)의 // 는 앞에 쌍점이 있어 빼고 본다.
 */
const UNC_USER_DIR = /(?<![\\\/\w:])(?:\\\\|\/\/)[^\\\/\s"'`<>|?*:;,()[\]{}]+[\\\/](?:[^\\\/\s"'`<>|?*:;,()[\]{}]+[\\\/])?Users[\\\/]([^\\\/\s"'`<>|?*:;,()[\]{}]+)/giu;
/** %5C(\)·%2F(/)·%3A(:)로 적은 경로(file:///C:%5CUsers%5C… 같은 주소 글자) — 한 번 풀어서 사용자 폴더 경로를 다시 본다 */
const PERCENT_PATH_CHARACTER = /%(?:5c|2f|3a)/iu;
/** 문장 가운데 적힌 OneDrive 폴더도 잡는다(앞에 글자·숫자만 없으면 됨, 뒤에는 폴더 구분자가 온다). */
const ONEDRIVE_DIR = /(?<![A-Za-z0-9])OneDrive(?: ?- ?[^\\/\r\n]{1,80}?)?[\\/]/giu;
/*
 * 기기 주소(MAC) 모양(PLAN §9.3 4번). 콜론·붙임표 말고도 기기 주소가 적히는 모양이 있다(2026-09-25 Phase 4 검토 반영 S8,
 * 2026-09-26 P6-05에서 넓힘 — PROGRESS 미해결 160). MicroPython의 wlan.config('mac')·ble.config('mac')·machine.unique_id()는
 * bytes를 돌려주고, 학생·교사는 그 print 결과나 16진수를 그대로 옮겨 적는다. 파이썬은 bytes를 찍을 때 글자로 보이는 바이트(0x20~0x7E)를
 * 글자 그대로 찍으므로 여섯 바이트가 모두 \x로 나오지는 않는다(ESP32 제조사 번호인 앞 세 바이트에도 글자로 찍히는 바이트가 흔하다).
 *
 * 문맥 없이 잡는 모양(흔한 자료와 헷갈리지 않는 것):
 *  - 두 자리 16진수 여섯 묶음을 콜론이나 붙임표로 이은 것, 네 자리씩 세 묶음을 점으로 이은 것
 *  - bytes 글자(b 뒤 따옴표)를 파이썬 규칙으로 풀어 정확히 6바이트이고 \x 이스케이프가 3개 이상인 것(print 결과·ESP-NOW 짝 주소 코드)
 *  - bytes 글자 안이 16진수 12자리뿐인 것(ubinascii.hexlify 결과)
 * 주소 낱말이 가까이 있을 때만 잡는 모양(I2C 명령·MP3 프레임·색 값·랜드마크 번호 같은 흔한 6바이트·6개 숫자와 헷갈리기 때문이다):
 *  - 모양: 구분자 없는 16진수 12자리(UUID의 한 묶음은 빼고), 두 자리씩 빈칸으로 띄운 정확히 여섯 묶음, 한두 자리씩 콜론으로 이은 여섯 묶음
 *    ('%x'로 찍은 결과), 0x 수 여섯 개의 목록([…]·(…)·bytes([…])·bytearray([…])), 0~255 십진수 여섯 개의 목록(list(mac) 결과),
 *    \x가 한두 개뿐인 6바이트 bytes 글자(\x가 하나도 없이 여섯 글자로 찍힌 것은 값 바로 앞 40자 안에 ①의 낱말이 있을 때만 —
 *    짧은 글자 bytes나 JSON의 "b": 같은 모양과 헷갈리지 않게)
 *  - 문맥: ① 같은 줄 값 앞뒤 80자 안에 기기 주소를 콕 집는 낱말(mac — machine·macro 같은 낱말 속은 빼고 —, bssid, bd_addr,
 *    맥·MAC·기기·블루투스·BLE·보드 주소) ② 같은 줄 값 앞 40자 안에 주소 낱말(addr·address·주소 포함) ③ 바로 윗줄 끝 80자 안에 ①의 낱말
 *    (REPL에서 명령 다음 줄에 결과가 찍히는 모양). 값 앞뒤 80자 안이 I2C·SPI·UART 전송(i2c·spi·uart·writeto·readfrom·writevto·
 *    readinto·eeprom)이면 ①만 본다(I2C 장치 주소를 담은 변수 이름 addr와 헷갈리지 않게) — 문맥 없이 잡는 6바이트 bytes 글자도
 *    이런 자리에서는 ①일 때만 잡는다(장치로 보내는 6바이트 명령과 헷갈리지 않게). 80자로 자르는 것은 JSON에 몰아 담은 예제 코드처럼
 *    한 줄이 아주 긴 글에서 멀리 떨어진 낱말을 문맥으로 잘못 보지 않게 하려는 것이다(빌드 결과 HTML로 확인, 2026-09-26).
 * 보탬(2026-09-26 Phase 6 안전 검토 지적 5): 기기 주소 낱말에 unique_id(ESP32에서는 공장 MAC)·add_peer·espnow·efuse_mac, 주소 낱말에
 * peer(ESP-NOW 짝), 콜론 모양 구분자에 전각 쌍점, 문맥이 있을 때 0x 정수 12자리(11자리)·밑줄로 이은 여섯 묶음, 문맥 없이
 * fromhex·unhexlify·a2b_hex에 넣은 16진수 12자리와 IPv6 링크 로컬 주소 가운데 EUI-64(가운데 ff:fe — MAC에서 만든 주소),
 * 그리고 마크다운 표의 값 줄은 그 표의 머리 줄(첫 줄)을 문맥으로 본다(모둠별 보드 주소 표).
 * 자리표시자로 보는 값: 여섯 바이트가 모두 00이거나 모두 FF, 또는 사이트가 만든 가상 기기 주소 02:00:00:00:00:xx
 * (첫 바이트 02 = "직접 정한 주소" 표시 — 실제 기기에 붙는 번호가 아니다. 가상 보드 network·bluetooth 흉내가 쓴다).
 * 이 설명에 예시 값을 그대로 적지 않는다(검사가 이 파일 자신을 잡는다 — 예시는 tests/unit/repo-check.test.ts에서 조각을 이어 만든다).
 */
// 구분자: 콜론·붙임표, 그리고 전각 쌍점(한국어 입력기로 적은 표 — 2026-09-26 Phase 6 안전 검토 지적 5)
const MAC_ADDRESS = /(?<![0-9A-Fa-f:：-])[0-9A-Fa-f]{2}([:：-])[0-9A-Fa-f]{2}(?:\1[0-9A-Fa-f]{2}){4}(?![0-9A-Fa-f:：-])/gu;
const MAC_DOTTED = /(?<![0-9A-Fa-f.])[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}(?![0-9A-Fa-f.])/gu;
/** 파이썬 bytes 글자 하나(한 줄 안, 따옴표 짝). 안쪽은 decodeBytesBody로 푼다 */
const BYTES_LITERAL = /(?<![A-Za-z0-9_])[bB](['"])((?:\\[^\n]|(?!\1)[^\\\n])*)\1/gu;
const MAC_BARE_HEX = /(?<![0-9A-Za-z_-])[0-9A-Fa-f]{12}(?![0-9A-Za-z_-])/gu;
const MAC_SPACED = /(?<![0-9A-Za-z])(?<![0-9A-Fa-f]{2} )[0-9A-Fa-f]{2}(?: [0-9A-Fa-f]{2}){5}(?! [0-9A-Fa-f]{2}(?![0-9A-Za-z]))(?![0-9A-Za-z])/gu;
const MAC_SHORT_COLON = /(?<![0-9A-Za-z:])[0-9A-Fa-f]{1,2}(?::[0-9A-Fa-f]{1,2}){5}(?![0-9A-Za-z:])/gu;
const MAC_HEX_LIST = /(?<![0-9A-Za-z_])(?:bytes(?:array)?\(\s*)?[[(]\s*0x[0-9A-Fa-f]{1,2}(?:\s*,\s*0x[0-9A-Fa-f]{1,2}){5}\s*,?\s*[\])]\)?/giu;
const MAC_DECIMAL_LIST = /[[(]\s*\d{1,3}(?:\s*,\s*\d{1,3}){5}\s*,?\s*[\])]/gu;
/** 정수로 적은 주소(hex(int.from_bytes(mac, 'big')) 결과 — 앞 0이 빠지면 11자리) — 문맥이 있을 때만(2026-09-26 Phase 6 안전 검토 지적 5) */
const MAC_HEX_INTEGER = /(?<![0-9A-Za-z_])0x[0-9A-Fa-f]{11,12}(?![0-9A-Za-z_])/gu;
/** 두 자리 여섯 묶음을 밑줄로 이은 것(변수 이름·파일 이름에 넣은 주소) — 문맥이 있을 때만 */
const MAC_UNDERSCORE = /(?<![0-9A-Za-z_])[0-9A-Fa-f]{2}(?:_[0-9A-Fa-f]{2}){5}(?![0-9A-Za-z_])/gu;
/** bytes.fromhex·unhexlify·a2b_hex에 넣은 16진수 12자리(ESP-NOW 짝 주소를 적는 흔한 모양) — 문맥 없이 */
const MAC_FROMHEX = /(?:fromhex|unhexlify|a2b_hex)\(\s*(['"])([0-9A-Fa-f]{2}(?:[:\s-]?[0-9A-Fa-f]{2}){5})\1\s*\)/giu;
/** IPv6 링크 로컬 주소 가운데 EUI-64(가운데 ff:fe — 기기 MAC에서 만든 주소)인 것 — 문맥 없이 */
const IPV6_LINK_LOCAL = /(?<![0-9A-Fa-f:])fe80:(?::[0-9A-Fa-f]{0,4}){2,7}(?![0-9A-Fa-f:])/giu;
const EUI64_MIDDLE = /[0-9A-Fa-f]{0,2}ff:fe[0-9A-Fa-f]{2}/iu;
/**
 * 기기 주소를 콕 집는 낱말(같은 줄 어디든, 바로 윗줄). ESP32의 machine.unique_id()는 공장 기본 MAC 6바이트다
 * (MicroPython v1.29.0 ports/esp32/modmachine.c — esp_efuse_mac_get_default, 2026-09-26 Phase 6 안전 검토 지적 5).
 */
const DEVICE_ADDRESS_WORD = /(?<![a-z])mac(?![a-z])|bssid|(?<![a-z])bd_?addr|unique_?id|add_peer|espnow|efuse_mac|(?:맥|mac|기기|블루투스|ble|보드)\s*주소/iu;
/** 주소 낱말(같은 줄 값 앞 40자 안) — I2C 장치 주소도 이렇게 부르므로 전송 줄에서는 보지 않는다. peer는 ESP-NOW 짝 주소 변수 이름 */
const ADDRESS_WORD = /(?<![a-z])mac(?![a-z])|addr|bssid|주소|(?<![a-z])peer(?![a-z])/iu;
const BUS_TRANSFER_WORD = /(?<![a-z0-9_])(?:i2c|spi|uart|writeto(?:_mem)?|readfrom(?:_mem_into|_mem|_into)?|writevto|readinto|eeprom)(?![a-z0-9_])/iu;
/** 파이썬 bytes 글자의 한 글자 이스케이프 → 바이트 */
const BYTES_SIMPLE_ESCAPES = Object.freeze({ '\\': 0x5c, "'": 0x27, '"': 0x22, n: 0x0a, r: 0x0d, t: 0x09, a: 0x07, b: 0x08, f: 0x0c, v: 0x0b });

/**
 * 파이썬 bytes 글자 안쪽을 바이트로 푼다(\xHH·8진수·한 글자 이스케이프, 그 밖의 ASCII 글자 하나 = 한 바이트).
 * 7바이트가 넘거나 풀 수 없는 글자가 있으면 null(기기 주소 후보가 아니다).
 * @param {string} body
 * @returns {{ bytes: number[], hexEscapes: number } | null}
 */
function decodeBytesBody(body) {
  /** @type {number[]} */
  const bytes = [];
  let hexEscapes = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (bytes.length > 6) return null;
    const char = body[index];
    if (char !== '\\') {
      const code = char.charCodeAt(0);
      if (code < 0x20 || code > 0x7e) return null;
      bytes.push(code);
      continue;
    }
    const next = body[index + 1] ?? '';
    const hex = /^x([0-9A-Fa-f]{2})/u.exec(body.slice(index + 1, index + 4));
    if (hex) {
      bytes.push(parseInt(hex[1], 16));
      hexEscapes += 1;
      index += 3;
      continue;
    }
    const octal = /^[0-7]{1,3}/u.exec(body.slice(index + 1, index + 4));
    if (octal) {
      bytes.push(parseInt(octal[0], 8) & 0xff);
      index += octal[0].length;
      continue;
    }
    if (Object.hasOwn(BYTES_SIMPLE_ESCAPES, next)) {
      bytes.push(BYTES_SIMPLE_ESCAPES[/** @type {keyof typeof BYTES_SIMPLE_ESCAPES} */ (next)]);
      index += 1;
      continue;
    }
    return null;
  }
  return bytes.length === 6 ? { bytes, hexEscapes } : null;
}

/**
 * bytes 글자 안쪽이 6바이트이면 푼 결과. JS·JSON 글자 안에 한 번 더 이스케이프해 적은 것(\\x…)도 한 번 풀어 본다.
 * @param {string} body
 */
function decodeSixBytes(body) {
  const direct = decodeBytesBody(body);
  if (direct || !body.includes('\\\\')) return direct;
  return decodeBytesBody(body.replace(/\\\\/gu, '\\'));
}

/**
 * 16진수 두 자리씩(구분자는 무시) 바이트로.
 * @param {string} text
 * @returns {number[]}
 */
function hexPairs(text) {
  return (text.replace(/[^0-9A-Fa-f]/gu, '').match(/[0-9A-Fa-f]{2}/gu) ?? []).map((pair) => parseInt(pair, 16));
}

/**
 * 자리표시자 주소인지: 모두 00, 모두 FF, 사이트 가상 주소 02:00:00:00:00:xx.
 * @param {number[]} bytes
 */
function isPlaceholderAddress(bytes) {
  return (
    bytes.every((value) => value === 0) ||
    bytes.every((value) => value === 0xff) ||
    (bytes[0] === 0x02 && bytes.slice(1, 5).every((value) => value === 0))
  );
}

/** 같은 줄에서 문맥 낱말을 찾는 거리(값 앞뒤 글자 수). 한 줄이 아주 긴 글(JSON에 몰아 담은 예제 코드, 긴 문단)에서 멀리 떨어진 낱말을 잡지 않게 */
const CONTEXT_WINDOW = 80;
/** 주소 낱말·(여섯 글자로만 찍힌 bytes의) 기기 주소 낱말을 찾는 값 앞 거리 */
const NEAR_BEFORE = 40;

/**
 * 값(start~end) 둘레의 기기 주소 문맥(위 설명의 ①②③).
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {{ device: boolean, deviceBefore: boolean, bus: boolean, near: boolean }}
 *   device = 같은 줄 값 앞뒤 80자 안에 기기 주소 낱말, deviceBefore = 값 바로 앞 40자 안에 그 낱말,
 *   bus = 같은 줄 값 앞뒤 80자 안에 I2C·SPI·UART 전송 낱말, near = 윗줄 끝 80자 안의 기기 주소 낱말이나 값 앞 40자 안의 주소 낱말
 */
function addressContext(text, start, end) {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newline = text.indexOf('\n', end);
  const lineEnd = newline < 0 ? text.length : newline;
  const before = text.slice(Math.max(lineStart, start - CONTEXT_WINDOW), start);
  const around = `${before} ${text.slice(end, Math.min(lineEnd, end + CONTEXT_WINDOW))}`;
  const nearBefore = text.slice(Math.max(lineStart, start - NEAR_BEFORE), start);
  const previousLineStart = lineStart > 0 ? text.lastIndexOf('\n', lineStart - 2) + 1 : 0;
  const previousLine = lineStart > 0 ? text.slice(Math.max(previousLineStart, lineStart - 1 - CONTEXT_WINDOW), lineStart - 1) : '';
  return {
    device: DEVICE_ADDRESS_WORD.test(around) || DEVICE_ADDRESS_WORD.test(markdownTableHeader(text, lineStart)),
    deviceBefore: DEVICE_ADDRESS_WORD.test(nearBefore),
    bus: BUS_TRANSFER_WORD.test(around),
    near: DEVICE_ADDRESS_WORD.test(previousLine) || ADDRESS_WORD.test(nearBefore),
  };
}

/** 마크다운 표로 보는 줄(앞 빈칸 뒤 | 로 시작) */
const TABLE_ROW = /^\s*\|/u;

/**
 * 값이 마크다운 표의 값 줄에 있으면 그 표의 머리 줄(표의 첫 줄) 글, 아니면 ''. 모둠별 보드 주소 표처럼 "블루투스 주소"·"MAC"이
 * 머리 줄에만 있고 값 줄 바로 윗줄은 |---| 구분 줄이라, 윗줄만 보는 문맥으로는 놓쳤다(2026-09-26 Phase 6 안전 검토 지적 5).
 * 표가 아주 길어도 멈추도록 위로 200줄까지만 본다.
 * @param {string} text
 * @param {number} lineStart 값이 있는 줄의 시작 위치
 */
function markdownTableHeader(text, lineStart) {
  const lineEnd = text.indexOf('\n', lineStart);
  const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
  if (!TABLE_ROW.test(line)) {
    return '';
  }
  let headerStart = lineStart;
  for (let steps = 0; steps < 200 && headerStart > 0; steps += 1) {
    const previousStart = text.lastIndexOf('\n', headerStart - 2) + 1;
    const previous = text.slice(previousStart, headerStart - 1);
    if (!TABLE_ROW.test(previous)) {
      break;
    }
    headerStart = previousStart;
  }
  if (headerStart === lineStart) {
    return '';
  }
  const headerEnd = text.indexOf('\n', headerStart);
  return text.slice(headerStart, headerEnd < 0 ? text.length : headerEnd);
}

/**
 * 문맥이 있어야 잡는 모양(12자리·빈칸 묶음·목록·\x 한두 개의 bytes 글자)을 잡을지: 같은 줄 가까이 기기 주소 낱말이 있거나,
 * 전송 줄이 아니면서 윗줄·값 앞에 주소 문맥이 있을 때.
 * @param {ReturnType<typeof addressContext>} context
 */
function contextCounts(context) {
  return context.device || (!context.bus && context.near);
}

/**
 * 글에서 기기 주소(MAC) 모양을 찾는다. 값은 알리지 않는다(공개 CI 기록에 다시 퍼지지 않게).
 * @param {string} text
 * @returns {{ index: number, label: string }[]} 찾은 자리(글 안 위치)와 알릴 문장
 */
export function findDeviceAddresses(text) {
  /** @type {{ start: number, end: number, label: string }[]} */
  const found = [];
  /** @param {RegExpMatchArray} match @param {string} label */
  const add = (match, label) => {
    const start = match.index ?? 0;
    found.push({ start, end: start + match[0].length, label });
  };
  for (const match of text.matchAll(MAC_ADDRESS)) {
    if (!isPlaceholderAddress(hexPairs(match[0]))) {
      add(match, `MAC 주소 모양(${match[0].slice(0, 2)}${match[1]}…, 나머지는 가려서 표시)`);
    }
  }
  for (const match of text.matchAll(MAC_DOTTED)) {
    if (!isPlaceholderAddress(hexPairs(match[0]))) {
      add(match, 'MAC 주소 모양 — 점 모양(값은 가려서 표시)');
    }
  }
  for (const match of text.matchAll(MAC_FROMHEX)) {
    const start = match.index ?? 0;
    const context = addressContext(text, start, start + match[0].length);
    if (!isPlaceholderAddress(hexPairs(match[2] ?? '')) && (!context.bus || context.device)) {
      add(match, 'MAC 주소 모양 — fromhex·unhexlify에 넣은 16진수 12자리(값은 가려서 표시)');
    }
  }
  for (const match of text.matchAll(IPV6_LINK_LOCAL)) {
    if (EUI64_MIDDLE.test(match[0])) {
      add(match, 'MAC 주소 모양 — MAC이 들어 있는 IPv6 링크 로컬 주소(가운데 ff:fe, 값은 가려서 표시)');
    }
  }
  for (const match of text.matchAll(BYTES_LITERAL)) {
    const body = match[2] ?? '';
    if (/^[0-9A-Fa-f]{12}$/u.test(body)) {
      if (!isPlaceholderAddress(hexPairs(body))) {
        add(match, 'MAC 주소 모양 — bytes 글자 속 16진수 12자리(hexlify 결과, 값은 가려서 표시)');
      }
      continue;
    }
    const decoded = decodeSixBytes(body);
    if (!decoded || isPlaceholderAddress(decoded.bytes)) continue;
    const start = match.index ?? 0;
    const context = addressContext(text, start, start + match[0].length);
    if (decoded.hexEscapes >= 3) {
      if (!context.bus || context.device) {
        add(match, 'MAC 주소 모양 — 6바이트 bytes 글자(print 결과 모양, 값은 가려서 표시)');
      }
      continue;
    }
    // \x가 한두 개면 주소 문맥이 있을 때, 하나도 없으면(여섯 바이트가 모두 글자로 찍힘) 값 바로 앞에 기기 주소 낱말이 있을 때만
    // — 짧은 글자 bytes(여섯 글자 명령)나 JSON의 "b": 같은 모양과 헷갈리지 않게
    if (decoded.hexEscapes > 0 ? contextCounts(context) : context.deviceBefore) {
      add(match, 'MAC 주소 모양 — 주소 낱말 옆의 6바이트 bytes 글자(값은 가려서 표시)');
    }
  }
  /** @type {[RegExp, (value: string) => number[] | null][]} */
  const contextual = [
    [MAC_BARE_HEX, hexPairs],
    [MAC_SPACED, hexPairs],
    [
      MAC_SHORT_COLON,
      (value) => (/^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/u.test(value) ? null : value.split(':').map((part) => parseInt(part, 16))),
    ],
    [MAC_HEX_LIST, (value) => (value.match(/0x[0-9A-Fa-f]{1,2}/giu) ?? []).map((part) => parseInt(part.slice(2), 16))],
    [MAC_HEX_INTEGER, (value) => hexPairs(value.slice(2).padStart(12, '0'))],
    [MAC_UNDERSCORE, hexPairs],
    [
      MAC_DECIMAL_LIST,
      (value) => {
        const numbers = (value.match(/\d+/gu) ?? []).map(Number);
        return numbers.every((number) => number <= 255) ? numbers : null;
      },
    ],
  ];
  for (const [regExp, toBytes] of contextual) {
    for (const match of text.matchAll(regExp)) {
      const bytes = toBytes(match[0]);
      if (!bytes || bytes.length !== 6 || isPlaceholderAddress(bytes)) continue;
      const start = match.index ?? 0;
      if (contextCounts(addressContext(text, start, start + match[0].length))) {
        add(match, 'MAC 주소 모양 — 주소 낱말 옆의 여섯 바이트(값은 가려서 표시)');
      }
    }
  }
  // 한 값을 두 규칙이 함께 잡으면(예: bytes 글자 안 12자리) 하나만 알린다
  found.sort((left, right) => left.start - right.start || right.end - left.end);
  /** @type {{ index: number, label: string }[]} */
  const kept = [];
  let coveredUntil = -1;
  for (const item of found) {
    if (item.start >= coveredUntil) {
      kept.push({ index: item.start, label: item.label });
      coveredUntil = item.end;
    }
  }
  return kept;
}

/** 이메일 주소 모양(사용자@도메인.최상위) */
const EMAIL_ADDRESS = /(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(?![A-Za-z0-9-])/gu;
/**
 * 사람을 가리키지 않는 이메일: 답장을 받지 않는 noreply 주소(GitHub·Anthropic 표기), 문서 예시용으로 예약된 도메인(RFC 2606·6761).
 * @param {string} local
 * @param {string} domain
 */
function isPlaceholderEmail(local, domain) {
  const lowerDomain = domain.toLowerCase();
  return (
    local.toLowerCase().startsWith('noreply') ||
    lowerDomain.endsWith('.noreply.github.com') ||
    /(?:^|\.)example\.(?:com|org|net)$/u.test(lowerDomain) ||
    /\.(?:example|invalid|test|localhost)$/u.test(lowerDomain) ||
    // 파일 이름 속 @(예: 고해상도 그림 이름의 @2x)는 이메일이 아니다.
    /\.(?:webp|png|jpe?g|gif|svg|avif|ico|css|js|mjs|cjs|ts|tsx|json|md|html?|py|txt|woff2?|ttf|otf|wasm|ya?ml|astro|pdf|zip)$/u.test(lowerDomain)
  );
}
/**
 * 전화번호의 구분자: 붙임표·점·빈칸, 그리고 문서 편집기가 바꿔 넣는 줄표(‐ ‑ ‒ – — ―)와 전각 붙임표(－)
 * (2026-09-26 Phase 6 안전 검토 지적 10 — 줄표로 적은 번호를 놓쳤다).
 */
const PHONE_SEP = '[-. ‐‑‒–—―－]';
const PHONE_PREFIX = '(?:01[016789]|0[2-6]\\d?|070|080|050\\d)';
/**
 * 한국 전화번호 모양(휴대전화 010·011 등, 지역 번호 02·031 등, 인터넷 전화 070, 대표 번호 080·050x).
 * 구분자가 있는 것만 본다 — 버전·날짜 같은 숫자 나열과 헷갈리지 않게(붙여 쓴 번호는 설계상 뺀다).
 */
const PHONE_NUMBER = new RegExp(`(?<![\\dA-Za-z+-])${PHONE_PREFIX}${PHONE_SEP}\\d{3,4}${PHONE_SEP}\\d{4}(?![\\dA-Za-z-])`, 'gu');
/** 괄호로 감싼 앞 번호 — 휴대전화·지역 번호를 괄호 안에 적고 뒤에 두 묶음(예시 값은 이 파일에 적지 않는다 — 머리말) */
const PHONE_PARENTHESIZED = new RegExp(`(?<![\\dA-Za-z])\\(${PHONE_PREFIX}\\)${PHONE_SEP}?\\d{3,4}${PHONE_SEP}\\d{4}(?![\\dA-Za-z-])`, 'gu');
/** 국제 형식 — +82 뒤 앞 번호의 첫 0을 빼거나(+82-10-…) 괄호로 둔다(+82 (0)10 …) */
const PHONE_INTERNATIONAL = new RegExp(
  `(?<![\\dA-Za-z])\\+82${PHONE_SEP}?(?:\\(0\\))?${PHONE_SEP}?0?(?:1[016789]|[2-6]\\d?|70|80|50\\d)${PHONE_SEP}?\\d{3,4}${PHONE_SEP}\\d{4}(?![\\dA-Za-z-])`,
  'gu',
);
/**
 * 자리표시자 전화번호: 가운데·끝 묶음이 모두 0(010-0000-0000, +82-10-0000-0000).
 * @param {string} value
 */
function isPlaceholderPhone(value) {
  const groups = value.split(/\D+/u).filter((group) => group !== '');
  return groups.length >= 2 && groups.slice(-2).every((group) => /^0+$/u.test(group));
}
/**
 * 예제·차시에 적은 와이파이 비밀번호(2026-09-26 Phase 6 안전 검토 지적 10): wlan.connect('이름', '비밀번호')의 둘째 값과
 * WIFI_PASSWORD·PASSWORD = '…' 같은 값이 자리표시자가 아니면 알린다(값은 알리지 않는다). examples/·content/에서만 본다.
 */
const WIFI_CONNECT = /(?<![A-Za-z0-9_])(?:wlan|sta(?:_if)?|station|wifi|nic|network)\s*\.\s*connect\(\s*(['"])([^'"\n]*)\1\s*,\s*(['"])([^'"\n]*)\3/giu;
const PASSWORD_ASSIGN = /(?<![A-Za-z0-9_])(?:wifi_?password|wlan_?password|wifi_?pw|password|passwd|pwd)\s*[:=]\s*(['"])([^'"\n]*)\1/giu;
const PLACEHOLDER_SECRET =
  /^(?:|1234|12345678|0000|00000000|password|passwd|my-password|my_password|mypassword|your-password|your_password|yourpassword|비밀번호|와이파이 ?비밀번호|교실 ?와이파이 ?비밀번호|\*+|x+|…|\.{3}|<[^>]*>|\{[^}]*\}|\$\{[^}]*\})$/iu;

/**
 * 예제·차시 글에서 자리표시자가 아닌 와이파이 비밀번호 모양을 찾는다(값은 알리지 않는다).
 * @param {string} text
 * @returns {string[]}
 */
export function findWifiSecrets(text) {
  /** @type {string[]} */
  const findings = [];
  for (const match of text.matchAll(WIFI_CONNECT)) {
    if (!PLACEHOLDER_SECRET.test((match[4] ?? '').trim())) {
      findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: 와이파이 비밀번호로 보이는 값(connect의 둘째 값 — 값은 가려서 표시)`);
    }
  }
  for (const match of text.matchAll(PASSWORD_ASSIGN)) {
    if (!PLACEHOLDER_SECRET.test((match[2] ?? '').trim())) {
      findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: 비밀번호로 보이는 값(값은 가려서 표시)`);
    }
  }
  return findings;
}
const HANGUL_CHARACTER = /\p{Script=Hangul}/u;
const LATIN_CHARACTER = /[a-z0-9]/u;
/**
 * 사람을 가리키지 않는 사용자 이름: Windows 기본 폴더, 원고 캡처의 교실 PC 공용 계정 이름(INVENTORY §6),
 * 설명용 자리표시자, Pyodide·Emscripten 가상 경로와 GitHub Actions 실행기 이름.
 */
const ALLOWED_USER_NAMES = new Set([
  'public', 'default', 'all', 'com', 'user', 'username', 'user_name', 'yourname', 'your_name', 'name',
  '사용자', '사용자이름', '사용자명', '이름', 'pyodide', 'web_user', 'runner',
]);

/** 문제 종류 → 제목과 고치는 법(보고서에 이 순서로 보인다) */
const PROBLEM_KINDS = Object.freeze({
  forbidden: {
    title: '공개 저장소에 올리면 안 되는 파일',
    fix: 'git rm --cached <파일>로 추적에서 빼요(파일은 PC에 남아요).',
  },
  'original-folder': {
    title: '원본 자료 폴더의 파일',
    fix: '원본 자료는 공개 저장소에 올리지 않아요(DECISIONS C6). git rm --cached로 빼고, 필요한 내용만 content/·examples/·public/에 변환해 넣어요.',
  },
  'original-format': {
    title: '원본 자료 형식의 파일',
    fix: `원본 PDF·PPTX·ZIP 대신 필요한 내용만 옮겨요. 가린 편집본처럼 꼭 올려야 하면 ${REPO_ALLOWLIST_FILE}의 original_formats에 경로와 이유를 적어요.`,
  },
  'large-file': {
    title: '5MB를 넘는 파일',
    fix: `파일을 줄이거나, 모델·펌웨어처럼 꼭 필요하면 ${REPO_ALLOWLIST_FILE}의 large_files에 경로·이유·max_mb를 적어요.`,
  },
  'original-name': {
    title: '원본 파일 이름이 들어 있는 파일',
    fix: '원본 zip·PDF·폴더 이름을 지우거나 "교과서 원고 2단원"처럼 일반적인 설명으로 바꿔요.',
  },
  privacy: {
    title: '개인정보로 보이는 경로·주소·이름',
    fix:
      '사용자 이름이 들어간 경로는 <사용자> 같은 자리표시자로, MAC 주소는 XX:XX:XX:XX:XX:XX로 바꾸고, OneDrive 경로는 지워요. ' +
      '이메일·전화번호는 지우거나 noreply@…·010-0000-0000 같은 자리표시자로 바꾸고, 비공개 이름(학교명 등)은 "우리 학교"처럼 일반적인 말로 바꿔요(PD-37).',
  },
  'image-review': {
    title: '눈 확인 기록이 없는 이미지',
    fix:
      '이미지를 한 장씩 열어 얼굴·이름·경로·파일명·기기 주소·학교명이 없는지 보고 reviewed(by·date·result)를 적은 뒤 기록 파일도 함께 스테이징해요. ' +
      `원고에서 꺼낸 차시 그림은 그 차시의 그림 목록(content/lessons/<단원>/<차시>${MANIFEST_SUFFIX}), 차시 밖 그림은 ${IMAGE_ALLOWLIST_FILE}에 적어요. ` +
      '그림이 바뀌어 sha256이 기록과 다르면 다시 보고 기록해요(npm run images:extract가 sha256을 새로 적어요). ' +
      '글·코드 파일 안에 data: 주소로 넣은 그림은 되도록 파일로 빼서 public/images/에 두고 그 파일을 기록해요.',
  },
  'image-metadata': {
    title: '메타데이터가 남은 이미지',
    fix:
      '그림에 촬영 기기·작업 PC 경로·원본 파일 이름 같은 정보가 따라올 수 있어요. 원고 그림은 npm run images:extract로 다시 꺼내고(픽셀만 WebP로 다시 인코딩), ' +
      '다른 그림은 편집기에서 메타데이터 없이 다시 저장해요. avif·tif·heic는 WebP·PNG·JPEG로 바꿔요.',
  },
  'handout-review': {
    title: '쪽별 눈 확인 기록이 맞지 않는 가린 편집본',
    fix:
      `가린 편집본 PDF는 ${HANDOUT_RECORD_FILE}에 모든 쪽의 눈 확인 기록(review — by·date·result "통과…")과 편집본의 output.sha256이 있어야 해요. ` +
      'python scripts/redact-handouts.py build로 다시 만들었다면 preview로 쪽 그림을 한 장씩 다시 보고 기록을 고친 뒤 기록 파일도 함께 스테이징해요(MAINTENANCE.md 3-3).',
  },
  'nul-text': {
    title: 'NUL 바이트가 든 글 파일',
    fix:
      '글·코드 파일(이진 확장자가 아닌 파일)의 앞부분에 NUL 바이트가 있으면 개인정보 검사가 그 파일을 이진 파일로 보고 건너뛰어요. ' +
      '이진 파일이면 알맞은 확장자로 저장하고, 글 파일이면 NUL 바이트를 지워요(코드에서 NUL이 필요하면 이스케이프 글자로 적어요).',
  },
  'media-review': {
    title: '사람이 보고(듣고) 확인한 기록이 없는 영상·소리 파일',
    fix:
      '영상·소리에는 얼굴·목소리·이름·촬영 위치가 담기기 쉬워 글 검사로 거를 수 없어요. 이 사이트는 영상·소리를 넣지 않는 것이 기본이에요 — ' +
      `꼭 넣어야 하면 먼저 이슈로 의논하고, 끝까지 보고(듣고) 메타데이터를 지운 뒤 ${IMAGE_ALLOWLIST_FILE}에 path·sha256·reviewed(by·date·result "통과…")를 적어 함께 스테이징해요(MAINTENANCE.md 3절).`,
  },
  'binary-path': {
    title: '정해진 자리 밖의 이진 파일',
    fix:
      '이진 파일은 글 검사를 건너뛰어서 자리를 정해 두었어요: .bin은 public/firmware/(펌웨어 목록 manifest.json의 sha256과 같아야 해요), ' +
      '.task·.tflite는 public/models/, 글꼴은 public/fonts/, .wasm은 public/vendor/. 다른 자리에 두어야 하면 먼저 이슈로 의논해요(scripts/lib/repo-check.mjs BINARY_ALLOWED_ROOTS).',
  },
  config: {
    title: '허용 목록 형식 오류',
    fix: '허용 목록 파일 맨 위의 설명을 보고 형식을 고쳐요.',
  },
});

/**
 * @typedef {object} RepoFile
 * @property {string} path 저장소 뿌리 기준 경로(/ 구분)
 * @property {number} size 바이트
 * @property {Buffer | null} content 내용(너무 크거나 링크면 null)
 */

/**
 * 해시로만 적어 둔 비공개 이름 하나(scripts/privacy-needles.json의 needles 항목).
 * @typedef {object} PrivacyNeedle
 * @property {string} label 무엇인지(예: "학교 이름"). 이름 자체는 적지 않는다.
 * @property {'hangul' | 'latin'} script 글자 종류(한글 / 영문·숫자). 그 종류의 글자만 이어진 구간에서 찾는다.
 * @property {number} length 글자 수(코드 포인트 수)
 * @property {string} sha256 hashPrivacyNeedle()로 만든 해시(16진수)
 */

/**
 * @typedef {object} PrivacyNeedleSet
 * @property {string} salt 해시에 섞는 값(파일마다 다르게 두어 같은 이름의 해시가 밖에서 만든 표와 맞지 않게)
 * @property {PrivacyNeedle[]} needles
 */

/**
 * @typedef {object} RepoRules
 * @property {{ path: string, reason: string }[]} originalFormatAllowed
 * @property {{ path: string, reason: string, maxMb: number }[]} largeFileAllowed
 * @property {Map<string, unknown>} imageReviews 이미지 경로 → 기록({ reviewed, sha256?, recordFile? }). runRepoCheck가 git 인덱스의 기록 파일에서 모은다
 * @property {string[]} originalFolderNames .gitignore의 원본 자료 폴더 이름
 * @property {string[]} originalNameNeedles 찾을 원본 이름
 * @property {PrivacyNeedleSet} [privacyNeedles] 해시로 적어 둔 비공개 이름(없으면 검사하지 않는다)
 * @property {{ path: string, kinds: string[], reason: string }[]} [privacyExceptions] 개인정보 모양 검사 예외(public/licenses/ 아래 고지 원문의 이메일만)
 * @property {{ blob: string, reason: string }[]} [historyReviewed] 기록 훑기(runHistoryCheck)에서 사람이 보고 개인정보가 아니라고 확인한 blob
 * @property {Map<string, HandoutRecord>} [handoutReviews] 가린 편집본 경로 → 쪽별 눈 확인 기록. runRepoCheck가 git 인덱스의 기록 파일에서 모은다
 * @property {Set<string>} [firmwareHashes] 펌웨어 목록(public/firmware/manifest.json)에 적힌 sha256. runRepoCheck가 git 인덱스에서 읽는다(없으면 대조하지 않음)
 */

/**
 * 가린 편집본 하나의 기록(scripts/handout-redactions.yaml의 documents.<id>)
 * @typedef {object} HandoutRecord
 * @property {string} id 문서 이름(bt·ppt)
 * @property {string | undefined} sha256 output.sha256
 * @property {number | undefined} pages source.pages(원본 쪽 수 — 편집본 쪽 수와 같다)
 * @property {unknown[]} review 쪽별 기록
 */

/** privacy_exceptions에 적을 수 있는 검사 종류(지금은 라이선스 고지 원문·npm 잠금 파일의 이메일뿐) */
export const PRIVACY_EXCEPTION_KINDS = Object.freeze(['email']);
/** privacy_exceptions의 경로가 있어야 하는 폴더(다른 저작자의 라이선스 고지 원문) */
export const PRIVACY_EXCEPTION_ROOT = 'public/licenses/';
/**
 * 폴더 밖에서 예외를 둘 수 있는 파일. package-lock.json은 npm이 기록하는 다른 패키지의 deprecated 안내문에 그 패키지 저작자가 스스로 적은
 * 공개 주소가 들어올 수 있다(2026-09-16 glob 11.1.0 — workbox-build의 의존성). 운영자·학생의 정보는 어떤 경우에도 예외로 두지 않는다.
 */
export const PRIVACY_EXCEPTION_FILES = Object.freeze(['package-lock.json']);

/**
 * privacy_exceptions의 path로 쓸 수 있는 곳인지: public/licenses/ 아래 또는 정해진 파일(package-lock.json)만.
 * @param {unknown} pattern
 */
export function isPrivacyExceptionPathAllowed(pattern) {
  const text = String(pattern);
  return text.startsWith(PRIVACY_EXCEPTION_ROOT) || PRIVACY_EXCEPTION_FILES.includes(text);
}

/** @typedef {{ kind: keyof typeof PROBLEM_KINDS, path: string, detail: string }} RepoProblem */

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineNumberAt(text, index) {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (text.charCodeAt(position) === 10) {
      line += 1;
    }
  }
  return line;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatMegabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * .gitignore의 "원본 자료" 주석 아래(빈 줄 전까지)에 적힌 /폴더/ 이름.
 * @param {string} gitignoreText
 * @returns {string[]}
 */
export function originalFolderNamesFromGitignore(gitignoreText) {
  /** @type {string[]} */
  const names = [];
  let inOriginalBlock = false;
  for (const rawLine of gitignoreText.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.startsWith('#')) {
      inOriginalBlock = line.includes('원본 자료');
      continue;
    }
    if (line === '') {
      inOriginalBlock = false;
      continue;
    }
    const match = inOriginalBlock ? /^\/([^/]+)\/$/u.exec(line) : null;
    if (match) {
      names.push(match[1].normalize('NFC'));
    }
  }
  return names;
}

/**
 * docs/INVENTORY.md에 `…`로 적힌 원본 문서·압축 파일 이름(공개 문서에 이미 있는 이름만).
 * @param {string} inventoryText
 * @returns {string[]}
 */
export function originalDocumentNamesFromInventory(inventoryText) {
  const names = new Set();
  for (const match of inventoryText.matchAll(/`([^`\n]+?\.(?:pdf|pptx|zip|hwp|hwpx))`/giu)) {
    const baseName = (match[1].split('/').pop() ?? '').trim();
    if (baseName) {
      names.add(baseName.normalize('NFC'));
    }
  }
  return [...names];
}

/**
 * 운영자 PC처럼 원본 자료 폴더가 있으면 그 안 문서·압축 파일 이름도 모은다(읽기만 한다).
 * @param {string} rootDir
 * @param {string[]} folderNames
 * @returns {string[]}
 */
export function originalDocumentNamesOnDisk(rootDir, folderNames) {
  const names = new Set();
  /**
   * @param {string} directory
   * @param {number} depth
   */
  const walk = (directory, depth) => {
    if (depth > 6) return;
    /** @type {fs.Dirent[]} */
    let dirents;
    try {
      dirents = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (dirent.isDirectory()) {
        walk(path.join(directory, dirent.name), depth + 1);
      } else if (ORIGINAL_DOCUMENT_NAME.test(dirent.name)) {
        names.add(dirent.name.normalize('NFC'));
      }
    }
  };
  for (const folderName of folderNames) {
    const folderPath = path.join(rootDir, folderName);
    if (fs.existsSync(folderPath)) {
      walk(folderPath, 0);
    }
  }
  return [...names];
}

/**
 * 찾을 원본 이름 목록. 폴더 이름 중 공백이 있거나 영어 한 낱말인 이름(예: 일반 낱말과 겹치는 이름)은
 * 오탐을 막으려고 뺀다. 문서 이름은 확장자를 붙인 이름과, 8글자 이상이면 확장자를 뗀 이름을 함께 찾는다.
 * @param {string[]} folderNames
 * @param {string[]} documentNames
 * @returns {string[]}
 */
export function buildOriginalNameNeedles(folderNames, documentNames) {
  const needles = new Set();
  for (const name of folderNames) {
    if (!/\s/u.test(name) && !/^[A-Za-z]+$/u.test(name)) {
      needles.add(name);
    }
  }
  for (const name of documentNames) {
    needles.add(name);
    const baseName = name.replace(/\.[^.]+$/u, '');
    if ([...baseName].length >= 8) {
      needles.add(baseName);
    }
  }
  return [...needles].sort();
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isPlaceholderUserName(name) {
  return (
    ALLOWED_USER_NAMES.has(name.toLowerCase()) ||
    /^%[^%]+%$/u.test(name) ||
    name.startsWith('$') ||
    /^(?:x+|\*+|\.{3,}|…)$/iu.test(name)
  );
}

/**
 * 텍스트에서 개인정보 형태를 찾는다. 찾은 값은 로그(공개 CI 기록 포함)에 다시 퍼지지 않게 가려서 알린다.
 * @param {string} text
 * @param {{ skipKinds?: readonly string[] }} [options] 건너뛸 검사 종류(PRIVACY_EXCEPTION_KINDS 가운데)
 * @returns {string[]}
 */
export function findPrivacyPatterns(text, options = {}) {
  const skipKinds = new Set(options.skipKinds ?? []);
  /** @type {string[]} */
  const findings = [];
  const userDirectoryRules = [
    { regExp: WINDOWS_USER_DIR, label: 'Windows 사용자 폴더 경로' },
    { regExp: DRIVE_MOUNT_USER_DIR, label: 'Windows 사용자 폴더 경로(Git Bash·WSL 모양)' },
    { regExp: MAC_USER_DIR, label: 'macOS 사용자 폴더 경로' },
    { regExp: LINUX_HOME_DIR, label: 'Linux 사용자 폴더 경로' },
    { regExp: UNC_USER_DIR, label: '네트워크 공유(UNC) 사용자 폴더 경로' },
  ];
  // %5C·%2F·%3A로 적은 주소 글자(file:///C:%5CUsers%5C…)는 한 번 풀어서 다시 본다 — 줄바꿈은 바뀌지 않아 줄 번호가 같다(2026-09-26 Phase 6 안전 검토 지적 10)
  const pathTexts = PERCENT_PATH_CHARACTER.test(text)
    ? [text, text.replace(/%5c/giu, '\\').replace(/%2f/giu, '/').replace(/%3a/giu, ':')]
    : [text];
  const pathFindings = new Set();
  for (const source of pathTexts) {
    /** @type {{ start: number, end: number, label: string }[]} */
    const matches = [];
    for (const { regExp, label } of userDirectoryRules) {
      for (const match of source.matchAll(regExp)) {
        if (!isPlaceholderUserName(match[1])) {
          const start = match.index ?? 0;
          matches.push({ start, end: start + match[0].length, label });
        }
      }
    }
    // 한 경로를 두 규칙이 함께 잡으면(네트워크 공유 경로 속 /Users/…) 먼저·길게 잡은 하나만 알린다
    matches.sort((left, right) => left.start - right.start || right.end - left.end);
    let coveredUntil = -1;
    for (const item of matches) {
      if (item.start < coveredUntil) continue;
      coveredUntil = item.end;
      pathFindings.add(`${lineNumberAt(source, item.start)}번째 줄: ${item.label}(사용자 이름은 가려서 표시)`);
    }
  }
  findings.push(...pathFindings);
  for (const match of text.matchAll(ONEDRIVE_DIR)) {
    findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: OneDrive 폴더 경로(기관·계정 이름이 드러날 수 있어요)`);
  }
  for (const { index, label } of findDeviceAddresses(text)) {
    findings.push(`${lineNumberAt(text, index)}번째 줄: ${label}`);
  }
  if (!skipKinds.has('email')) {
    // 전각 ＠로 적은 주소도 이메일로 본다(글자 수가 같아 줄 번호가 그대로다 — 2026-09-26 Phase 6 안전 검토 지적 10)
    const emailText = text.includes('＠') ? text.replace(/＠/gu, '@') : text;
    for (const match of emailText.matchAll(EMAIL_ADDRESS)) {
      if (!isPlaceholderEmail(match[1], match[2])) {
        findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: 이메일 주소 모양(…@${match[2].split('.').slice(-1)[0]}, 앞부분은 가려서 표시)`);
      }
    }
  }
  for (const regExp of [PHONE_NUMBER, PHONE_PARENTHESIZED, PHONE_INTERNATIONAL]) {
    for (const match of text.matchAll(regExp)) {
      if (!isPlaceholderPhone(match[0])) {
        findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: 전화번호 모양(${match[0].slice(0, 3)}…, 나머지는 가려서 표시)`);
      }
    }
  }
  return findings;
}

/**
 * 비공개 이름을 찾기 위한 글자 정리: 유니코드 정규화(NFC), 소문자, 공백·줄바꿈·너비 없는 글자 제거.
 * 문장 부호는 남겨서 "가나`·"다라"처럼 부호로 나뉜 두 낱말이 하나로 붙어 보이지 않게 한다.
 * @param {string} text
 * @returns {{ chars: string[], offsets: number[] }} 남은 글자와 원래 글에서의 위치
 */
export function normalizeForNeedle(text) {
  /** @type {string[]} */
  const chars = [];
  /** @type {number[]} */
  const offsets = [];
  const normalized = text.normalize('NFC').toLowerCase();
  let offset = 0;
  for (const char of normalized) {
    if (!/[\s​-‍﻿]/u.test(char)) {
      chars.push(char);
      offsets.push(offset);
    }
    offset += char.length;
  }
  return { chars, offsets };
}

/**
 * 비공개 이름 하나의 해시. 이름은 이 함수를 거친 값만 privacy-needles.json에 적는다(scripts/privacy-needle.mjs).
 * @param {string} word
 * @param {string} salt
 * @returns {{ sha256: string, length: number, script: 'hangul' | 'latin' }}
 */
export function hashPrivacyNeedle(word, salt) {
  const { chars } = normalizeForNeedle(word);
  const script = chars.every((char) => HANGUL_CHARACTER.test(char))
    ? 'hangul'
    : chars.every((char) => LATIN_CHARACTER.test(char))
      ? 'latin'
      : null;
  if (chars.length === 0 || script === null) {
    throw new Error('비공개 이름은 한글만으로, 또는 영문·숫자만으로 이루어진 낱말 하나여야 해요(공백은 무시).');
  }
  return { sha256: createHash('sha256').update(`${salt}\0${chars.join('')}`).digest('hex'), length: chars.length, script };
}

/**
 * 해시로 적어 둔 비공개 이름이 글에 있는지 찾는다. 같은 글자 종류(한글 / 영문·숫자)가 이어진 구간에서
 * 이름 길이만큼의 창을 옮겨 가며 해시를 견준다. 찾은 이름은 로그에 적지 않는다.
 * @param {string} text
 * @param {PrivacyNeedleSet | undefined} needleSet
 * @returns {string[]}
 */
export function findPrivacyNeedles(text, needleSet) {
  if (!needleSet || needleSet.needles.length === 0) {
    return [];
  }
  /** @type {string[]} */
  const findings = [];
  const { chars, offsets } = normalizeForNeedle(text);
  const classes = chars.map((char) => (HANGUL_CHARACTER.test(char) ? 'hangul' : LATIN_CHARACTER.test(char) ? 'latin' : 'other'));
  needleSet.needles.forEach((needle, index) => {
    let run = 0;
    for (let position = 0; position < chars.length; position += 1) {
      run = classes[position] === needle.script ? run + 1 : 0;
      if (run < needle.length) {
        continue;
      }
      const start = position - needle.length + 1;
      const window = chars.slice(start, position + 1).join('');
      const hash = createHash('sha256').update(`${needleSet.salt}\0${window}`).digest('hex');
      if (hash === needle.sha256) {
        findings.push(
          `${lineNumberAt(text, offsets[start] ?? 0)}번째 줄: 비공개 이름(${needle.label}, ${PRIVACY_NEEDLES_FILE}의 ${index + 1}번째 항목 — 이름은 표시하지 않아요)`,
        );
        break;
      }
    }
  });
  return findings;
}

/**
 * 텍스트 파일이면 글자로 바꿔 돌려주고, 이진 파일이면 null.
 * UTF-16(맨 앞에 BOM이 있는 파일, Windows PowerShell 5.1의 기본 저장 형식)은 NUL 바이트가 섞여 있어도 글자로 읽는다.
 * @param {string} filePath
 * @param {Buffer} content
 * @returns {string | null}
 */
function decodeTextContent(filePath, content) {
  if (BINARY_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase())) {
    return null;
  }
  if (content.length >= 2 && content[0] === 0xff && content[1] === 0xfe) {
    return content.subarray(2, 2 + Math.floor((content.length - 2) / 2) * 2).toString('utf16le');
  }
  if (content.length >= 2 && content[0] === 0xfe && content[1] === 0xff) {
    const body = Buffer.from(content.subarray(2, 2 + Math.floor((content.length - 2) / 2) * 2));
    return body.swap16().toString('utf16le');
  }
  if (content.subarray(0, 8000).includes(0)) {
    return null;
  }
  return content.toString('utf8');
}

// ── 그림 파일에 남은 것(메타데이터 조각 검사 inspectImageMetadata에 보탬, 2026-09-26 P6-05) ──

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/**
 * 그림을 그리는 데만 쓰는 PNG 조각(PNG 3판 표준·APNG). inspectImageMetadata가 따로 막는 메타데이터 조각(eXIf·tEXt·iTXt·zTXt·iCCP·tIME)과
 * 이 목록에 없는 조각(편집기 전용 조각, C2PA 출처 기록 caBX 등)은 모르는 조각으로 알린다.
 */
const PNG_RENDERING_CHUNKS = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'sRGB', 'sBIT', 'bKGD', 'hIST', 'pHYs', 'sPLT', 'cICP', 'mDCV', 'cLLI', 'mDCv', 'cLLi',
  'acTL', 'fcTL', 'fdAT',
]);
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'iCCP', 'tIME']);
/** GIF 응용 확장 가운데 반복 재생만 적는 것(글이 없다) */
const GIF_LOOP_APPLICATIONS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

/**
 * PNG 조각을 훑어 모르는 조각과 IEND 뒤 바이트를 알린다.
 * @param {Buffer} buffer
 * @returns {string[]}
 */
function pngLeftovers(buffer) {
  /** @type {string[]} */
  const problems = [];
  for (let offset = 8; offset + 12 <= buffer.length; ) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (!PNG_RENDERING_CHUNKS.has(type) && !PNG_METADATA_CHUNKS.has(type)) {
      problems.push(`PNG의 알 수 없는 조각 "${type.replace(/[^\x20-\x7e]/gu, '?')}"`);
    }
    offset += 12 + size;
    if (type === 'IEND') {
      if (buffer.length > offset) problems.push(`PNG 끝(IEND) 뒤에 붙은 바이트 ${buffer.length - offset}개`);
      break;
    }
  }
  return problems;
}

/**
 * JPEG 표시(marker)를 끝(EOI)까지 따라가며 JFIF 썸네일과 끝 뒤 바이트를 알린다(메타데이터 조각은 inspectImageMetadata가 본다).
 * @param {Buffer} buffer
 * @returns {string[]}
 */
function jpegLeftovers(buffer) {
  /** @type {string[]} */
  const problems = [];
  let offset = 2;
  while (offset + 2 <= buffer.length) {
    if (buffer[offset] !== 0xff) return problems; // 모양이 어긋나면 더 보지 않는다(잘린 그림은 개인정보 문제가 아니다)
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1; // 채움 바이트
      continue;
    }
    if (marker === 0xd9) {
      const end = offset + 2;
      if (buffer.length > end) problems.push(`JPEG 끝(EOI) 뒤에 붙은 바이트 ${buffer.length - end}개`);
      return problems;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > buffer.length) return problems;
    const size = buffer.readUInt16BE(offset + 2);
    const payload = buffer.subarray(offset + 4, offset + 2 + size);
    if (marker === 0xe0) {
      const identifier = payload.toString('latin1', 0, 5);
      if (identifier === 'JFIF\0' && payload.length >= 14 && payload[12] * payload[13] > 0) problems.push('JPEG JFIF 썸네일');
      if (identifier === 'JFXX\0') problems.push('JPEG JFXX 썸네일');
    }
    offset += 2 + size;
    if (marker === 0xda) {
      // 압축된 영상 자료: 다음 표시(0xFF 뒤가 00·재시작 표시가 아닌 곳)까지 건너뛴다(점진 JPEG은 이런 구간이 여럿이다)
      while (offset + 1 < buffer.length && !(buffer[offset] === 0xff && buffer[offset + 1] !== 0x00 && !(buffer[offset + 1] >= 0xd0 && buffer[offset + 1] <= 0xd7))) {
        offset += 1;
      }
    }
  }
  return problems;
}

/**
 * GIF 블록을 따라가며 글 확장·모르는 응용 확장과 끝(0x3B) 뒤 바이트를 알린다(주석·XMP는 inspectImageMetadata가 본다).
 * @param {Buffer} buffer
 * @returns {string[]}
 */
function gifLeftovers(buffer) {
  /** @type {string[]} */
  const problems = [];
  let offset = 13;
  if (buffer.length < 13) return problems;
  if (buffer[10] & 0x80) offset += 3 * (1 << ((buffer[10] & 0x07) + 1));
  const skipSubBlocks = () => {
    while (offset < buffer.length && buffer[offset] !== 0) offset += buffer[offset] + 1;
    offset += 1;
  };
  while (offset < buffer.length) {
    const introducer = buffer[offset];
    if (introducer === 0x3b) {
      const end = offset + 1;
      if (buffer.length > end) problems.push(`GIF 끝 뒤에 붙은 바이트 ${buffer.length - end}개`);
      break;
    }
    if (introducer === 0x21) {
      const label = buffer[offset + 1];
      offset += 2;
      if (label === 0x01) problems.push('GIF 글 확장(Plain Text)');
      if (label === 0xff) {
        const application = buffer.toString('latin1', offset + 1, offset + 12);
        if (!GIF_LOOP_APPLICATIONS.has(application) && application !== 'XMP DataXMP') {
          problems.push(`GIF 응용 확장 "${application.replace(/[^\x20-\x7e]/gu, '?')}"`);
        }
      }
      skipSubBlocks();
    } else if (introducer === 0x2c) {
      const packed = buffer[offset + 9];
      offset += 10;
      if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1));
      offset += 1;
      skipSubBlocks();
    } else {
      break;
    }
  }
  return problems;
}

/**
 * BMP: 색 프로필(V4·V5 머리의 LINK = 다른 파일 경로, MBED = 들어 있는 프로필)과 파일 크기 뒤 바이트.
 * @param {Buffer} buffer
 * @returns {string[]}
 */
function bmpLeftovers(buffer) {
  /** @type {string[]} */
  const problems = [];
  if (buffer.length < 18) return problems;
  const headerSize = buffer.readUInt32LE(14);
  if (headerSize >= 108 && buffer.length >= 74) {
    const colorSpace = buffer.readUInt32LE(70);
    if (colorSpace === 0x4c494e4b) problems.push('BMP 색 프로필 경로(LINK)');
    if (colorSpace === 0x4d424544) problems.push('BMP 색 프로필(MBED)');
  }
  const declared = buffer.readUInt32LE(2);
  if (declared > 0 && buffer.length > declared) problems.push(`BMP 끝 뒤에 붙은 바이트 ${buffer.length - declared}개`);
  return problems;
}

/**
 * ICO: 안에 든 그림 가운데 PNG는 메타데이터와 남은 것을 본다.
 * @param {Buffer} buffer
 * @returns {string[]}
 */
function icoLeftovers(buffer) {
  /** @type {string[]} */
  const problems = [];
  const count = buffer.readUInt16LE(4);
  let end = 6 + count * 16;
  for (let index = 0; index < count && 6 + index * 16 + 16 <= buffer.length; index += 1) {
    const entry = 6 + index * 16;
    const size = buffer.readUInt32LE(entry + 8);
    const offset = buffer.readUInt32LE(entry + 12);
    end = Math.max(end, offset + size);
    const image = buffer.subarray(offset, offset + size);
    if (image.subarray(0, 8).equals(PNG_SIGNATURE)) {
      for (const problem of [...inspectImageMetadata(image).problems, ...pngLeftovers(image)]) {
        problems.push(`ICO ${index + 1}번째 그림(PNG): ${problem}`);
      }
    }
  }
  if (buffer.length > end) problems.push(`ICO 끝 뒤에 붙은 바이트 ${buffer.length - end}개`);
  return problems;
}

/**
 * 파일 머리로 알아낸 래스터 형식(모르면 null — 확장자만 그림이고 내용은 다른 형식인 파일).
 * @param {Buffer} buffer
 * @returns {'webp' | 'png' | 'jpeg' | 'gif' | 'bmp' | 'ico' | null}
 */
export function rasterFormatOf(buffer) {
  if (buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 6 && /^GIF8[79]a$/u.test(buffer.toString('latin1', 0, 6))) return 'gif';
  if (buffer.length >= 18 && buffer.toString('latin1', 0, 2) === 'BM') return 'bmp';
  if (buffer.length >= 6 && buffer.readUInt16LE(0) === 0 && [1, 2].includes(buffer.readUInt16LE(2))) return 'ico';
  return null;
}

/**
 * 그림 파일에 남은 것: 그림 끝 뒤에 붙은 바이트(도구가 덧붙인 글·썸네일이 숨는 곳), PNG의 모르는 부가 조각, JPEG JFIF 썸네일,
 * GIF 글 확장·모르는 응용 확장, BMP 색 프로필, ICO 안 PNG의 메타데이터. 메타데이터 조각(EXIF·XMP·ICC·글 조각·주석)은
 * inspectImageMetadata(scripts/lib/lesson-images.mjs)가 보고, 이 함수는 그 밖을 본다(같은 문제를 두 번 알리지 않는다).
 * 잘린 그림(끝 표시가 없음)은 개인정보 문제가 아니라서 알리지 않는다. 형식을 모르면 빈 목록(부르는 쪽이 rasterFormatOf로 따로 알린다).
 * @param {Buffer} buffer
 * @returns {string[]}
 */
export function inspectRasterLeftovers(buffer) {
  switch (rasterFormatOf(buffer)) {
    case 'webp': {
      const end = 8 + buffer.readUInt32LE(4);
      return buffer.length > end ? [`WebP 끝(RIFF 크기) 뒤에 붙은 바이트 ${buffer.length - end}개`] : [];
    }
    case 'png':
      return pngLeftovers(buffer);
    case 'jpeg':
      return jpegLeftovers(buffer);
    case 'gif':
      return gifLeftovers(buffer);
    case 'bmp':
      return bmpLeftovers(buffer);
    case 'ico':
      return icoLeftovers(buffer);
    default:
      return [];
  }
}

/**
 * @param {Buffer} content
 * @param {string | null} text
 * @param {string[]} needles
 * @returns {string | undefined}
 */
function findOriginalName(content, text, needles) {
  if (text !== null) {
    const normalized = text.normalize('NFC').toLowerCase();
    return needles.find((needle) => normalized.includes(needle.toLowerCase()));
  }
  return needles.find((needle) => content.includes(Buffer.from(needle, 'utf8')));
}

/**
 * 눈 확인 기록 하나를 검사한다. 기록에 sha256이 있으면 그림 내용과도 견준다.
 * @param {unknown} record
 * @param {Buffer | null} content
 * @returns {string | null}
 */
function describeReviewProblem(record, content) {
  if (!isPlainObject(record)) {
    return '눈 확인 기록이 없어요';
  }
  const problem = reviewedProblem(record.reviewed);
  if (problem) {
    return problem;
  }
  if (typeof record.sha256 === 'string' && content && sha256Hex(content) !== record.sha256) {
    return '눈으로 확인한 뒤에 그림이 바뀌었어요(sha256이 기록과 달라요). 다시 보고 기록해요';
  }
  return null;
}

/**
 * 가린 편집본 PDF 하나의 기록 문제(없으면 null).
 * @param {HandoutRecord | undefined} record
 * @param {Buffer | null} content
 * @returns {string | null}
 */
export function describeHandoutProblem(record, content) {
  if (!record) {
    return '가린 편집본의 쪽별 눈 확인 기록(documents.*.output.path가 이 파일인 항목)이 없어요';
  }
  if (typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(record.sha256)) {
    return `${record.id}: output.sha256(64자리 16진수)이 없어요`;
  }
  if (content && sha256Hex(content) !== record.sha256) {
    return `${record.id}: 편집본이 기록(output.sha256)과 달라요 — 다시 만든 편집본이면 쪽마다 다시 보고 기록해요`;
  }
  if (!Number.isInteger(record.pages) || /** @type {number} */ (record.pages) < 1) {
    return `${record.id}: 원본 쪽 수(source.pages)가 없어요`;
  }
  const passed = new Set();
  for (const item of record.review) {
    if (!isPlainObject(item)) continue;
    const ok =
      Number.isInteger(item.page) &&
      typeof item.by === 'string' &&
      item.by.trim() !== '' &&
      /^\d{4}-\d{2}-\d{2}$/u.test(String(item.date ?? '')) &&
      typeof item.result === 'string' &&
      item.result.startsWith('통과');
    if (ok) {
      passed.add(item.page);
    }
  }
  const missing = [];
  for (let page = 1; page <= /** @type {number} */ (record.pages); page += 1) {
    if (!passed.has(page)) {
      missing.push(page);
    }
  }
  if (missing.length > 0) {
    const shown = missing.slice(0, 10).join('·');
    return `${record.id}: ${shown}${missing.length > 10 ? ` 등 ${missing.length}` : ''}쪽의 눈 확인 기록(by·date·result "통과…")이 없거나 맞지 않아요`;
  }
  return null;
}

/**
 * git 인덱스의 scripts/handout-redactions.yaml에서 가린 편집본의 쪽별 눈 확인 기록을 모은다(P5-14).
 * 스테이징하지 않은 기록은 통하지 않는다(그림 기록과 같은 규칙).
 * @param {RepoFile[]} files
 * @returns {{ records: Map<string, HandoutRecord>, errors: { file: string, message: string }[] }}
 */
export function collectHandoutRecords(files) {
  /** @type {Map<string, HandoutRecord>} */
  const records = new Map();
  /** @type {{ file: string, message: string }[]} */
  const errors = [];
  const file = files.find((candidate) => candidate.path.normalize('NFC') === HANDOUT_RECORD_FILE);
  if (!file || !file.content) {
    return { records, errors };
  }
  const document = parseDocument(file.content.toString('utf8'), { uniqueKeys: true });
  if (document.errors.length > 0) {
    errors.push({ file: HANDOUT_RECORD_FILE, message: `YAML 문법 오류: ${document.errors[0].message.split('\n')[0]}` });
    return { records, errors };
  }
  const data = document.toJS();
  const documents = isPlainObject(data) ? data.documents : undefined;
  if (!isPlainObject(documents)) {
    errors.push({ file: HANDOUT_RECORD_FILE, message: 'documents(문서 이름 → 기록)를 적어요.' });
    return { records, errors };
  }
  for (const [id, entry] of Object.entries(documents)) {
    if (!isPlainObject(entry)) continue;
    const output = isPlainObject(entry.output) ? entry.output : {};
    const source = isPlainObject(entry.source) ? entry.source : {};
    if (typeof output.path !== 'string') {
      errors.push({ file: HANDOUT_RECORD_FILE, message: `documents.${id}: output.path(편집본 경로)를 적어요.` });
      continue;
    }
    // 원본 쪽 뒤에 덧붙인 출처·라이선스 쪽(credits_page, 2026-09-26 P6-04)도 눈 확인 기록이 있어야 한다 — 검사하는 쪽 수 = 원본 쪽 수 + 1
    const appended = entry.credits_page ? 1 : 0;
    records.set(output.path.normalize('NFC'), {
      id,
      sha256: typeof output.sha256 === 'string' ? output.sha256 : undefined,
      pages: typeof source.pages === 'number' ? source.pages + appended : undefined,
      review: Array.isArray(entry.review) ? entry.review : [],
    });
  }
  return { records, errors };
}

/**
 * 파일 목록을 검사한다(git 없이도 부를 수 있어 단위 테스트가 쓴다).
 * @param {RepoFile[]} files
 * @param {RepoRules} rules
 * @returns {RepoProblem[]}
 */
export function checkRepoFiles(files, rules) {
  /** @type {RepoProblem[]} */
  const problems = [];
  const forbidden = new Set(FORBIDDEN_TRACKED_FILES.map((file) => file.toLowerCase()));
  const originalFolders = new Set(rules.originalFolderNames.map((name) => name.normalize('NFC')));

  for (const file of files) {
    const filePath = file.path.normalize('NFC');
    const extension = path.posix.extname(filePath).toLowerCase();
    const segments = filePath.split('/');

    if (forbidden.has(filePath.toLowerCase())) {
      problems.push({ kind: 'forbidden', path: filePath, detail: '직위 같은 운영자 정보가 있어 로컬에만 둬요(운영자 할 일 7번 답 O11 — 학교명은 공개, 직위는 답이 없어 SPEC.md는 공개하지 않아요, PD-37).' });
    }
    if (segments.length > 1 && originalFolders.has(segments[0])) {
      problems.push({ kind: 'original-folder', path: filePath, detail: `원본 자료 폴더 "${segments[0]}" 안의 파일이에요.` });
    }

    const inPycache = segments.includes('__pycache__');
    if (
      (ORIGINAL_FORMAT_EXTENSIONS.includes(extension) || inPycache) &&
      !rules.originalFormatAllowed.some((item) => matchesGlob(filePath, item.path))
    ) {
      const what = ORIGINAL_FORMAT_EXTENSIONS.includes(extension) ? extension : '__pycache__ 폴더';
      problems.push({ kind: 'original-format', path: filePath, detail: `${what}는 원본 자료 형식이에요.` });
    }

    if (file.size > LARGE_FILE_LIMIT_BYTES) {
      const allowed = rules.largeFileAllowed.find((item) => matchesGlob(filePath, item.path));
      if (!allowed) {
        problems.push({ kind: 'large-file', path: filePath, detail: `${formatMegabytes(file.size)}예요(기준 5MB).` });
      } else if (file.size > allowed.maxMb * 1024 * 1024) {
        problems.push({
          kind: 'large-file',
          path: filePath,
          detail: `${formatMegabytes(file.size)}예요. 허용 목록의 최대 ${allowed.maxMb}MB를 넘어요.`,
        });
      }
    }

    // 래스터 이미지는 저장소 어디에 있든(tests/·.github/·뿌리 포함) 눈 확인 기록이 있어야 한다. 공개 저장소라 폴더가 어디든 보이기 때문이다.
    const text = file.content ? decodeTextContent(filePath, file.content) : null;
    if (file.content && text === null && !BINARY_EXTENSIONS.has(extension)) {
      // 이진 확장자가 아닌데 글로 읽지 못했다 = 앞부분에 NUL이 있다. 예전에는 조용히 건너뛰어 개인정보 검사를 피하는 구멍이 됐다(2026-09-25 검토 반영).
      problems.push({ kind: 'nul-text', path: filePath, detail: '앞부분 8000바이트 안에 NUL 바이트가 있어 글로 읽지 못했어요.' });
    }
    const embeddedRaster = text !== null && EMBEDDED_RASTER.test(text);
    if (RASTER_IMAGE_EXTENSIONS.has(extension) || embeddedRaster) {
      const record = rules.imageReviews.get(filePath);
      const problem = describeReviewProblem(record, RASTER_IMAGE_EXTENSIONS.has(extension) ? file.content : null);
      if (problem) {
        const where = embeddedRaster ? '글·코드 파일 안에 data: 주소로 넣은 래스터 그림이 있는데 ' : '';
        const recordFile =
          isPlainObject(record) && typeof record.recordFile === 'string' ? record.recordFile : `차시 그림 목록(*${MANIFEST_SUFFIX}) 또는 ${IMAGE_ALLOWLIST_FILE}`;
        problems.push({ kind: 'image-review', path: filePath, detail: `${where}${problem}(${recordFile}).` });
      }
    }
    if (filePath.startsWith(HANDOUT_ROOT) && extension === '.pdf') {
      const problem = describeHandoutProblem(rules.handoutReviews?.get(filePath), file.content);
      if (problem) {
        problems.push({ kind: 'handout-review', path: filePath, detail: `${problem}(${HANDOUT_RECORD_FILE}).` });
      }
    }
    // 영상·소리: 사람이 끝까지 보고(듣고) 적은 기록(sha256 포함)이 있어야 한다. 글 검사를 못 하니 바이트를 한 번 글로 훑어 경로·주소·이메일도 본다.
    if (MEDIA_EXTENSIONS.has(extension)) {
      const record = rules.imageReviews.get(filePath);
      const problem =
        describeReviewProblem(record, file.content) ??
        (isPlainObject(record) && typeof record.sha256 !== 'string' ? '영상·소리 기록에는 sha256도 적어요(본 파일이 바뀌면 다시 봐야 해요)' : null);
      if (problem) {
        problems.push({ kind: 'media-review', path: filePath, detail: `${problem}(${IMAGE_ALLOWLIST_FILE}).` });
      }
      if (file.content) {
        for (const finding of findPrivacyPatterns(file.content.toString('latin1'))) {
          problems.push({ kind: 'privacy', path: filePath, detail: `파일 바이트 안: ${finding}` });
        }
      }
    }
    const allowedRoots = /** @type {Record<string, readonly string[]>} */ (BINARY_ALLOWED_ROOTS)[extension];
    if (allowedRoots && !allowedRoots.some((root) => filePath.startsWith(root))) {
      problems.push({ kind: 'binary-path', path: filePath, detail: `${extension} 파일은 ${allowedRoots.join('·')} 아래에만 둬요.` });
    } else if (extension === '.bin' && file.content && rules.firmwareHashes && !rules.firmwareHashes.has(sha256Hex(file.content))) {
      problems.push({
        kind: 'binary-path',
        path: filePath,
        detail: `펌웨어 목록(${FIRMWARE_MANIFEST_FILE})에 적힌 sha256과 같은 파일이 아니에요(목록에 없는 .bin — 보드 백업 같은 파일일 수 있어요).`,
      });
    }
    if (RASTER_IMAGE_EXTENSIONS.has(extension) && file.content) {
      if (isUncheckableRaster(extension)) {
        problems.push({ kind: 'image-metadata', path: filePath, detail: `${extension}는 메타데이터를 확인할 수 없는 형식이에요.` });
      } else if (rasterFormatOf(file.content) === null) {
        problems.push({
          kind: 'image-metadata',
          path: filePath,
          detail: `${extension} 파일인데 내용이 PNG·JPEG·GIF·WebP·BMP·ICO가 아니라 메타데이터를 확인할 수 없어요(2026-09-26 P6-05).`,
        });
      } else {
        const found = [...inspectImageMetadata(file.content).problems, ...inspectRasterLeftovers(file.content)];
        if (found.length > 0) {
          problems.push({ kind: 'image-metadata', path: filePath, detail: `${found.join(', ')}이(가) 남아 있어요.` });
        }
      }
    }

    if (!file.content) {
      continue;
    }
    if (ORIGINAL_NAME_SCAN_ROOTS.some((root) => filePath.startsWith(root)) && rules.originalNameNeedles.length > 0) {
      const found = findOriginalName(file.content, text, rules.originalNameNeedles);
      if (found) {
        problems.push({ kind: 'original-name', path: filePath, detail: `원본 이름 "${found}"이(가) 들어 있어요.` });
      }
    }
    if (text !== null) {
      // 예외(privacy_exceptions)는 public/licenses/ 아래 고지 원문의 이메일 모양만 건너뛴다. 비공개 이름(needles)은 늘 검사한다.
      const exception = (rules.privacyExceptions ?? []).find((item) => matchesGlob(filePath, item.path));
      const patternFindings = findPrivacyPatterns(text, exception ? { skipKinds: exception.kinds } : {});
      // 와이파이 비밀번호 모양은 학생·교사가 옮겨 적는 예제·차시에서만 본다(사이트 코드·검사의 가짜 값과 헷갈리지 않게)
      const secretFindings = filePath.startsWith('examples/') || filePath.startsWith('content/') ? findWifiSecrets(text) : [];
      for (const finding of [...patternFindings, ...secretFindings, ...findPrivacyNeedles(text, rules.privacyNeedles)]) {
        problems.push({ kind: 'privacy', path: filePath, detail: finding });
      }
    }
  }
  return problems;
}

/**
 * scripts/privacy-needles.json을 읽는다. 파일이 없으면 검사하지 않고(undefined), 모양이 틀리면 오류를 남긴다.
 * @param {string | null} text
 * @param {{ file: string, message: string }[]} errors
 * @returns {PrivacyNeedleSet | undefined}
 */
function parsePrivacyNeedles(text, errors) {
  if (text === null) {
    return undefined;
  }
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    errors.push({ file: PRIVACY_NEEDLES_FILE, message: `JSON 문법 오류: ${error instanceof Error ? error.message : String(error)}` });
    return undefined;
  }
  if (!isPlainObject(data) || typeof data.salt !== 'string' || data.salt.length < 8 || !Array.isArray(data.needles)) {
    errors.push({ file: PRIVACY_NEEDLES_FILE, message: 'salt(8글자 이상 글자)와 needles(목록)가 있어야 해요.' });
    return undefined;
  }
  /** @type {PrivacyNeedle[]} */
  const needles = [];
  data.needles.forEach((item, index) => {
    const where = `needles의 ${index + 1}번째 항목`;
    if (
      !isPlainObject(item) ||
      typeof item.label !== 'string' ||
      (item.script !== 'hangul' && item.script !== 'latin') ||
      !Number.isInteger(item.length) ||
      item.length < 2 ||
      typeof item.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(item.sha256)
    ) {
      errors.push({
        file: PRIVACY_NEEDLES_FILE,
        message: `${where}: label(글자), script(hangul 또는 latin), length(2 이상 정수), sha256(64자리 16진수)을 적어요. node scripts/privacy-needle.mjs <이름>으로 만들어요.`,
      });
      return;
    }
    needles.push({ label: item.label, script: item.script, length: item.length, sha256: item.sha256 });
  });
  return { salt: data.salt, needles };
}

/**
 * @param {string | null} text
 * @param {string} label
 * @param {{ file: string, message: string }[]} errors
 * @returns {Record<string, any>}
 */
function parseYamlObject(text, label, errors) {
  if (text === null) {
    return {};
  }
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0) {
    for (const error of document.errors) {
      errors.push({ file: label, message: `YAML 문법 오류: ${error.message.split('\n')[0]}` });
    }
    return {};
  }
  const data = document.toJS();
  if (data === null || data === undefined) {
    return {};
  }
  if (!isPlainObject(data)) {
    errors.push({ file: label, message: '맨 위는 "이름: 값" 모양이어야 해요.' });
    return {};
  }
  return data;
}

/**
 * @param {Record<string, any>} data
 * @param {string} key
 * @param {{ file: string, message: string }[]} errors
 * @returns {{ path: string, reason: string, maxMb: number }[]}
 */
function readAllowEntries(data, key, errors) {
  const value = data[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push({ file: REPO_ALLOWLIST_FILE, message: `${key}는 목록으로 적어요.` });
    return [];
  }
  /** @type {{ path: string, reason: string, maxMb: number }[]} */
  const entries = [];
  value.forEach((item, index) => {
    const where = `${key}의 ${index + 1}번째 항목`;
    const pattern = isPlainObject(item) ? item.path : undefined;
    const patternProblem = validateGlob(pattern);
    if (!isPlainObject(item) || patternProblem) {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: path — ${patternProblem ?? '경로가 없어요.'}` });
      return;
    }
    if (typeof item.reason !== 'string' || item.reason.trim() === '') {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: reason(올리는 이유)을 적어요.` });
      return;
    }
    let maxMb = DEFAULT_ALLOWED_MAX_MB;
    if (item.max_mb !== undefined) {
      if (typeof item.max_mb !== 'number' || !(item.max_mb > 0) || item.max_mb > 95) {
        errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: max_mb는 0보다 크고 95 이하인 숫자로 적어요.` });
        return;
      }
      maxMb = item.max_mb;
    }
    entries.push({ path: /** @type {string} */ (pattern), reason: item.reason.trim(), maxMb });
  });
  return entries;
}

/**
 * 허용 목록·원본 이름 등 검사 규칙을 읽는다. 파일이 없으면 빈 목록(더 엄격한 쪽)으로 본다.
 * @param {string} rootDir
 * @returns {{ rules: RepoRules, errors: { file: string, message: string }[] }}
 */
export function loadRepoRules(rootDir) {
  /** @type {{ file: string, message: string }[]} */
  const errors = [];
  /** @param {string} relativePath */
  const readOptional = (relativePath) => {
    const absolutePath = path.join(rootDir, relativePath);
    return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : null;
  };

  const repoAllowlist = parseYamlObject(readOptional(REPO_ALLOWLIST_FILE), REPO_ALLOWLIST_FILE, errors);
  const knownKeys = ['original_formats', 'large_files', 'privacy_exceptions', 'history_reviewed'];
  for (const key of Object.keys(repoAllowlist)) {
    if (!knownKeys.includes(key)) {
      errors.push({
        file: REPO_ALLOWLIST_FILE,
        message: `모르는 이름 "${key}"예요. ${knownKeys.join(', ')}만 써요.`,
      });
    }
  }
  const originalFormatAllowed = readAllowEntries(repoAllowlist, 'original_formats', errors).map(({ path: pattern, reason }) => ({
    path: pattern,
    reason,
  }));
  const largeFileAllowed = readAllowEntries(repoAllowlist, 'large_files', errors);
  const privacyExceptions = readPrivacyExceptions(repoAllowlist, errors);
  const historyReviewed = readHistoryReviewed(repoAllowlist, errors);

  // 눈 확인 기록(imageReviews)은 여기서 읽지 않는다. runRepoCheck가 git 인덱스의 기록 파일(옛 공용 기록 + 차시 그림 목록)에서
  // 모은다(collectImageRecords) — 디스크에만 있고 스테이징하지 않은 기록이 커밋을 통과시키지 않게(2026-09-25 P5-01).
  /** @type {Map<string, unknown>} */
  const imageReviews = new Map();

  const originalFolderNames = originalFolderNamesFromGitignore(readOptional('.gitignore') ?? '');
  const documentNames = [
    ...originalDocumentNamesFromInventory(readOptional('docs/INVENTORY.md') ?? ''),
    ...originalDocumentNamesOnDisk(rootDir, originalFolderNames),
  ];
  const privacyNeedles = parsePrivacyNeedles(readOptional(PRIVACY_NEEDLES_FILE), errors);
  return {
    rules: {
      originalFormatAllowed,
      largeFileAllowed,
      imageReviews,
      originalFolderNames,
      originalNameNeedles: buildOriginalNameNeedles(originalFolderNames, documentNames),
      privacyNeedles,
      privacyExceptions,
      historyReviewed,
    },
    errors,
  };
}

/**
 * history_reviewed 항목(기록 훑기에서 사람이 보고 개인정보가 아니라고 확인한 blob)을 읽는다 — blob(16진수 10~40자리)과 reason.
 * 저장소 검사(인덱스·작업 폴더)에는 쓰지 않는다 — 지금 파일은 늘 고칠 수 있기 때문이다.
 * @param {Record<string, any>} data
 * @param {{ file: string, message: string }[]} errors
 * @returns {{ blob: string, reason: string }[]}
 */
function readHistoryReviewed(data, errors) {
  const value = data.history_reviewed;
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push({ file: REPO_ALLOWLIST_FILE, message: 'history_reviewed는 목록으로 적어요.' });
    return [];
  }
  /** @type {{ blob: string, reason: string }[]} */
  const entries = [];
  value.forEach((item, index) => {
    const where = `history_reviewed의 ${index + 1}번째 항목`;
    const blob = isPlainObject(item) ? String(item.blob ?? '').toLowerCase() : '';
    if (!/^[0-9a-f]{10,40}$/u.test(blob)) {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: blob은 git blob 번호(16진수 10~40자리)로 적어요.` });
      return;
    }
    if (!isPlainObject(item) || typeof item.reason !== 'string' || item.reason.trim() === '') {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: reason(개인정보가 아니라고 본 까닭)을 적어요.` });
      return;
    }
    entries.push({ blob, reason: item.reason.trim() });
  });
  return entries;
}

/**
 * privacy_exceptions 항목을 읽는다. 경로는 public/licenses/ 아래여야 하고(제3자 라이선스 고지 원문만),
 * kinds는 PRIVACY_EXCEPTION_KINDS 가운데서만 고르며, reason(이유)이 있어야 한다.
 * @param {Record<string, any>} data
 * @param {{ file: string, message: string }[]} errors
 * @returns {{ path: string, kinds: string[], reason: string }[]}
 */
function readPrivacyExceptions(data, errors) {
  const value = data.privacy_exceptions;
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push({ file: REPO_ALLOWLIST_FILE, message: 'privacy_exceptions는 목록으로 적어요.' });
    return [];
  }
  /** @type {{ path: string, kinds: string[], reason: string }[]} */
  const entries = [];
  value.forEach((item, index) => {
    const where = `privacy_exceptions의 ${index + 1}번째 항목`;
    const pattern = isPlainObject(item) ? item.path : undefined;
    const patternProblem = validateGlob(pattern);
    if (!isPlainObject(item) || patternProblem) {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: path — ${patternProblem ?? '경로가 없어요.'}` });
      return;
    }
    if (!isPrivacyExceptionPathAllowed(pattern)) {
      errors.push({
        file: REPO_ALLOWLIST_FILE,
        message: `${where}: path는 ${PRIVACY_EXCEPTION_ROOT} 아래의 라이선스 고지 파일이나 ${PRIVACY_EXCEPTION_FILES.join(', ')}만 적을 수 있어요.`,
      });
      return;
    }
    const kinds = Array.isArray(item.kinds) ? item.kinds : [];
    if (kinds.length === 0 || !kinds.every((kind) => typeof kind === 'string' && PRIVACY_EXCEPTION_KINDS.includes(kind))) {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: kinds는 ${PRIVACY_EXCEPTION_KINDS.join(', ')} 가운데서 목록으로 적어요.` });
      return;
    }
    if (typeof item.reason !== 'string' || item.reason.trim() === '') {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: reason(예외를 두는 이유)을 적어요.` });
      return;
    }
    entries.push({ path: /** @type {string} */ (pattern), kinds: [...kinds], reason: item.reason.trim() });
  });
  return entries;
}

/**
 * git 인덱스(스테이징된 내용)의 파일 목록과 내용을 읽는다.
 * 커밋 전 훅에서는 git이 정한 GIT_INDEX_FILE을 그대로 따른다.
 * @param {string} rootDir
 * @returns {RepoFile[]}
 */
export function readIndexFiles(rootDir) {
  /**
   * @param {string[]} args
   * @param {string} [input]
   * @returns {Buffer}
   */
  const runGit = (args, input) =>
    execFileSync('git', args, { cwd: rootDir, input, maxBuffer: 2 * 1024 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });

  /** @type {Map<string, { mode: string, objectId: string }>} */
  const indexEntries = new Map();
  for (const record of runGit(['ls-files', '-s', '-z']).toString('utf8').split('\0')) {
    const tabIndex = record.indexOf('\t');
    if (tabIndex < 0) continue;
    const [mode, objectId] = record.slice(0, tabIndex).split(' ');
    const filePath = record.slice(tabIndex + 1).normalize('NFC');
    // 하위 모듈(160000)은 내용이 이 저장소에 없다. 충돌 중인 파일은 첫 단계만 본다.
    if (mode !== '160000' && !indexEntries.has(filePath)) {
      indexEntries.set(filePath, { mode, objectId });
    }
  }
  const records = [...indexEntries.entries()];
  if (records.length === 0) {
    return [];
  }

  const sizeLines = runGit(['cat-file', '--batch-check'], `${records.map(([, entry]) => entry.objectId).join('\n')}\n`)
    .toString('utf8')
    .trim()
    .split('\n');
  const sizes = sizeLines.map((line) => Number(line.split(' ')[2] ?? 0) || 0);

  const contentIds = [
    ...new Set(
      records
        .filter(([, entry], index) => entry.mode !== '120000' && sizes[index] <= MAX_CONTENT_BYTES)
        .map(([, entry]) => entry.objectId),
    ),
  ];
  /** @type {Map<string, Buffer>} */
  const contents = new Map();
  if (contentIds.length > 0) {
    const output = runGit(['cat-file', '--batch'], `${contentIds.join('\n')}\n`);
    let offset = 0;
    for (const objectId of contentIds) {
      const newlineIndex = output.indexOf(10, offset);
      if (newlineIndex < 0) break;
      const header = output.subarray(offset, newlineIndex).toString('utf8').split(' ');
      offset = newlineIndex + 1;
      if (header[1] === 'missing' || header[2] === undefined) continue;
      const size = Number(header[2]);
      contents.set(objectId, output.subarray(offset, offset + size));
      offset += size + 1;
    }
  }

  return records.map(([filePath, entry], index) => ({
    path: filePath,
    size: sizes[index],
    content: contents.get(entry.objectId) ?? null,
  }));
}

/**
 * 작업 폴더의 파일(추적 파일 + git이 무시하지 않는 새 파일, 지운 파일은 빼고)을 디스크에서 읽는다(2026-09-26 P6-05).
 * 여러 구역이 스테이징하지 않고 일하는 동안 "커밋될 모양"을 미리 볼 때 쓴다(check-repo.mjs --worktree). 커밋 전 훅은 인덱스를 본다.
 * @param {string} rootDir
 * @returns {RepoFile[]}
 */
export function readWorktreeFiles(rootDir) {
  /** @param {string[]} args */
  const listGit = (args) =>
    execFileSync('git', args, { cwd: rootDir, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).toString('utf8').split('\0');
  const listed = [...listGit(['ls-files', '-z']), ...listGit(['ls-files', '-z', '--others', '--exclude-standard'])]
    .filter((file) => file !== '')
    .map((file) => file.normalize('NFC'));
  /** @type {RepoFile[]} */
  const files = [];
  for (const filePath of [...new Set(listed)].sort()) {
    const absolutePath = path.join(rootDir, ...filePath.split('/'));
    /** @type {fs.Stats} */
    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch {
      continue; // 작업 폴더에서 지운 파일
    }
    if (stat.isDirectory()) continue; // 하위 모듈
    const readable = !stat.isSymbolicLink() && stat.size <= MAX_CONTENT_BYTES;
    files.push({ path: filePath, size: stat.size, content: readable ? fs.readFileSync(absolutePath) : null });
  }
  return files;
}

/**
 * 저장소 검사를 한 번 돌린다. source가 'worktree'면 스테이징 전 작업 폴더(readWorktreeFiles)를, 아니면 git 인덱스를 본다.
 * @param {{ rootDir: string, source?: 'index' | 'worktree' }} options
 * @returns {{ ok: boolean, problems: RepoProblem[], fileCount: number, source: 'index' | 'worktree' }}
 */
export function runRepoCheck({ rootDir, source = 'index' }) {
  const { rules, errors } = loadRepoRules(rootDir);
  const files = source === 'worktree' ? readWorktreeFiles(rootDir) : readIndexFiles(rootDir);
  const imageRecords = collectImageRecords(files);
  rules.imageReviews = imageRecords.records;
  errors.push(...imageRecords.errors);
  const handoutRecords = collectHandoutRecords(files);
  rules.handoutReviews = handoutRecords.records;
  errors.push(...handoutRecords.errors);
  const firmware = collectFirmwareHashes(files);
  rules.firmwareHashes = firmware.hashes;
  errors.push(...firmware.errors);
  const problems = checkRepoFiles(files, rules);
  for (const error of errors) {
    problems.push({ kind: 'config', path: error.file, detail: error.message });
  }
  return { ok: problems.length === 0, problems, fileCount: files.length, source };
}

/**
 * 펌웨어 목록(public/firmware/manifest.json — 검사 대상 파일 목록 안의 것)에 적힌 sha256들. 목록 파일이 없으면 hashes는 undefined
 * (대조하지 않음 — 펌웨어가 없는 저장소·단위 테스트). 목록이 있는데 읽을 수 없으면 설정 오류로 알린다.
 * @param {RepoFile[]} files
 * @returns {{ hashes: Set<string> | undefined, errors: { file: string, message: string }[] }}
 */
export function collectFirmwareHashes(files) {
  const manifest = files.find((file) => file.path.normalize('NFC') === FIRMWARE_MANIFEST_FILE);
  if (!manifest || !manifest.content) {
    return { hashes: undefined, errors: [] };
  }
  try {
    const data = JSON.parse(manifest.content.toString('utf8'));
    const list = isPlainObject(data) && Array.isArray(data.firmware) ? data.firmware : [];
    const hashes = new Set(
      list.flatMap((item) => (isPlainObject(item) && typeof item.sha256 === 'string' ? [item.sha256.toLowerCase()] : [])),
    );
    return { hashes, errors: [] };
  } catch (error) {
    return {
      hashes: undefined,
      errors: [{ file: FIRMWARE_MANIFEST_FILE, message: `펌웨어 목록을 JSON으로 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }
}

// ── 기록·빌드 결과 훑기(2026-09-26 P6-05 개인정보 최종 점검에서 만든 것 — 커밋 전 훅·CI에는 걸지 않고 손으로 돌린다) ──

/**
 * @typedef {object} HistoryFinding
 * @property {string} blob git blob 번호(40자리)
 * @property {string[]} paths 그 내용이 있었던 경로들
 * @property {boolean} inHead 지금 HEAD에도 있는지
 * @property {string[]} details 찾은 것(값은 가려서)
 * @property {string | null} reviewed history_reviewed에 적힌 까닭(없으면 null)
 */

/** 파일 경로들 가운데 하나라도 확장자가 맞는지 */
const anyExtension = (/** @type {string[]} */ paths, /** @type {Set<string>} */ set) =>
  paths.some((file) => set.has(path.posix.extname(file).toLowerCase()));

/**
 * 그림 하나의 메타데이터·남은 것(형식을 모르면 그 사실). 기록·빌드 결과 훑기가 함께 쓴다.
 * @param {Buffer} content
 * @param {string} extension
 * @returns {string[]}
 */
function rasterFindings(content, extension) {
  if (isUncheckableRaster(extension)) return [`${extension}는 메타데이터를 확인할 수 없는 형식이에요`];
  if (rasterFormatOf(content) === null) return [`${extension} 파일인데 내용 형식을 알 수 없어요`];
  return [...inspectImageMetadata(content).problems, ...inspectRasterLeftovers(content)];
}

/**
 * git 기록 전체(모든 가지·태그의 모든 커밋에 한 번이라도 들어간 파일 내용)를 개인정보 규칙으로 훑는다.
 * 공개 저장소는 지운 파일도 기록으로 남아 누구나 볼 수 있다. 기록은 고칠 수 없으므로(기록 재작성 금지 — OVERNIGHT §3) 찾으면 운영자와
 * 정하고, 사람이 보고 개인정보가 아니라고 확인한 것은 scripts/repo-allowlist.yaml의 history_reviewed에 blob 번호와 까닭을 적는다.
 * 검사: 글 파일의 개인정보 모양·비공개 이름(privacy_exceptions 경로는 이메일만 건너뜀), 래스터 그림의 메타데이터·남은 것.
 * @param {{ rootDir: string }} options
 * @returns {{ ok: boolean, blobCount: number, findings: HistoryFinding[], errors: { file: string, message: string }[] }}
 */
export function runHistoryCheck({ rootDir }) {
  const { rules, errors } = loadRepoRules(rootDir);
  /**
   * @param {string[]} args
   * @param {string} [input]
   */
  const runGit = (args, input) =>
    execFileSync('git', args, { cwd: rootDir, input, maxBuffer: 4 * 1024 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  /** @type {Map<string, Set<string>>} */
  const pathsOf = new Map();
  for (const line of runGit(['rev-list', '--objects', '--all']).toString('utf8').split('\n')) {
    const space = line.indexOf(' ');
    if (space < 0) continue;
    const id = line.slice(0, space);
    if (!pathsOf.has(id)) pathsOf.set(id, new Set());
    pathsOf.get(id)?.add(line.slice(space + 1).normalize('NFC'));
  }
  const ids = [...pathsOf.keys()];
  if (ids.length === 0) return { ok: errors.length === 0, blobCount: 0, findings: [], errors };
  let headBlobs = new Set();
  try {
    headBlobs = new Set(runGit(['ls-tree', '-r', '-z', 'HEAD']).toString('utf8').split('\0').map((entry) => entry.split(/\s+/u)[2]));
  } catch {
    // 커밋이 없는 저장소
  }
  /** @type {{ id: string, size: number, paths: string[] }[]} */
  const blobs = [];
  runGit(['cat-file', '--batch-check'], `${ids.join('\n')}\n`)
    .toString('utf8')
    .trim()
    .split('\n')
    .forEach((line, index) => {
      const [id, type, size] = line.split(' ');
      if (type === 'blob' && id === ids[index]) blobs.push({ id, size: Number(size), paths: [...(pathsOf.get(id) ?? [])] });
    });
  // 내용을 읽을 것: 그림, 그리고 이진 확장자가 아닌 파일(글)
  const wanted = blobs.filter(
    (blob) => blob.size <= MAX_CONTENT_BYTES && (anyExtension(blob.paths, RASTER_IMAGE_EXTENSIONS) || !anyExtension(blob.paths, BINARY_EXTENSIONS)),
  );
  /** @type {Map<string, Buffer>} */
  const contents = new Map();
  if (wanted.length > 0) {
    const output = runGit(['cat-file', '--batch'], `${wanted.map((blob) => blob.id).join('\n')}\n`);
    let offset = 0;
    for (const blob of wanted) {
      const newlineIndex = output.indexOf(10, offset);
      if (newlineIndex < 0) break;
      const header = output.subarray(offset, newlineIndex).toString('utf8').split(' ');
      offset = newlineIndex + 1;
      if (header[1] === 'missing' || header[2] === undefined) continue;
      const size = Number(header[2]);
      contents.set(blob.id, output.subarray(offset, offset + size));
      offset += size + 1;
    }
  }
  /** @type {HistoryFinding[]} */
  const findings = [];
  for (const blob of wanted) {
    const content = contents.get(blob.id);
    if (!content) continue;
    const rasterPath = blob.paths.find((file) => RASTER_IMAGE_EXTENSIONS.has(path.posix.extname(file).toLowerCase()));
    /** @type {string[]} */
    let details;
    if (rasterPath) {
      details = rasterFindings(content, path.posix.extname(rasterPath).toLowerCase());
    } else {
      const text = decodeTextContent(blob.paths[0] ?? '', content);
      if (text === null) {
        details = ['앞부분 8000바이트 안에 NUL 바이트가 있어 글로 읽지 못했어요'];
      } else {
        const exception = (rules.privacyExceptions ?? []).find((item) => blob.paths.some((file) => matchesGlob(file, item.path)));
        details = [...findPrivacyPatterns(text, exception ? { skipKinds: exception.kinds } : {}), ...findPrivacyNeedles(text, rules.privacyNeedles)];
      }
    }
    if (details.length === 0) continue;
    const reviewed = (rules.historyReviewed ?? []).find((item) => blob.id.startsWith(item.blob));
    findings.push({ blob: blob.id, paths: blob.paths, inHead: headBlobs.has(blob.id), details, reviewed: reviewed ? reviewed.reason : null });
  }
  return { ok: errors.length === 0 && findings.every((finding) => finding.reviewed !== null), blobCount: blobs.length, findings, errors };
}

/**
 * 기록 훑기 결과를 한국어 보고서로.
 * @param {ReturnType<typeof runHistoryCheck>} result
 * @returns {string}
 */
export function formatHistoryReport(result) {
  const open = result.findings.filter((finding) => finding.reviewed === null);
  const reviewed = result.findings.filter((finding) => finding.reviewed !== null);
  const lines = [
    open.length === 0 && result.errors.length === 0
      ? `[저장소 기록 검사] 통과 — 기록 속 파일 내용 ${result.blobCount}개(사람이 보고 확인해 둔 것 ${reviewed.length}개)`
      : `[저장소 기록 검사] 확인할 것 ${open.length + result.errors.length}건 — 기록 속 파일 내용 ${result.blobCount}개`,
  ];
  for (const finding of open) {
    lines.push(`  - ${finding.paths.join(' | ')} (blob ${finding.blob.slice(0, 10)}, ${finding.inHead ? '지금도 있음' : '기록에만 있음'}): ${finding.details.join(' / ')}`);
  }
  for (const error of result.errors) {
    lines.push(`  - ${error.file}: ${error.message}`);
  }
  if (open.length > 0) {
    lines.push(
      '  기록은 고치거나 지울 수 없어요(기록 재작성 금지). 진짜 개인정보면 운영자에게 알려 함께 정하고, 개인정보가 아니면(가짜 값·자리표시자) ' +
        `${REPO_ALLOWLIST_FILE}의 history_reviewed에 blob 번호(앞 10자리 이상)와 까닭을 적어요.`,
    );
  }
  return lines.join('\n');
}

/** 빌드 결과에서 사이트가 만든 것이 아니라 npm 패키지에서 그대로 복사한 자리(그림 메타데이터는 참고로만) */
const BUILD_VENDOR_ROOT = 'vendor/';

/**
 * 이 컴퓨터를 가리키는 절대 경로 조각(저장소 폴더·홈 폴더 — 역슬래시·슬래시·Git Bash 모양, 소문자로 비교).
 * @param {string} rootDir
 * @returns {string[]}
 */
function localPathMarkers(rootDir) {
  const markers = new Set();
  for (const base of [path.resolve(rootDir), os.homedir()]) {
    const forward = String(base ?? '').split(path.sep).join('/').replace(/\/+$/u, '');
    if (forward.length < 8) continue;
    markers.add(forward);
    markers.add(forward.replaceAll('/', '\\'));
    markers.add(forward.replaceAll('/', '\\\\'));
    const drive = /^([A-Za-z]):\//u.exec(forward);
    if (drive) markers.add(`/${drive[1].toLowerCase()}${forward.slice(2)}`);
  }
  return [...markers].map((marker) => marker.normalize('NFC').toLowerCase());
}

/**
 * 빌드 결과 폴더(배포물·오프라인판 재료)를 훑는다. 빌드는 저장소에 없는 것을 만들 수 있다 — 번들러가 넣는 이 컴퓨터의 절대 경로,
 * 복사해 온 그림 등. 검사: 이 저장소 폴더·홈 폴더의 절대 경로(모든 파일, 이진 포함), 글 파일의 개인정보 모양·비공개 이름
 * (licenses/ 아래와 이름이 LICENSE·NOTICE·COPYING인 고지 파일은 이메일만 건너뜀), 그림의 메타데이터·남은 것
 * (vendor/ 아래는 npm 패키지에서 그대로 복사한 파일이라 참고로만 알린다).
 * @param {{ rootDir: string, outDir: string }} options
 * @returns {{ ok: boolean, problems: RepoProblem[], notes: string[], fileCount: number, outDir: string }}
 */
export function runBuildOutputCheck({ rootDir, outDir }) {
  const { rules, errors } = loadRepoRules(rootDir);
  const absoluteOut = path.resolve(rootDir, outDir);
  const markers = localPathMarkers(rootDir);
  /** @type {RepoProblem[]} */
  const problems = errors.map((error) => ({ kind: /** @type {const} */ ('config'), path: error.file, detail: error.message }));
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const files = [];
  /** @param {string} directory */
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(absoluteOut);
  for (const file of files) {
    const relative = path.relative(absoluteOut, file).split(path.sep).join('/').normalize('NFC');
    const extension = path.posix.extname(relative).toLowerCase();
    const content = fs.readFileSync(file);
    const lowered = content.toString('utf8').normalize('NFC').toLowerCase();
    if (markers.some((marker) => lowered.includes(marker))) {
      problems.push({ kind: 'privacy', path: relative, detail: '이 컴퓨터의 절대 경로(저장소 폴더나 홈 폴더)가 들어 있어요 — 빌드 도구가 넣은 경로예요.' });
    }
    if (RASTER_IMAGE_EXTENSIONS.has(extension)) {
      const found = rasterFindings(content, extension);
      if (found.length === 0) continue;
      if (relative.startsWith(BUILD_VENDOR_ROOT)) notes.push(`${relative}: ${found.join(', ')}(npm 패키지 원본 그대로 — 사이트가 만든 그림이 아니에요)`);
      else problems.push({ kind: 'image-metadata', path: relative, detail: `${found.join(', ')}이(가) 남아 있어요.` });
      continue;
    }
    const text = decodeTextContent(relative, content);
    if (text === null) continue;
    const isNotice = relative.startsWith('licenses/') || /(?:^|\/)(?:LICENSE|NOTICE|COPYING)[^/]*$/u.test(relative);
    for (const finding of [...findPrivacyPatterns(text, isNotice ? { skipKinds: ['email'] } : {}), ...findPrivacyNeedles(text, rules.privacyNeedles)]) {
      problems.push({ kind: 'privacy', path: relative, detail: finding });
    }
  }
  return { ok: problems.length === 0, problems, notes, fileCount: files.length, outDir: path.relative(rootDir, absoluteOut).split(path.sep).join('/') || '.' };
}

/**
 * 빌드 결과 훑기 결과를 한국어 보고서로.
 * @param {ReturnType<typeof runBuildOutputCheck>} result
 * @returns {string}
 */
export function formatBuildOutputReport(result) {
  const head = result.ok
    ? `[빌드 결과 검사] 통과 — ${result.outDir}/ 파일 ${result.fileCount}개`
    : `[빌드 결과 검사] 실패 — ${result.outDir}/ 파일 ${result.fileCount}개에서 문제 ${result.problems.length}건`;
  const lines = [head];
  for (const problem of result.problems) lines.push(`  - ${problem.path}: ${problem.detail}`);
  if (result.notes.length > 0) {
    lines.push(`  참고 ${result.notes.length}건:`);
    for (const note of result.notes) lines.push(`    · ${note}`);
  }
  if (!result.ok) {
    lines.push('  빌드 결과는 저장소 파일에서 만들어져요. 저장소 파일을 고치고 다시 빌드해요(절대 경로면 그 경로를 넣은 설정·스크립트를 찾아요).');
  }
  return lines.join('\n');
}

/**
 * 검사 결과를 사람이 읽는 한국어 보고서로 만든다.
 * @param {{ ok: boolean, problems: RepoProblem[], fileCount: number, source?: 'index' | 'worktree' }} result
 * @returns {string}
 */
export function formatRepoReport(result) {
  if (result.ok) {
    return result.source === 'worktree'
      ? `[저장소 검사] 통과 — 작업 폴더 파일 ${result.fileCount}개(추적 파일 + 새 파일, 스테이징 전 내용)`
      : `[저장소 검사] 통과 — 추적 파일 ${result.fileCount}개`;
  }
  const lines = [`[저장소 검사] 실패 — 문제 ${result.problems.length}건. 고치기 전에는 커밋과 배포를 멈춰요.`];
  for (const [kind, info] of Object.entries(PROBLEM_KINDS)) {
    const items = result.problems.filter((problem) => problem.kind === kind);
    if (items.length === 0) continue;
    lines.push('', `■ ${info.title}(${items.length}건)`);
    for (const item of items) {
      lines.push(`  - ${item.path}: ${item.detail}`);
    }
    lines.push(`  고치는 법: ${info.fix}`);
  }
  lines.push('', '스테이징에서만 빼려면: git restore --staged <파일>');
  return lines.join('\n');
}
