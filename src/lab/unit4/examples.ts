/**
 * 4단원 통합 화면의 예제 목록 규칙과 짝(PLAN §8.4 P4-09, CODE_MAPPING §6.1 B3·B4·B5).
 *
 * 목록: 두 실습실의 **4단원 폴더** — 컴퓨터 쪽 `examples/vision/u4/`, 보드 쪽 `examples/esp32/u4/` — 와,
 *   같은 블루투스 길(컴퓨터 `bluetooth.init().send()` → 보드 `ESP32BLE.read()`)을 쓰는 **다른 단원의 짝 두 쌍**(아래 EXTRA_*)만 싣는다.
 *   · 새 4단원 예제는 그 폴더에 .py 하나를 두면 저절로 들어온다(절대 원칙 6 — 폴더 규칙이지 목록 파일이 아니다).
 *   · 두 실습실의 예제 전부(약 150개, 예제 코드 JSON 약 290KB)를 싣던 앞 판에서 줄였다. 이 화면은 파이썬을 두 벌 띄우는
 *     가장 무거운 페이지라 HTML부터 가볍게 한다(성능 측정 결과와 함께 보고 — `.cache/phase4-notes/zone-h-unit4.md`).
 *     다른 예제는 영상처리·ESP32 실습실에서 그대로 연다.
 *   · 다른 단원의 짝(3-1-3 손끝 좌표 f089↔f086, 블루투스 교안 f158↔f157)을 싣는 까닭: 컴퓨터 쪽 bluetooth 흉내는 **같은 문서의**
 *     가상 보드에만 닿아서(src/lab/modules/ble-pc/), 두 칸이 한 화면에 있는 곳이 이 페이지뿐이다. PLAN §8.4 P4-02의 완료 기준
 *     "f089·f158 → f086·f157이 수정 없이 짝지어 돈다"를 여기서 채운다.
 * 짝: 컴퓨터 쪽이 보내는 글과 보드 쪽이 읽는 글이 같은 것끼리(3-1-3·교안은 `x,y` 매 장, 4-1-4는 `DATA,x,y` 0.5초마다, 4-2는 `DATA,x,y,d,r` 매 장).
 *   짝마다 주소 이름(id)이 있어 `/labs/unit4/?pair=4-1-4`처럼 링크 하나로 두 칸을 함께 채운다(2026-09-26 PROGRESS 미해결 179 — 차시 따라하기 링크).
 *   id를 바꾸면 그 id를 쓰는 차시 링크도 함께 고친다(tests/e2e/unit4.spec.ts가 차시 md의 ?pair= 링크를 모두 대조한다).
 *
 * DOM·실습실 코드를 import하지 않아 빌드(.astro 프런트매터)와 브라우저 양쪽에서 쓴다.
 */
import { esp32ExampleIdFromFile } from '../esp32/examples.ts';
import { exampleIdFromFile } from '../vision/examples.ts';

/** 컴퓨터 쪽 예제 폴더(examples/ 뒤 경로의 앞부분) */
export const UNIT4_PC_DIR = 'vision/u4/';
/** 보드 쪽 예제 폴더 */
export const UNIT4_BOARD_DIR = 'esp32/u4/';

/** 빌드 때 읽을 파일 모양(import.meta.glob은 글자 그대로만 받으므로 페이지에도 같은 글자를 적는다 — 이 값과 어긋나면 테스트가 잡는다) */
export const UNIT4_PC_GLOB = '/examples/vision/u4/**/*.py';
export const UNIT4_BOARD_GLOB = '/examples/esp32/u4/**/*.py';

/** 4단원 폴더 밖에서 함께 싣는 컴퓨터 쪽 예제(같은 블루투스 길 — 머리말 설명 참고). 페이지의 glob 목록에도 같은 글자로 적는다 */
export const UNIT4_EXTRA_PC_FILES: readonly string[] = Object.freeze(['vision/u3/3-1-3-hand-ble-xy.py', 'vision/bt/b11-finger-xy-send.py']);
/** 4단원 폴더 밖에서 함께 싣는 보드 쪽 예제 */
export const UNIT4_EXTRA_BOARD_FILES: readonly string[] = Object.freeze(['esp32/u3/3-1-3-ble-xy-rgb.py', 'esp32/bt/b10-two-values-rgb.py']);

/** 컴퓨터 쪽 기본 예제 — 4-2-1 최종판(f104). 카메라 + 얼굴 그물 + 가상 데스크톱 + 블루투스가 한꺼번에 도는 가장 무거운 예제다. */
export const DEFAULT_PC_FILE = 'vision/u4/4-2-1-face-mouse-ble-tx.py';

