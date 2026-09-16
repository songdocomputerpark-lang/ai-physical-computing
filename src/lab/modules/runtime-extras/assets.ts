/**
 * 러너 공통 모듈의 자산 이름·경로 한 곳(P2-10). 파이썬 쪽(apc_files.py)의 같은 이름 상수와 값이 같아야 한다(tests/unit/runtime-extras/assets.test.ts가 대조).
 *
 * - 작업 폴더 WORK_DIR: Pyodide의 기본 현재 폴더(/home/pyodide). 학생 코드의 cv2.imread('mask.png')·open('a.txt')는 이 폴더를 본다(2026-09-16 Node Pyodide로 확인).
 * - mask.png: 1-3-3 심화 실습(f039)이 읽는 투명 배경 가면 그림. 자료에 없어 사이트가 직접 그린 assets/mask.svg를 브라우저가 canvas로 PNG(RGBA)로 바꾼다
 *   (그리는 코드는 mask.ts. 저장소에는 SVG만 두고 래스터 파일을 커밋하지 않는다 — 눈 확인 기록·출처 등록이 필요한 사진 파일이 아니다).
 * - 사이트 글꼴: PIL.ImageFont.truetype이 Windows 글꼴 경로를 부를 때 대신 쓰는 한글 글꼴(Pretendard, OFL-1.1). 같은 사이트의 정적 파일을
 *   처음 필요할 때 받아 Pyodide 가상 파일시스템 SITE_FONT_FS_PATH에 쓴다. 지금 사이트가 배포하는 Pretendard는 가변 글꼴 woff2 다이내믹 서브셋
 *   92조각뿐이라 FreeType이 열 수 있는 완성된 파일이 없다 → 통합 단계가 정적 글꼴 파일 하나를 넣는다(.cache/phase2-requests/runner.md 1번).
 *   SITE_FONT_CANDIDATES를 앞에서부터 받아 보고 먼저 되는 것을 쓰므로, 통합이 어느 자리에 두든(빌드 때 복사하는 public/vendor/ 또는 저장소의
 *   public/fonts/) 코드를 고치지 않아도 된다. 하나도 없으면 파이썬 쪽이 Pillow 기본 글꼴로 그리고 한국어로 알린다(한글은 빈칸).
 */
import { withBase } from '../../../lib/url.ts';

/** Pyodide의 기본 작업 폴더(학생 코드의 상대 경로 기준) */
export const WORK_DIR = '/home/pyodide';

/** 자체 제작 가면 그림의 파일 이름과 크기(px). f039는 얼굴 크기에 맞춰 다시 늘리므로 원본 크기는 모양 비율만 정한다. */
export const MASK_FILE_NAME = 'mask.png';
export const MASK_WIDTH = 400;
export const MASK_HEIGHT = 500;

/** 사이트 글꼴 파일 이름(공식 배포판 파일 이름 그대로)과 사람이 읽는 이름, Pyodide 가상 파일시스템 안의 위치 */
export const SITE_FONT_FILE = 'Pretendard-Regular.otf';
export const SITE_FONT_LABEL = 'Pretendard';
export const SITE_FONT_FS_PATH = `/site-assets/fonts/${SITE_FONT_FILE}`;

/**
 * 사이트 글꼴 파일을 찾아볼 같은 사이트 주소(앞에서부터 받아 보고 먼저 되는 것을 쓴다).
 * 1) public/vendor/pretendard/ — 빌드 때 npm 패키지에서 복사(저장소에 바이너리 없음, 통합 요청 1번 ①)
 * 2) public/fonts/pretendard/static/ — 저장소에 직접 둔 경우(요청 1번 ②)
 * 사이트 밖 주소는 넣지 않는다(원칙 2: 허용 주소 밖 요청 0건).
 */
export const SITE_FONT_CANDIDATES: readonly string[] = Object.freeze([
  withBase(`vendor/pretendard/${SITE_FONT_FILE}`),
  withBase(`fonts/pretendard/static/${SITE_FONT_FILE}`),
]);

/** PNG 파일 머리(8바이트)인지 — 테스트·안내용 */
export function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= 8 && signature.every((value, index) => bytes[index] === value);
}