/**
 * 보드 쪽 기본 예제 — 4-2-2 심화의 **사이트판**(f110 사이트판). LCD·서보 2·RGB·레이저·버저를 모두 쓰고,
 * 원본에서 주석 처리돼 있던 "레이저 끄기"가 풀려 있다(PD-23, 구역 B가 만든 파일). 실물로 옮길 때도 이 판이 안전하다.
 */
export const DEFAULT_BOARD_FILE = 'esp32/u4/4-2-2-adv-ble-servo-rgb-laser-buzzer-site.py';

export interface Unit4Pair {
  /**
   * 주소로 고르는 이름 — `/labs/unit4/?pair=<id>`(2026-09-26 PROGRESS 미해결 179). 차시 번호로 시작하고(4-1-4, 4-2-1-adv …) 겹치지 않는다.
   * 차시 번호만 적으면(`?pair=4-2-2`) 그 번호로 시작하는 첫 짝이다(findPairView). 차시 따라하기가 이 주소로 두 칸을 한 번에 채운다.
   */
  readonly id: string;
  /** 짝 이름(화면에 그대로) */
  readonly label: string;
  /** 무엇이 보이는지 한 줄 */
  readonly note: string;
  /** 컴퓨터 쪽 예제(examples/ 뒤 경로) */
  readonly pc: string;
  /** 보드 쪽 예제 */
  readonly board: string;
}

/** 화면에 그리는 짝(예제 id까지 정한 것 — 페이지가 두 실습실 목록에 모두 있는 짝만 만든다) */
export interface Unit4PairView {
  /** 주소로 고르는 이름(Unit4Pair.id) */
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly pcId: string;
  readonly boardId: string;
}

/**
 * 짝이 맞는 예제(화면의 [이 짝 불러오기] 목록, 주소 `?pair=<id>`). 순서는 교과서 차시 순서 — 차시 번호만 적은 주소는 그 차시의 첫 짝이다.
 * 원본 파일이 실물에서도 멈추는 f111·f113은 사이트판만 싣는다(원본은 목록에서 골라 비교할 수 있다 — 구역 B 사이드카 설명).
 */
export const PAIRS: readonly Unit4Pair[] = Object.freeze([
  {
    id: '4-1-4',
    label: '4-1-4 — 코 좌표를 LCD에',
    note: '0.5초마다 DATA,x,y(카메라 좌표)를 보내고 LCD에 적어요.',
    pc: 'vision/u4/4-1-4-adv-face-ble-tx.py',
    board: 'esp32/u4/4-1-4-ble-lcd-rx.py',
  },
  {
    id: '4-2-1',
    label: '4-2-1 기본 — 마우스 좌표를 LCD에',
    note: '얼굴로 움직인 마우스 좌표와 클릭 수를 LCD에 적어요.',
    pc: DEFAULT_PC_FILE,
    board: 'esp32/u4/4-2-1-adv-ble-data-lcd.py',
  },
  {
    id: '4-2-1-adv',
    label: '4-2-1 심화 — 서보 두 개',
    note: '마우스 좌표를 각도로 바꿔 서보 X·Y를 돌려요(화면 3840×2160 가정).',
    pc: DEFAULT_PC_FILE,
    board: 'esp32/u4/4-2-1-adv-ble-servo-lcd.py',
  },
  {
    id: '4-2-2',
    label: '4-2-2 기본 — 서보와 RGB LED',
    note: '클릭하면 LED가 아주 잠깐 켜져요(다음 좌표가 오면 바로 꺼져요 — 원본 그대로).',
    pc: DEFAULT_PC_FILE,
    board: 'esp32/u4/4-2-2-ble-servo-rgb.py',
  },
  {
    id: '4-2-2-adv',
    label: '4-2-2 심화 — 서보·RGB·레이저·버저(사이트판)',
    note: '값이 오는 동안 레이저가 켜지고, 클릭하면 버저가 울려요.',
    pc: DEFAULT_PC_FILE,
    board: DEFAULT_BOARD_FILE,
  },
  {
    id: '4-2-2-mount',
    label: '4-2-2 심화 — 거치대 각도(사이트판)',
    note: '거치대에 맞춰 서보가 도는 범위를 좁혔어요.',
    pc: DEFAULT_PC_FILE,
    board: 'esp32/u4/4-2-2-adv-ble-mount-site.py',
  },
  {
    id: '4-2-2-explore',
    label: '4-2-2 탐구 — 클릭 LED 2초 유지(사이트판)',
    note: '클릭 LED가 2초 동안 켜져 있어 눈으로 보기 쉬워요. 배선이 다른 예제라 보드 그림을 봐요.',
    pc: DEFAULT_PC_FILE,
    board: 'esp32/u4/4-2-2-explore-rgb-buzzer-site.py',
  },
  {
    id: '4-2-3',
    label: '4-2-3 — bluetooth_lib 이름으로 부르기(사이트판)',
    note: '컴퓨터 쪽은 부르는 이름만 다르고, 보드 쪽은 서보 각도 범위가 달라요.',
    pc: 'vision/u4/4-2-3-face-mouse-ble-tx-lib.py',
    board: 'esp32/u4/4-2-3-ble-servo-rgb-laser-buzzer-site.py',
  },
  {
    id: '3-1-3',
    label: '(3단원) 3-1-3 — 손끝 좌표로 RGB LED',
    note: '검지 끝 좌표 "x,y"를 매 장 보내요. 보드는 2초에 하나씩 읽어 빨강·초록·파랑을 켜요(입력은 손).',
    pc: 'vision/u3/3-1-3-hand-ble-xy.py',
    board: 'esp32/u3/3-1-3-ble-xy-rgb.py',
  },
  {
    id: 'bt-finger-rgb',
    label: '(블루투스 교안) 손끝 좌표 두 개로 RGB LED',
    note: '3-1-3과 같은 일을 하는 교안 판이에요. 보드의 LED 핀만 달라요(27·32·33).',
    pc: 'vision/bt/b11-finger-xy-send.py',
    board: 'esp32/bt/b10-two-values-rgb.py',
  },
]);

/**
 * 두 목록에 모두 있는 짝만 id로 바꿔 돌려준다(파일이 빠지면 그 짝도 빠진다). 빠진 짝은 missing으로 알려 빌드 경고에 쓴다.
 */
export function pairViews(pcIds: ReadonlySet<string>, boardIds: ReadonlySet<string>, pairs: readonly Unit4Pair[] = PAIRS): { views: Unit4PairView[]; missing: Unit4Pair[] } {
  const views: Unit4PairView[] = [];
  const missing: Unit4Pair[] = [];
  for (const pair of pairs) {
    const pcId = pcExampleId(pair.pc);
    const boardId = boardExampleId(pair.board);
    if (pcIds.has(pcId) && boardIds.has(boardId)) {
      views.push({ id: pair.id, label: pair.label, note: pair.note, pcId, boardId });
    } else {
      missing.push(pair);
    }
  }
  return { views, missing };
}

/** 주소 값(`?pair=`)을 다듬는다: 앞뒤 빈칸을 떼고 소문자로(영문·숫자·하이픈만 — 아니면 빈 글자) */
export function normalizePairParam(value: string | null | undefined): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9-]{1,40}$/u.test(text) ? text : '';
}

/**
 * `?pair=` 값으로 짝을 고른다(2026-09-26 PROGRESS 미해결 179): 이름(id)이 같은 짝, 없으면 그 값에 하이픈을 붙인 것으로 시작하는 첫 짝
 * (`4-2-2` → 4-2-2 기본). 목록 차례는 교과서 차시 차례라 차시 번호만 적으면 그 차시의 기본 짝이 된다. 모르는 값이면 null.
 */
export function findPairView<T extends { readonly id: string }>(param: string | null | undefined, views: readonly T[]): T | null {
  const wanted = normalizePairParam(param);
  if (wanted === '') {
    return null;
  }
  return views.find((view) => view.id === wanted) ?? views.find((view) => view.id.startsWith(`${wanted}-`)) ?? null;
}

/** 차시 링크에 적는 주소 뒷부분(`?pair=4-1-4`) — base는 붙이지 않는다(차시 md는 사이트 뿌리부터 적고 차시 페이지가 base를 붙인다) */
export function pairQuery(id: string): string {
  return `?pair=${encodeURIComponent(id)}`;
}

/** examples/ 뒤 경로가 이 화면의 컴퓨터 쪽 목록에 드는가 */
export function isUnit4PcFile(file: string): boolean {
  return (file.startsWith(UNIT4_PC_DIR) && file.endsWith('.py')) || UNIT4_EXTRA_PC_FILES.includes(file);
}

/** examples/ 뒤 경로가 이 화면의 보드 쪽 목록에 드는가 */
export function isUnit4BoardFile(file: string): boolean {
  return (file.startsWith(UNIT4_BOARD_DIR) && file.endsWith('.py')) || UNIT4_EXTRA_BOARD_FILES.includes(file);
}

/** 컴퓨터 쪽 예제 id(LabShell initialExampleId·loadExample) */
export function pcExampleId(file: string): string {
  return exampleIdFromFile(file);
}

/** 보드 쪽 예제 id */
export function boardExampleId(file: string): string {
  return esp32ExampleIdFromFile(file);
}

/** 컴퓨터 쪽 기본 예제 id */
export function defaultPcExampleId(): string {
  return pcExampleId(DEFAULT_PC_FILE);
}

/** 보드 쪽 기본 예제 id */
export function defaultBoardExampleId(): string {
  return boardExampleId(DEFAULT_BOARD_FILE);
}
