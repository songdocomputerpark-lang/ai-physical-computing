/**
 * 가상 데스크톱의 상태와 규칙(순수 논리, DOM 없음) — PLAN §8.2 P2-11, CODE_MAPPING §3.4, SPEC §6.1 "가상 모니터(커서, 버튼, 그림판…)".
 *
 * 화면(index.ts)이 파이썬 pyautogui 흉내(pyautogui.py)가 보낸 이벤트(커서 이동·클릭·끌기·키)와 학생의 진짜 마우스·키보드 입력을
 * 모두 이 모델의 메서드로 넣고, render.ts가 상태를 캔버스에 그린다. 좌표는 모두 가상 모니터의 논리 픽셀(기본 1920×1080, PD-22)이다.
 *
 * 들어 있는 것(자료 코드가 요구하는 최소, CODE_MAPPING §3.4 마지막 목록)
 * - 바탕 화면 아이콘(그림판·메모장): 한 번 누르면 고르고, 두 번 누르면(더블 클릭) 창이 열린다.
 * - 창: 제목 줄을 끌어 옮기고 × 로 닫는다. 맨 위 창이 초점 창이다. 처음에는 그림판이 열려 있다(끌기 예제 f019·f022가 바로 선을 그리게).
 * - 메모장: 초점이 있을 때 친 글자가 들어간다. Enter 줄바꿈, Backspace 지우기, Ctrl+S 저장 대화상자(가상 파일 목록에 저장).
 *   글자를 치는데 초점 창이 없으면 메모장을 자동으로 연다(f020 typewrite — PC에서는 사람이 먼저 메모장을 눌러 두는 5초).
 * - 그림판: 왼쪽 버튼을 누른 채 끌면 선이 그려진다(dragTo·dragRel). 몸통 위 색 팔레트를 누르면 색이 바뀐다. Ctrl+Z로 마지막 선 지우기.
 *   moveTo는 버튼을 누르지 않으므로 선이 생기지 않는다(진짜 그림판과 같음) — 그 대신 화면이 "커서 궤적"을 따로 보여 준다(index.ts).
 * - 오른쪽 클릭 메뉴: 바탕 화면(새 메모장·새 그림판·웹 브라우저·미니게임·화면 정리·배경 바꾸기)·창(맨 앞으로·닫기)·아이콘(열기).
 * - 대화상자: 저장(Ctrl+S), 실행(Win+R: notepad·mspaint·browser·game 이름으로 열기).
 * - 바탕 화면 끌기 = 선택 상자(진짜 데스크톱처럼 아무 일도 하지 않음 — "그림판이 열려 있지 않으면 선이 안 그려져요"를 보여 준다).
 * - 가상 브라우저(P2-12): webbrowser.open(url)이 여는 창. 주소창·연습 검색창·검색 결과(이 사이트 안의 쪽)만 있다(browser.ts).
 * - 미니게임(P2-12): 스페이스 키 하나로 노는 자체 제작 게임 3종(games.ts). f121처럼 press('space')를 연타하는 코드가 여기로 들어온다.
 *
 * 원작 게임·실제 운영체제 화면·실제 포털 화면을 흉내 내지 않는다(SPEC §6.1·§8): 아이콘·창은 도형과 글자만 쓴 자체 그림이다.
 * 이 파일은 Node 단위 테스트(tests/unit/pyautogui/model.test.ts·browser.test.ts)로 검사한다.
 */
import {
  BROWSER_HINT,
  PRACTICE_TITLE,
  PRACTICE_URL,
  classifyUrl,
  entryOfPath,
  searchSite,
  type SearchResult,
  type SiteEntry,
  type UrlInfo,
} from './browser.ts';
import {
  DEFAULT_GAME,
  GAMES,
  createGame,
  gameInfo,
  gameScoreText,
  pressGame as pressGameState,
  restartGame as restartGameState,
  stepGame as stepGameState,
  switchGame as switchGameState,
  type GameKind,
  type GameState,
} from './games.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MouseButton = 'left' | 'middle' | 'right';
export type WindowKind = 'notepad' | 'paint' | 'browser' | 'game';
export type KeyEventType = 'down' | 'up';

/** 창 종류의 한국어 이름(안내 글·창 제목·작업 표시줄) */
export const WINDOW_LABELS: Readonly<Record<WindowKind, string>> = Object.freeze({
  notepad: '메모장',
  paint: '그림판',
  browser: '웹 브라우저',
  game: '미니게임',
});

/** 글자를 넣을 수 있는 창(여기에 초점이 있으면 스페이스는 공백 글자다) */
const TEXT_WINDOWS: readonly WindowKind[] = Object.freeze(['notepad', 'browser']);

/** 모니터 논리 해상도 기본값(PD-22: 1920×1080, 4단원 BLE 예제는 3840×2160) */
export const DEFAULT_SCREEN_WIDTH = 1920;
export const DEFAULT_SCREEN_HEIGHT = 1080;

/** 화면의 해상도 고르기 상자에 보이는 후보(값은 논리 픽셀) */
export const SCREEN_PRESETS: readonly { readonly width: number; readonly height: number; readonly label: string }[] = Object.freeze([
  { width: 1920, height: 1080, label: '1920×1080 (기본 — 교안 실행 화면과 같음)' },
  { width: 1280, height: 720, label: '1280×720 (작은 모니터)' },
  { width: 3840, height: 2160, label: '3840×2160 (4단원 얼굴 마우스 예제, PD-22)' },
]);

/** 창 제목 줄 높이(1920 기준 논리 픽셀). 다른 해상도는 scaleOf()로 비례한다. */
export const TITLE_BAR_HEIGHT = 44;
/** 아래 작업 표시줄 높이 */
export const TASKBAR_HEIGHT = 56;
/** 그림판 몸통 위 팔레트 줄 높이 */
export const PALETTE_HEIGHT = 56;
/** 가상 브라우저 창의 주소 줄 높이 */
export const BROWSER_BAR_HEIGHT = 72;
/** 미니게임 창 위쪽 게임 고르기 줄 높이 */
export const GAME_TAB_HEIGHT = 64;
/** 커서 궤적으로 기억하는 점 수 상한 */
export const MAX_TRAIL_POINTS = 4000;
/** 메모장 글자 수 상한(브라우저 메모리 보호 — typewrite 반복문이 끝나지 않을 때) */
export const MAX_NOTEPAD_CHARS = 20_000;
/** 그림판 선 수 상한 */
export const MAX_STROKES = 2000;

/** 그림판 팔레트(왼쪽부터). 마지막은 지우개(흰색). */
export const PAINT_COLORS: readonly { readonly id: string; readonly label: string; readonly color: string }[] = Object.freeze([
  { id: 'black', label: '검정', color: '#17191c' },
  { id: 'red', label: '빨강', color: '#d24b4b' },
  { id: 'blue', label: '파랑', color: '#1f5bd6' },
  { id: 'green', label: '초록', color: '#3b9360' },
  { id: 'yellow', label: '노랑', color: '#e0b400' },
  { id: 'eraser', label: '지우개(흰색)', color: '#ffffff' },
]);
export const DEFAULT_STROKE_WIDTH = 6;

export interface DesktopIcon {
  readonly id: string;
  readonly kind: WindowKind;
  readonly label: string;
  /** 누르는 영역(아이콘 그림 + 이름표) */
  readonly cell: Rect;
}

export interface DesktopWindow {
  readonly id: string;
  readonly kind: WindowKind;
  title: string;
  rect: Rect;
}

export interface PaintStroke {
  readonly color: string;
  readonly width: number;
  readonly points: Point[];
}

export interface VirtualFile {
  readonly name: string;
  readonly kind: 'text' | 'image';
  readonly text: string | null;
  readonly savedAt: number;
  /** 그림 파일이면 실제 바이트(PNG). 파이썬 screenshot().save()가 보낸 것만 있다. [내려받기]가 이 값을 쓴다. */
  readonly bytes?: Uint8Array;
  readonly width?: number;
  readonly height?: number;
  /** dialog = 가상 데스크톱의 Ctrl+S, python = 학생 코드가 저장한 것 */
  readonly source: 'dialog' | 'python';
}

/** 가상 파일 목록에 두는 최대 개수(오래된 것부터 버린다 — f090처럼 반복 저장하는 코드가 메모리를 채우지 않게) */
export const MAX_FILES = 12;

/** 가상 브라우저가 지금 보여 주는 것 */
export type BrowserView = 'practice' | 'results' | 'page';
/** 가상 브라우저에서 글자가 들어가는 칸 */
export type BrowserField = 'address' | 'search';

export interface BrowserState {
  /** 주소창 글자 */
  url: string;
  /** 지금 열린 주소를 살펴본 결과(사이트 안·밖 안내) */
  info: UrlInfo;
  view: BrowserView;
  /** 연습 검색창 글자 */
  query: string;
  results: SearchResult | null;
  /** 결과에서 고른 쪽(view === 'page') */
  page: SiteEntry | null;
  field: BrowserField;
}

export interface MenuItem {
  readonly id: string;
  readonly label: string;
}

export interface ContextMenu {
  readonly x: number;
  readonly y: number;
  readonly target: { readonly kind: 'desktop' } | { readonly kind: 'window'; readonly id: string } | { readonly kind: 'icon'; readonly id: string };
  readonly items: readonly MenuItem[];
}

export type Dialog =
  /**
   * 저장 창. selected면 파일 이름 칸의 글이 모두 골라져 있다 — 진짜 Windows 저장 창처럼 **골라진 채 열려**(Ctrl+S) 바로 치면 새 이름으로 바뀌고,
   * Backspace·Delete는 통째로 지우며, 방향키·Home·End는 고름만 푼다(2026-09-26 PROGRESS 미해결 178 — 전에는 기본 이름 뒤에 글자가 붙었다).
   * Ctrl+A는 다시 모두 고른다. 커서는 늘 글 끝에 있다(칸 안 커서 자리는 흉내 내지 않는다).
   */
  | { readonly kind: 'save'; readonly windowId: string; fileName: string; selected: boolean }
  | { readonly kind: 'run'; text: string }
  | { readonly kind: 'message'; readonly text: string };

export type Hit =
  | { readonly kind: 'desktop' }
  | { readonly kind: 'icon'; readonly id: string }
  | { readonly kind: 'window-title'; readonly id: string }
  | { readonly kind: 'window-close'; readonly id: string }
  | { readonly kind: 'window-body'; readonly id: string }
  | { readonly kind: 'palette'; readonly id: string; readonly colorId: string }
  | { readonly kind: 'browser-field'; readonly id: string; readonly field: BrowserField }
  | { readonly kind: 'browser-go'; readonly id: string; readonly field: BrowserField }
  | { readonly kind: 'browser-result'; readonly id: string; readonly index: number }
  | { readonly kind: 'browser-home'; readonly id: string }
  | { readonly kind: 'game-tab'; readonly id: string; readonly game: GameKind }
  | { readonly kind: 'game-restart'; readonly id: string }
  | { readonly kind: 'menu-item'; readonly id: string }
  | { readonly kind: 'menu-outside' }
  | { readonly kind: 'dialog-button'; readonly id: 'ok' | 'cancel' }
  | { readonly kind: 'dialog' }
  | { readonly kind: 'taskbar'; readonly windowId: string | null };

type DragState =
  | { readonly kind: 'window'; readonly id: string; readonly offsetX: number; readonly offsetY: number }
  | { readonly kind: 'stroke'; readonly id: string }
  | { readonly kind: 'select'; readonly startX: number; readonly startY: number }
  | { readonly kind: 'none' };

export interface DesktopSnapshot {
  readonly width: number;
  readonly height: number;
  readonly cursor: Point;
  readonly pressed: MouseButton | null;
  readonly windows: readonly DesktopWindow[];
  readonly focusId: string | null;
  readonly selectedIcon: string | null;
  readonly menu: ContextMenu | null;
  readonly dialog: Dialog | null;
  readonly notepadText: string;
  readonly strokeCount: number;
  readonly files: readonly VirtualFile[];
  readonly lastAction: string;
  readonly browser: BrowserState;
  readonly game: GameState;
}

const MODIFIER_KEYS = new Set(['ctrl', 'shift', 'alt', 'win']);

/** 키 이름을 화면이 쓰는 기본 이름으로(pyautogui 별칭 → 하나) */
export function canonicalKey(key: string): string {
  const lower = key.length > 1 ? key.toLowerCase() : key;
  switch (lower) {
    case '\n':
    case '\r':
    case 'return':
      return 'enter';
    case '\t':
      return 'tab';
    case ' ':
      return 'space';
    case 'esc':
      return 'escape';
    case 'del':
      return 'delete';
    case 'ctrlleft':
    case 'ctrlright':
    case 'control':
      return 'ctrl';
    case 'shiftleft':
    case 'shiftright':
      return 'shift';
    case 'altleft':
    case 'altright':
    case 'option':
      return 'alt';
    case 'winleft':
    case 'winright':
    case 'command':
    case 'super':
      return 'win';
    default:
      return lower;
  }
}

/** 키가 글자를 넣는 키면 그 글자, 아니면 null(enter는 줄바꿈, tab은 탭, space는 공백) */
export function textForKey(key: string): string | null {
  if (key.length === 1) {
    return key;
  }
  switch (key) {
    case 'enter':
      return '\n';
    case 'tab':
      return '\t';
    case 'space':
      return ' ';
    default:
      return null;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 브라우저 키 이벤트에서 읽은 것(가상 데스크톱에 넣을 키). modifiers가 있으면 조합키다. */
export interface BrowserKey {
  readonly key: string;
  readonly text: string | null;
  readonly modifiers: readonly string[];
}

/** 가상 모니터가 가로채지 않고 브라우저에 넘기는 키(이동·초점·개발자 도구) */
const PASS_THROUGH_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'ContextMenu']);

/**
 * 학생이 직접 눌러 가상 데스크톱에 넣는 조합키만 받는다(나머지 Ctrl·Alt 조합은 브라우저 것 — 새로고침 Ctrl+R을 가로채면 안 된다).
 * 파이썬 pyautogui.hotkey()는 이 목록과 상관없이 무엇이든 보낼 수 있다(모델의 hotkey()가 받는다).
 */
export const BROWSER_HOTKEYS: readonly string[] = Object.freeze(['ctrl+s', 'ctrl+z', 'ctrl+n', 'ctrl+a']);

/**
 * 학생이 가상 모니터에 직접 친 키를 모델이 쓰는 이름으로 바꾼다(브라우저 KeyboardEvent 모양을 받는 순수 함수).
 * 돌려주지 않는(null) 키는 브라우저가 그대로 쓴다 — Tab(초점 이동)·화살표·F1~F12는 가로채지 않는다(접근성).
 */
export function keyFromBrowser(event: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): BrowserKey | null {
  const raw = event.key;
  if (typeof raw !== 'string' || raw === '' || raw === 'Dead' || raw === 'Unidentified' || raw === 'Process') {
    return null;
  }
  if (PASS_THROUGH_KEYS.has(raw) || /^F\d{1,2}$/u.test(raw)) {
    return null;
  }
  const modifiers: string[] = [];
  if (event.ctrlKey) {
    modifiers.push('ctrl');
  }
  if (event.altKey) {
    modifiers.push('alt');
  }
  if (event.metaKey) {
    modifiers.push('win');
  }
  if (MODIFIER_KEYS.has(canonicalKey(raw))) {
    // 조합키 자체(Ctrl·Shift·Alt·Meta)는 눌린 것만 알리고 글자는 넣지 않는다.
    return { key: canonicalKey(raw), text: null, modifiers: [] };
  }
  const key = canonicalKey(raw);
  if (raw.length !== 1 && !['enter', 'escape', 'backspace', 'delete', 'space'].includes(key)) {
    return null;
  }
  if (modifiers.length > 0) {
    // Ctrl·Alt 조합은 가상 데스크톱이 쓰는 몇 가지만 가져오고 나머지는 브라우저에 맡긴다.
    return BROWSER_HOTKEYS.includes([...modifiers, key].join('+')) ? { key, text: null, modifiers } : null;
  }
  // Shift는 브라우저가 이미 대문자·기호로 바꿔 주므로 조합키 목록에 넣지 않는다.
  return { key, text: textForKey(key), modifiers };
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** 해상도 비율(1920 기준). 창·아이콘·글자 크기가 이 비율로 커진다. */
export function scaleOf(width: number): number {
  return width / DEFAULT_SCREEN_WIDTH;
}

let nextWindowSerial = 1;

/** 가상 브라우저의 처음 상태(연습 검색 페이지) */
function newBrowserState(): BrowserState {
  return {
    url: PRACTICE_URL,
    info: { kind: 'empty', url: PRACTICE_URL, path: null, notice: BROWSER_HINT },
    view: 'practice',
    query: '',
    results: null,
    page: null,
    field: 'search',
  };
}

/**
 * 가상 데스크톱 모델. 메서드는 상태를 바꾸고, 바뀌었으면 true를 돌려준다(화면이 다시 그릴지 정한다).
 */
export class DesktopModel {
  width: number;
  height: number;
  cursor: Point;
  pressed: MouseButton | null = null;
  icons: DesktopIcon[] = [];
  /** 창 목록. 뒤에 있는 창이 위에 그려지고, 마지막 창이 초점 창이다. */
  windows: DesktopWindow[] = [];
  selectedIcon: string | null = null;
  selection: Rect | null = null;
  menu: ContextMenu | null = null;
  dialog: Dialog | null = null;
  notepadText = '';
  notepadSavedText: string | null = null;
  notepadFileName = '제목 없음.txt';
  strokes: PaintStroke[] = [];
  currentStroke: PaintStroke | null = null;
  paintColorId = 'black';
  files: VirtualFile[] = [];
  modifiers = new Set<string>();
  trail: Point[] = [];
  wallpaper = 0;
  lastAction = '';
  /** 가상 브라우저(P2-12). 창을 닫아도 남아 있다가 다시 열면 그 자리에서 이어진다. */
  browser: BrowserState = newBrowserState();
  /** 미니게임(P2-12). 창을 닫아도 가장 높은 점수는 남는다. */
  game: GameState = createGame(DEFAULT_GAME, 0);
  /** 학생 코드가 첫 글자를 칠 때 메모장을 자동으로 열었는지(안내 글에 쓴다) */
  autoOpenedNotepad = false;
  readonly #now: () => number;
  #drag: DragState = { kind: 'none' };

  constructor(width: number = DEFAULT_SCREEN_WIDTH, height: number = DEFAULT_SCREEN_HEIGHT, options: { now?: () => number } = {}) {
    this.#now = options.now ?? (() => Date.now());
    this.width = width;
    this.height = height;
    this.cursor = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    this.reset();
  }

  /** 처음 상태로: 그림판만 열려 있고 커서는 가운데, 메모장·선·궤적·파일은 비운다. */
  reset(): void {
    const s = scaleOf(this.width);
    this.icons = [
      { id: 'paint', kind: 'paint', label: '그림판', cell: { x: 40 * s, y: 40 * s, width: 120 * s, height: 130 * s } },
      { id: 'notepad', kind: 'notepad', label: '메모장', cell: { x: 40 * s, y: 190 * s, width: 120 * s, height: 130 * s } },
      { id: 'browser', kind: 'browser', label: '웹 브라우저', cell: { x: 40 * s, y: 340 * s, width: 120 * s, height: 130 * s } },
      { id: 'game', kind: 'game', label: '미니게임', cell: { x: 40 * s, y: 490 * s, width: 120 * s, height: 130 * s } },
    ];
    this.windows = [];
    this.selectedIcon = null;
    this.selection = null;
    this.menu = null;
    this.dialog = null;
    this.notepadText = '';
    this.notepadSavedText = null;
    this.notepadFileName = '제목 없음.txt';
    this.strokes = [];
    this.currentStroke = null;
    this.paintColorId = 'black';
    this.files = [];
    this.browser = newBrowserState();
    this.game = createGame(DEFAULT_GAME, this.#now());
    this.modifiers.clear();
    this.trail = [];
    this.pressed = null;
    this.#drag = { kind: 'none' };
    this.autoOpenedNotepad = false;
    this.cursor = { x: Math.floor(this.width / 2), y: Math.floor(this.height / 2) };
    this.openWindow('paint');
    this.lastAction = '처음 상태예요. 그림판이 열려 있고 커서는 가운데에 있어요.';
  }

  /** 해상도를 바꾼다(창·아이콘은 처음 배치로 돌아간다). */
  resize(width: number, height: number): void {
    this.width = Math.max(320, Math.round(width));
    this.height = Math.max(180, Math.round(height));
    this.reset();
  }

  snapshot(): DesktopSnapshot {
    return {
      width: this.width,
      height: this.height,
      cursor: this.cursor,
      pressed: this.pressed,
      windows: this.windows,
      focusId: this.focusedWindow?.id ?? null,
      selectedIcon: this.selectedIcon,
      menu: this.menu,
      dialog: this.dialog,
      notepadText: this.notepadText,
      strokeCount: this.strokes.length,
      files: this.files,
      lastAction: this.lastAction,
      browser: this.browser,
      game: this.game,
    };
  }

  get focusedWindow(): DesktopWindow | null {
    return this.windows[this.windows.length - 1] ?? null;
  }

  /** 지금 무엇을 끌고 있는지(화면이 "눌렀다 뗐을 뿐"인지 가리기 위해 본다). */
  get dragKind(): DragState['kind'] {
    return this.#drag.kind;
  }

  windowById(id: string): DesktopWindow | null {
    return this.windows.find((window) => window.id === id) ?? null;
  }

  windowOfKind(kind: WindowKind): DesktopWindow | null {
    return this.windows.find((window) => window.kind === kind) ?? null;
  }

  /** 창의 몸통(제목 줄 아래) 영역 */
  bodyRect(window: DesktopWindow): Rect {
    const title = TITLE_BAR_HEIGHT * scaleOf(this.width);
    return { x: window.rect.x, y: window.rect.y + title, width: window.rect.width, height: window.rect.height - title };
  }

  /** 그림판에서 실제로 그려지는 영역(팔레트 줄 아래) */
  canvasRect(window: DesktopWindow): Rect {
    const body = this.bodyRect(window);
    const palette = PALETTE_HEIGHT * scaleOf(this.width);
    return { x: body.x, y: body.y + palette, width: body.width, height: body.height - palette };
  }

  /** 가상 브라우저 창의 주소 줄 안 칸들(주소창·[이동]) */
  browserBarRects(window: DesktopWindow): { address: Rect; go: Rect } {
    const body = this.bodyRect(window);
    const s = scaleOf(this.width);
    const height = 48 * s;
    const y = body.y + (BROWSER_BAR_HEIGHT * s - height) / 2;
    const goWidth = 120 * s;
    const address: Rect = { x: body.x + 20 * s, y, width: body.width - 60 * s - goWidth, height };
    return { address, go: { x: address.x + address.width + 20 * s, y, width: goWidth, height } };
  }

  /** 가상 브라우저의 쪽 영역(주소 줄 아래) */
  browserPageRect(window: DesktopWindow): Rect {
    const body = this.bodyRect(window);
    const bar = BROWSER_BAR_HEIGHT * scaleOf(this.width);
    return { x: body.x, y: body.y + bar, width: body.width, height: body.height - bar };
  }

  /** 연습 검색창과 [검색] 단추 */
  browserSearchRects(window: DesktopWindow): { field: Rect; go: Rect } {
    const page = this.browserPageRect(window);
    const s = scaleOf(this.width);
    const height = 56 * s;
    const goWidth = 130 * s;
    const top = page.y + (this.browser.view === 'practice' ? 150 * s : 24 * s);
    const field: Rect = { x: page.x + 60 * s, y: top, width: page.width - 180 * s - goWidth, height };
    return { field, go: { x: field.x + field.width + 16 * s, y: top, width: goWidth, height } };
  }

  /** 검색 결과 줄 위치(위에서부터) */
  browserResultRects(window: DesktopWindow): Rect[] {
    const page = this.browserPageRect(window);
    const s = scaleOf(this.width);
    const top = this.browserSearchRects(window).field;
    const rowHeight = 92 * s;
    const count = this.browser.results?.entries.length ?? 0;
    return Array.from({ length: count }, (_unused, index) => ({
      x: page.x + 60 * s,
      y: top.y + top.height + 56 * s + index * rowHeight,
      width: page.width - 120 * s,
      height: rowHeight - 12 * s,
    }));
  }

  /** 미니게임 창의 게임 고르기 단추와 [다시 하기] */
  gameTabRects(window: DesktopWindow): { game: GameKind | null; rect: Rect }[] {
    const body = this.bodyRect(window);
    const s = scaleOf(this.width);
    const height = 44 * s;
    const y = body.y + (GAME_TAB_HEIGHT * s - height) / 2;
    const width = 200 * s;
    const tabs: { game: GameKind | null; rect: Rect }[] = GAMES.map((info, index) => ({
      game: info.id,
      rect: { x: body.x + 16 * s + index * (width + 10 * s), y, width, height },
    }));
    tabs.push({ game: null, rect: { x: body.x + body.width - 150 * s - 16 * s, y, width: 150 * s, height } });
    return tabs;
  }

  /** 게임이 그려지는 영역(고르기 줄 아래) */
  gameAreaRect(window: DesktopWindow): Rect {
    const body = this.bodyRect(window);
    const tabs = GAME_TAB_HEIGHT * scaleOf(this.width);
    return { x: body.x, y: body.y + tabs, width: body.width, height: body.height - tabs };
  }

  /** 그림판 팔레트 칸 위치(왼쪽부터) */
  paletteCells(window: DesktopWindow): { id: string; rect: Rect }[] {
    const body = this.bodyRect(window);
    const s = scaleOf(this.width);
    const size = 40 * s;
    const gap = 12 * s;
    return PAINT_COLORS.map((entry, index) => ({
      id: entry.id,
      rect: { x: body.x + 16 * s + index * (size + gap), y: body.y + 8 * s, width: size, height: size },
    }));
  }

  get paintColor(): string {
    return PAINT_COLORS.find((entry) => entry.id === this.paintColorId)?.color ?? '#17191c';
  }

  /** 좌표를 화면 안으로 자른다(운영체제가 커서를 화면 밖으로 내보내지 않는 것과 같음). */
  clampPoint(x: number, y: number): Point {
    return {
      x: clamp(Math.round(Number.isFinite(x) ? x : 0), 0, this.width - 1),
      y: clamp(Math.round(Number.isFinite(y) ? y : 0), 0, this.height - 1),
    };
  }

  /** 커서를 옮긴다(버튼을 누른 채면 끌기). 궤적은 부르는 쪽(index.ts)이 스크립트 이동일 때만 더한다. */
  moveCursor(x: number, y: number): Point {
    const point = this.clampPoint(x, y);
    this.cursor = point;
    if (this.pressed !== null) {
      this.#dragTo(point);
    }
    return point;
  }

  addTrail(point: Point): void {
    this.trail.push(point);
    if (this.trail.length > MAX_TRAIL_POINTS) {
      this.trail.splice(0, this.trail.length - MAX_TRAIL_POINTS);
    }
  }

  clearTrail(): void {
    this.trail = [];
  }

  /** 어떤 것 위인지(맨 위 것부터: 대화상자 → 메뉴 → 창(위→아래) → 아이콘 → 작업 표시줄 → 바탕) */
  hitTest(x: number, y: number): Hit {
    if (this.dialog) {
      // 대화상자는 모달이다: 단추 밖은 어디를 눌러도 대화상자로 본다(바깥 창·아이콘에 가지 않는다).
      for (const button of this.dialogButtons()) {
        if (rectContains(button.rect, x, y)) {
          return { kind: 'dialog-button', id: button.id };
        }
      }
      return { kind: 'dialog' };
    }
    if (this.menu) {
      const items = this.menuItemRects();
      for (const item of items) {
        if (rectContains(item.rect, x, y)) {
          return { kind: 'menu-item', id: item.id };
        }
      }
      return { kind: 'menu-outside' };
    }
    for (let index = this.windows.length - 1; index >= 0; index -= 1) {
      const window = this.windows[index]!;
      if (!rectContains(window.rect, x, y)) {
        continue;
      }
      const s = scaleOf(this.width);
      const title = TITLE_BAR_HEIGHT * s;
      if (y < window.rect.y + title) {
        const closeX = window.rect.x + window.rect.width - title;
        return x >= closeX ? { kind: 'window-close', id: window.id } : { kind: 'window-title', id: window.id };
      }
      if (window.kind === 'paint') {
        for (const cell of this.paletteCells(window)) {
          if (rectContains(cell.rect, x, y)) {
            return { kind: 'palette', id: window.id, colorId: cell.id };
          }
        }
      }
      if (window.kind === 'browser') {
        const bar = this.browserBarRects(window);
        if (rectContains(bar.address, x, y)) {
          return { kind: 'browser-field', id: window.id, field: 'address' };
        }
        if (rectContains(bar.go, x, y)) {
          return { kind: 'browser-go', id: window.id, field: 'address' };
        }
        const search = this.browserSearchRects(window);
        if (rectContains(search.field, x, y)) {
          return { kind: 'browser-field', id: window.id, field: 'search' };
        }
        if (rectContains(search.go, x, y)) {
          return { kind: 'browser-go', id: window.id, field: 'search' };
        }
        if (this.browser.view === 'results') {
          const rows = this.browserResultRects(window);
          for (let index = 0; index < rows.length; index += 1) {
            if (rectContains(rows[index]!, x, y)) {
              return { kind: 'browser-result', id: window.id, index };
            }
          }
        }
        if (this.browser.view === 'page') {
          return { kind: 'browser-home', id: window.id };
        }
      }
      if (window.kind === 'game') {
        for (const tab of this.gameTabRects(window)) {
          if (rectContains(tab.rect, x, y)) {
            return tab.game ? { kind: 'game-tab', id: window.id, game: tab.game } : { kind: 'game-restart', id: window.id };
          }
        }
      }
      return { kind: 'window-body', id: window.id };
    }
    for (const icon of this.icons) {
      if (rectContains(icon.cell, x, y)) {
        return { kind: 'icon', id: icon.id };
      }
    }
    if (y >= this.height - TASKBAR_HEIGHT * scaleOf(this.width)) {
      for (const entry of this.taskbarEntries()) {
        if (rectContains(entry.rect, x, y)) {
          return { kind: 'taskbar', windowId: entry.id };
        }
      }
      return { kind: 'taskbar', windowId: null };
    }
    return { kind: 'desktop' };
  }

  /** 작업 표시줄의 창 단추 위치 */
  taskbarEntries(): { id: string; title: string; rect: Rect }[] {
    const s = scaleOf(this.width);
    const bar = TASKBAR_HEIGHT * s;
    const width = 260 * s;
    return this.windows.map((window, index) => ({
      id: window.id,
      title: window.title,
      rect: { x: 220 * s + index * (width + 12 * s), y: this.height - bar + 8 * s, width, height: bar - 16 * s },
    }));
  }

  // ── 창 ──

  openWindow(kind: WindowKind): DesktopWindow {
    const existing = this.windowOfKind(kind);
    if (existing) {
      this.focusWindow(existing.id);
      return existing;
    }
    const s = scaleOf(this.width);
    const rects: Readonly<Record<WindowKind, Rect>> = {
      paint: { x: 360 * s, y: 200 * s, width: 1200 * s, height: 760 * s },
      notepad: { x: 700 * s, y: 120 * s, width: 800 * s, height: 560 * s },
      browser: { x: 300 * s, y: 110 * s, width: 1420 * s, height: 840 * s },
      game: { x: 520 * s, y: 170 * s, width: 980 * s, height: 700 * s },
    };
    const titles: Readonly<Record<WindowKind, string>> = {
      paint: '그림판',
      notepad: `${this.notepadFileName} — 메모장`,
      browser: `${PRACTICE_TITLE} — 웹 브라우저`,
      game: `${gameInfo(this.game.kind).label} — 미니게임`,
    };
    const window: DesktopWindow = {
      id: `${kind}-${nextWindowSerial}`,
      kind,
      title: titles[kind],
      rect: rects[kind],
    };
    nextWindowSerial += 1;
    this.windows.push(window);
    this.selectedIcon = null;
    return window;
  }

  focusWindow(id: string): boolean {
    const index = this.windows.findIndex((window) => window.id === id);
    if (index < 0) {
      return false;
    }
    if (index !== this.windows.length - 1) {
      const [window] = this.windows.splice(index, 1);
      this.windows.push(window!);
    }
    return true;
  }

  closeWindow(id: string): boolean {
    const index = this.windows.findIndex((window) => window.id === id);
    if (index < 0) {
      return false;
    }
    const [window] = this.windows.splice(index, 1);
    if (window!.kind === 'notepad') {
      // 진짜 메모장처럼 창을 닫으면 저장하지 않은 글은 사라진다(가상 파일에 저장한 것은 남는다).
      this.notepadText = '';
      this.notepadSavedText = null;
      this.notepadFileName = '제목 없음.txt';
    }
    if (this.currentStroke && this.#drag.kind === 'stroke' && this.#drag.id === id) {
      this.currentStroke = null;
      this.#drag = { kind: 'none' };
    }
    return true;
  }

  // ── 마우스 ──

  /**
   * 클릭. count는 연속 클릭 번호(1 = 한 번, 2 = 두 번째 → 더블 클릭). pyautogui.click(clicks=2)·doubleClick은 count 1, 2를 차례로 보낸다.
   * 돌려주는 값은 화면 안내 글(무슨 일이 일어났는지).
   */
  click(x: number, y: number, button: MouseButton = 'left', count = 1): string {
    const point = this.clampPoint(x, y);
    this.cursor = point;
    const hit = this.hitTest(point.x, point.y);
    let action: string;
    switch (hit.kind) {
      case 'dialog-button':
        action = hit.id === 'ok' ? this.#confirmDialog() : this.#cancelDialog();
        break;
      case 'dialog':
        action = '대화상자가 열려 있어요. [확인]이나 [취소]를 눌러요.';
        break;
      case 'menu-item':
        action = this.#runMenuItem(hit.id);
        break;
      case 'menu-outside':
        this.menu = null;
        action = '메뉴를 닫았어요.';
        break;
      case 'icon':
        if (button === 'right') {
          action = this.#openMenu(point, { kind: 'icon', id: hit.id });
        } else if (count >= 2) {
          const icon = this.icons.find((item) => item.id === hit.id)!;
          this.openWindow(icon.kind);
          action = `더블 클릭 → ${icon.label}을(를) 열었어요.`;
        } else {
          this.selectedIcon = hit.id;
          action = `${this.icons.find((item) => item.id === hit.id)?.label ?? '아이콘'} 아이콘을 골랐어요(두 번 누르면 열려요).`;
        }
        break;
      case 'window-close':
        if (button === 'left') {
          const label = this.#windowLabel(hit.id);
          this.closeWindow(hit.id);
          action = `${label} 창을 닫았어요.`;
        } else {
          action = this.#openMenu(point, { kind: 'window', id: hit.id });
        }
        break;
      case 'window-title':
        this.focusWindow(hit.id);
        action = button === 'right' ? this.#openMenu(point, { kind: 'window', id: hit.id }) : `${this.#windowLabel(hit.id)} 창을 앞으로 가져왔어요.`;
        break;
      case 'palette': {
        this.focusWindow(hit.id);
        if (button === 'left') {
          this.paintColorId = hit.colorId;
          action = `그림판 색을 ${PAINT_COLORS.find((entry) => entry.id === hit.colorId)?.label ?? hit.colorId}으로 바꿨어요.`;
        } else {
          action = this.#openMenu(point, { kind: 'window', id: hit.id });
        }
        break;
      }
      case 'browser-field': {
        this.focusWindow(hit.id);
        this.browser.field = hit.field;
        action = hit.field === 'address' ? '주소창에 초점을 두었어요. 주소를 치고 Enter를 눌러요.' : '연습 검색창에 초점을 두었어요. 낱말을 치고 Enter를 눌러요.';
        break;
      }
      case 'browser-go':
        this.focusWindow(hit.id);
        action = hit.field === 'address' ? this.browserGo() : this.browserSearch();
        break;
      case 'browser-result':
        this.focusWindow(hit.id);
        action = this.browserOpenResult(hit.index);
        break;
      case 'browser-home':
        this.focusWindow(hit.id);
        action = this.browserBack();
        break;
      case 'game-tab':
        this.focusWindow(hit.id);
        action = this.selectGame(hit.game);
        break;
      case 'game-restart':
        this.focusWindow(hit.id);
        action = this.restartGame();
        break;
      case 'window-body': {
        this.focusWindow(hit.id);
        const window = this.windowById(hit.id)!;
        if (button === 'right') {
          action = this.#openMenu(point, { kind: 'window', id: hit.id });
        } else if (window.kind === 'paint' && count === 1) {
          // 진짜 그림판처럼 한 번 누르면 점 하나가 찍힌다.
          this.#addStroke([point, point]);
          action = '그림판에 점을 찍었어요(선을 그리려면 버튼을 누른 채 끌어요 — dragTo·dragRel).';
        } else if (window.kind === 'notepad') {
          action = '메모장에 초점을 두었어요. 이제 친 글자가 여기 들어가요.';
        } else if (window.kind === 'browser') {
          action = '가상 브라우저에 초점을 두었어요.';
        } else if (window.kind === 'game') {
          action = '미니게임에 초점을 두었어요. 스페이스 키로 놀아요.';
        } else {
          action = '그림판에 초점을 두었어요.';
        }
        break;
      }
      case 'taskbar':
        if (hit.windowId) {
          this.focusWindow(hit.windowId);
          action = `${this.#windowLabel(hit.windowId)} 창을 앞으로 가져왔어요.`;
        } else {
          action = '작업 표시줄을 눌렀어요.';
        }
        break;
      default:
        this.selectedIcon = null;
        action = button === 'right' ? this.#openMenu(point, { kind: 'desktop' }) : count >= 2 ? '바탕 화면을 두 번 눌렀어요(아이콘이 없는 곳이에요).' : '바탕 화면을 눌렀어요.';
    }
    this.lastAction = action;
    return action;
  }

  mouseDown(x: number, y: number, button: MouseButton = 'left'): string {
    const point = this.clampPoint(x, y);
    this.cursor = point;
    this.pressed = button;
    const hit = this.hitTest(point.x, point.y);
    let action = `${button === 'left' ? '왼쪽' : button === 'right' ? '오른쪽' : '가운데'} 버튼을 눌렀어요.`;
    this.#drag = { kind: 'none' };
    if (button !== 'left') {
      this.lastAction = action;
      return action;
    }
    switch (hit.kind) {
      case 'window-title': {
        const window = this.windowById(hit.id)!;
        this.focusWindow(hit.id);
        this.#drag = { kind: 'window', id: hit.id, offsetX: point.x - window.rect.x, offsetY: point.y - window.rect.y };
        action = `${this.#windowLabel(hit.id)} 창 제목 줄을 잡았어요(끌면 창이 옮겨져요).`;
        break;
      }
      case 'window-body': {
        this.focusWindow(hit.id);
        const window = this.windowById(hit.id)!;
        if (window.kind === 'paint' && rectContains(this.canvasRect(window), point.x, point.y)) {
          this.#drag = { kind: 'stroke', id: hit.id };
          this.currentStroke = { color: this.paintColor, width: DEFAULT_STROKE_WIDTH * scaleOf(this.width), points: [point] };
          action = '그림판에서 선을 시작했어요.';
        }
        break;
      }
      case 'desktop':
        this.selectedIcon = null;
        this.#drag = { kind: 'select', startX: point.x, startY: point.y };
        this.selection = { x: point.x, y: point.y, width: 0, height: 0 };
        action = '바탕 화면에서 끌기를 시작했어요(선택 상자만 생겨요 — 그림판 위에서 끌면 선이 그려져요).';
        break;
      default:
        break;
    }
    this.lastAction = action;
    return action;
  }

  mouseUp(x: number, y: number, button: MouseButton = 'left'): string {
    const point = this.clampPoint(x, y);
    this.cursor = point;
    if (this.pressed === button || this.pressed !== null) {
      this.#dragTo(point);
    }
    let action = `${button === 'left' ? '왼쪽' : button === 'right' ? '오른쪽' : '가운데'} 버튼을 놓았어요.`;
    if (this.#drag.kind === 'stroke' && this.currentStroke) {
      const stroke = this.currentStroke;
      if (stroke.points.length === 1) {
        stroke.points.push(stroke.points[0]!);
      }
      this.#pushStroke(stroke);
      action = `그림판에 선을 그렸어요(점 ${stroke.points.length}개).`;
    } else if (this.#drag.kind === 'select') {
      action = '선택 상자를 놓았어요(바탕 화면에는 아무 일도 없어요).';
    } else if (this.#drag.kind === 'window') {
      action = `${this.#windowLabel(this.#drag.id)} 창을 옮겼어요.`;
    }
    this.currentStroke = null;
    this.selection = null;
    this.#drag = { kind: 'none' };
    this.pressed = null;
    this.lastAction = action;
    return action;
  }

  scroll(x: number, y: number, clicks: number): string {
    const point = this.clampPoint(x, y);
    this.cursor = point;
    const direction = clicks > 0 ? '위로' : '아래로';
    const action = `스크롤 ${direction} ${Math.abs(clicks)}칸(가상 데스크톱에서는 표시만 해요).`;
    this.lastAction = action;
    return action;
  }

  // ── 키보드 ──

  /**
   * 키 하나를 누르거나(down) 뗀다(up). key는 canonicalKey()를 거친 이름, text는 글자 키의 글자.
   * 조합키(ctrl·shift·alt·win)를 누른 채 다른 키를 누르면 단축키로 다룬다.
   *
   * options.fromScript: 학생 코드(pyautogui)가 보낸 키인지. 스페이스 키는 미니게임의 조작 키라서,
   * 코드가 press('space')를 보냈는데 미니게임 창이 없으면 창을 열어 준다(typewrite가 메모장을 열어 주는 것과 같은 규칙, f121).
   * 학생이 손으로 누른 스페이스는 창을 열지 않고 안내만 한다(글을 쓰다가 갑자기 게임이 뜨면 안 되므로).
   */
  key(type: KeyEventType, rawKey: string, text: string | null = null, options: { fromScript?: boolean } = {}): string {
    const key = canonicalKey(rawKey);
    if (MODIFIER_KEYS.has(key)) {
      if (type === 'down') {
        this.modifiers.add(key);
      } else {
        this.modifiers.delete(key);
      }
      // 조합키 자체(Ctrl·Shift·Alt·Win)를 누르고 떼는 것은 "일어난 일"이 아니므로 lastAction을 덮어쓰지 않는다.
      // pyautogui.hotkey('ctrl', 's')는 down ctrl → down s(여기서 저장 대화상자) → up s → up ctrl 순서로 오는데,
      // 마지막 up ctrl이 안내 글을 덮으면 학생이 "저장 대화상자를 열었어요"를 못 본다.
      return `${key} 키를 ${type === 'down' ? '눌렀어요' : '뗐어요'}.`;
    }
    if (type === 'up') {
      return this.lastAction;
    }
    if (this.modifiers.size > 0) {
      return this.hotkey([...this.modifiers, key]);
    }
    return this.#typeKey(key, text ?? textForKey(key), { rawKey, fromScript: options.fromScript === true });
  }

  /** 조합키(예: ['ctrl', 's']). 마지막이 주 키다. */
  hotkey(keys: readonly string[]): string {
    const names = keys.map((key) => canonicalKey(key));
    const main = names[names.length - 1] ?? '';
    const mods = new Set(names.slice(0, -1).filter((key) => MODIFIER_KEYS.has(key)));
    const combo = [...mods, main].join('+');
    let action = `${combo} 조합키를 눌렀어요(가상 데스크톱에는 정해진 동작이 없어요).`;
    if (mods.size === 0) {
      return this.#typeKey(main, textForKey(main), { rawKey: main, fromScript: true });
    }
    if (this.dialog) {
      if (this.dialog.kind === 'save' && mods.has('ctrl') && main === 'a') {
        this.dialog.selected = this.dialog.fileName !== '';
        action = 'Ctrl+A: 저장 창의 파일 이름을 모두 골랐어요. 이어서 치면 새 이름으로 바뀌어요.';
      } else {
        action = `${combo}: 대화상자가 열려 있어서 무시했어요.`;
      }
    } else if (mods.has('ctrl') && main === 's') {
      action = this.#openSaveDialog();
    } else if (mods.has('ctrl') && main === 'z') {
      const focused = this.focusedWindow;
      if (focused?.kind === 'paint' && this.strokes.length > 0) {
        this.strokes.pop();
        action = 'Ctrl+Z: 그림판의 마지막 선을 지웠어요.';
      } else if (focused?.kind === 'notepad' && this.notepadText.length > 0) {
        this.notepadText = this.notepadText.slice(0, -1);
        action = 'Ctrl+Z: 메모장의 마지막 글자를 지웠어요.';
      } else {
        action = 'Ctrl+Z: 되돌릴 것이 없어요.';
      }
    } else if (mods.has('ctrl') && main === 'a' && this.focusedWindow?.kind === 'notepad') {
      action = 'Ctrl+A: 메모장 글을 모두 골랐어요(표시만 해요).';
    } else if (mods.has('ctrl') && main === 'n') {
      this.openWindow('notepad');
      action = 'Ctrl+N: 새 메모장을 열었어요.';
    } else if (mods.has('alt') && main === 'f4') {
      const focused = this.focusedWindow;
      if (focused) {
        this.closeWindow(focused.id);
        action = `Alt+F4: ${focused.kind === 'paint' ? '그림판' : '메모장'} 창을 닫았어요.`;
      } else {
        action = 'Alt+F4: 닫을 창이 없어요.';
      }
    } else if (mods.has('win') && main === 'r') {
      this.dialog = { kind: 'run', text: '' };
      action = 'Win+R: 실행 창을 열었어요. 프로그램 이름(notepad, mspaint, browser, game)을 치고 Enter를 눌러요.';
    } else if (mods.has('win') && main === 'd') {
      action = 'Win+D: 바탕 화면 보기(가상 데스크톱에서는 표시만 해요).';
    }
    this.lastAction = action;
    return action;
  }

  /** 메모장에 글자를 넣는다(초점 창이 메모장이 아니면 메모장을 열어 초점을 준다). */
  typeText(text: string): string {
    let notepad = this.windowOfKind('notepad');
    if (!notepad || this.focusedWindow?.kind !== 'notepad') {
      const hadNotepad = notepad !== null;
      notepad = this.openWindow('notepad');
      if (!hadNotepad) {
        this.autoOpenedNotepad = true;
      }
    }
    this.notepadText = (this.notepadText + text).slice(-MAX_NOTEPAD_CHARS);
    this.#refreshNotepadTitle(notepad);
    return text;
  }

  // ── 가상 브라우저(P2-12) ──

  /**
   * 파이썬 webbrowser.open(url)이 부른다: 가상 브라우저 창을 열고 주소를 보여 준다.
   * 진짜 인터넷에는 가지 않는다 — 주소가 우리 사이트면 "진짜로 열어 볼 수 있어요", 아니면 "가상 브라우저에서만 열려요"라고 알린다.
   */
  openBrowser(url: string): string {
    const info = classifyUrl(url);
    const window = this.openWindow('browser');
    this.browser = {
      ...newBrowserState(),
      url: info.kind === 'empty' ? PRACTICE_URL : info.url,
      info,
      view: 'practice',
      field: 'search',
    };
    window.title = `${info.kind === 'empty' ? PRACTICE_TITLE : info.url} — 웹 브라우저`;
    this.lastAction = info.kind === 'outside' ? `가상 브라우저로 ${info.url}을(를) 열었어요. ${info.notice}` : `가상 브라우저로 ${info.url}을(를) 열었어요.`;
    return this.lastAction;
  }

  /** 주소창의 글자로 "이동" */
  browserGo(): string {
    const info = classifyUrl(this.browser.url);
    const page = entryOfPath(info.path);
    this.browser = { ...this.browser, info, view: page ? 'page' : 'practice', page, field: page ? 'search' : 'address' };
    const window = this.windowOfKind('browser');
    if (window) {
      window.title = `${info.kind === 'empty' ? PRACTICE_TITLE : info.url} — 웹 브라우저`;
    }
    this.lastAction = page ? `가상 브라우저에서 "${page.title}" 쪽을 열었어요.` : `주소창의 ${info.url || '빈 주소'}: ${info.notice}`;
    return this.lastAction;
  }

  /** 연습 검색창의 낱말로 이 사이트 안을 찾는다(진짜 검색 엔진이 아니다). */
  browserSearch(): string {
    const results = searchSite(this.browser.query);
    this.browser = { ...this.browser, results, view: 'results', page: null, field: 'search' };
    this.lastAction = results.fallback
      ? `"${this.browser.query}"에 꼭 맞는 쪽은 없어서 이 사이트에서 배울 거리를 보여 줘요.`
      : `"${this.browser.query}"을(를) 찾아 이 사이트 안의 쪽 ${results.entries.length}개를 보여 줘요.`;
    return this.lastAction;
  }

  /** 검색 결과 한 줄 열기 */
  browserOpenResult(index: number): string {
    const entry = this.browser.results?.entries[index];
    if (!entry) {
      return this.lastAction;
    }
    this.browser = { ...this.browser, view: 'page', page: entry, url: entry.path, info: classifyUrl(entry.path) };
    const window = this.windowOfKind('browser');
    if (window) {
      window.title = `${entry.title} — 웹 브라우저`;
    }
    this.lastAction = `가상 브라우저에서 "${entry.title}" 쪽을 열었어요.`;
    return this.lastAction;
  }

  /** 쪽 보기 → 결과(또는 연습 검색)로 돌아가기 */
  browserBack(): string {
    this.browser = { ...this.browser, view: this.browser.results ? 'results' : 'practice', page: null };
    this.lastAction = '가상 브라우저에서 앞 화면으로 돌아갔어요.';
    return this.lastAction;
  }

  /** 초점이 있는 칸에 글자를 넣는다(typewrite가 부른다) */
  browserType(text: string): string {
    const field = this.browser.field;
    const value = `${field === 'address' ? this.browser.url : this.browser.query}${text}`.slice(0, 120);
    this.browser = field === 'address' ? { ...this.browser, url: value } : { ...this.browser, query: value };
    return field === 'address' ? `주소창에 "${value}"을(를) 쳤어요.` : `연습 검색창에 "${value}"을(를) 쳤어요.`;
  }

  browserBackspace(): string {
    const field = this.browser.field;
    const value = (field === 'address' ? this.browser.url : this.browser.query).slice(0, -1);
    this.browser = field === 'address' ? { ...this.browser, url: value } : { ...this.browser, query: value };
    return '가상 브라우저에서 마지막 글자를 지웠어요.';
  }

  // ── 미니게임(P2-12) ──

  /** 미니게임 창을 연다(게임 종류를 주면 그 게임으로 바꾼다). */
  openGame(kind?: GameKind): string {
    if (kind && kind !== this.game.kind) {
      this.game = switchGameState(this.game, kind, this.#now());
    }
    const window = this.openWindow('game');
    window.title = `${gameInfo(this.game.kind).label} — 미니게임`;
    this.lastAction = `미니게임 "${gameInfo(this.game.kind).label}"을(를) 열었어요. ${gameInfo(this.game.kind).rule}`;
    return this.lastAction;
  }

  selectGame(kind: GameKind): string {
    this.game = switchGameState(this.game, kind, this.#now());
    const window = this.windowOfKind('game');
    if (window) {
      window.title = `${gameInfo(kind).label} — 미니게임`;
    }
    this.lastAction = `미니게임을 "${gameInfo(kind).label}"으로 바꿨어요. ${gameInfo(kind).rule}`;
    return this.lastAction;
  }

  restartGame(): string {
    this.game = restartGameState(this.game, this.#now());
    this.lastAction = `미니게임 "${gameInfo(this.game.kind).label}"을(를) 처음부터 다시 해요.`;
    return this.lastAction;
  }

  /**
   * 시간이 흐른 만큼 게임을 움직인다(미니게임 창이 열려 있을 때만 화면이 부른다). 바뀌면 true.
   * 시계는 이 모델이 쓰는 것과 같아야 한다(기본값 #now) — 다른 시계를 넣으면 games.ts가 한 판을 건너뛰고 다시 맞춘다.
   */
  stepGame(options: { now?: number; reducedMotion?: boolean } = {}): boolean {
    if (!this.windowOfKind('game')) {
      return false;
    }
    return stepGameState(this.game, options.now ?? this.#now(), { reducedMotion: options.reducedMotion === true });
  }

  /** 스페이스 키를 게임에 넣는다(창이 없으면 열지 않는다 — 여는 것은 key()가 정한다). */
  pressGame(): string {
    const message = pressGameState(this.game, this.#now());
    this.lastAction = `미니게임: ${message} (${gameScoreText(this.game)})`;
    return this.lastAction;
  }

  /** 점수 줄(패널·읽어 주는 글) */
  gameScore(): string {
    return gameScoreText(this.game);
  }

  // ── 가상 파일 ──

  /** 가상 파일 목록에 넣는다(같은 이름은 바꿔 끼우고, 너무 많으면 오래된 것부터 버린다). */
  addFile(file: VirtualFile): VirtualFile {
    const kept = this.files.filter((item) => item.name !== file.name);
    this.files = [...kept, file].slice(-MAX_FILES);
    return file;
  }

  /** 대화상자·메뉴 표시 위치 */
  dialogRect(): Rect {
    const s = scaleOf(this.width);
    const width = 720 * s;
    const height = 260 * s;
    return { x: (this.width - width) / 2, y: (this.height - height) / 2, width, height };
  }

  dialogButtons(): { id: 'ok' | 'cancel'; label: string; rect: Rect }[] {
    const box = this.dialogRect();
    const s = scaleOf(this.width);
    const width = 160 * s;
    const height = 56 * s;
    const y = box.y + box.height - height - 24 * s;
    const okLabel = this.dialog?.kind === 'save' ? '저장' : this.dialog?.kind === 'run' ? '확인' : '확인';
    const buttons: { id: 'ok' | 'cancel'; label: string; rect: Rect }[] = [
      { id: 'ok', label: okLabel, rect: { x: box.x + box.width - width * 2 - 40 * s, y, width, height } },
    ];
    if (this.dialog?.kind !== 'message') {
      buttons.push({ id: 'cancel', label: '취소', rect: { x: box.x + box.width - width - 24 * s, y, width, height } });
    }
    return buttons;
  }

  menuItemRects(): { id: string; label: string; rect: Rect }[] {
    if (!this.menu) {
      return [];
    }
    const s = scaleOf(this.width);
    const width = 320 * s;
    const itemHeight = 48 * s;
    const total = this.menu.items.length * itemHeight + 16 * s;
    const x = Math.min(this.menu.x, this.width - width);
    const y = Math.min(this.menu.y, this.height - total);
    return this.menu.items.map((item, index) => ({
      id: item.id,
      label: item.label,
      rect: { x, y: y + 8 * s + index * itemHeight, width, height: itemHeight },
    }));
  }

  menuRect(): Rect | null {
    const items = this.menuItemRects();
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      return null;
    }
    const s = scaleOf(this.width);
    return { x: first.rect.x, y: first.rect.y - 8 * s, width: first.rect.width, height: last.rect.y + last.rect.height - first.rect.y + 16 * s };
  }

  // ── 안 ──

  #windowLabel(id: string): string {
    const window = this.windowById(id);
    return window ? WINDOW_LABELS[window.kind] : '창';
  }

  #refreshNotepadTitle(window: DesktopWindow): void {
    const dirty = this.notepadSavedText !== this.notepadText;
    window.title = `${dirty ? '*' : ''}${this.notepadFileName} — 메모장`;
  }

  #dragTo(point: Point): void {
    const drag = this.#drag;
    if (drag.kind === 'window') {
      const window = this.windowById(drag.id);
      if (window) {
        const s = scaleOf(this.width);
        window.rect.x = clamp(point.x - drag.offsetX, -window.rect.width + 120 * s, this.width - 120 * s);
        window.rect.y = clamp(point.y - drag.offsetY, 0, this.height - TASKBAR_HEIGHT * s - TITLE_BAR_HEIGHT * s);
      }
    } else if (drag.kind === 'stroke' && this.currentStroke) {
      const last = this.currentStroke.points[this.currentStroke.points.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) {
        this.currentStroke.points.push(point);
      }
    } else if (drag.kind === 'select') {
      this.selection = {
        x: Math.min(drag.startX, point.x),
        y: Math.min(drag.startY, point.y),
        width: Math.abs(point.x - drag.startX),
        height: Math.abs(point.y - drag.startY),
      };
    }
  }

  #addStroke(points: Point[]): void {
    this.#pushStroke({ color: this.paintColor, width: DEFAULT_STROKE_WIDTH * scaleOf(this.width), points });
  }

  #pushStroke(stroke: PaintStroke): void {
    this.strokes.push(stroke);
    if (this.strokes.length > MAX_STROKES) {
      this.strokes.splice(0, this.strokes.length - MAX_STROKES);
    }
  }

  #typeKey(key: string, text: string | null, options: { rawKey: string; fromScript: boolean }): string {
    let action: string;
    const focused = this.focusedWindow;
    // 스페이스 키(press('space'))는 미니게임의 조작 키다. 글자 칸에 초점이 있으면 공백 글자로, 아니면 게임으로 간다.
    // typewrite('a b')가 보내는 공백은 rawKey가 ' '라서 여기 걸리지 않는다(언제나 글자다).
    const explicitSpace = key === 'space' && options.rawKey !== ' ';
    if (explicitSpace && !this.dialog && !this.menu && !(focused && TEXT_WINDOWS.includes(focused.kind))) {
      return this.#spaceToGame(options.fromScript);
    }
    if (this.dialog) {
      action = this.#typeIntoDialog(key, text);
    } else if (this.menu) {
      if (key === 'escape') {
        this.menu = null;
        action = 'Esc: 메뉴를 닫았어요.';
      } else {
        action = `${key} 키: 메뉴가 열려 있어요(Esc로 닫아요).`;
      }
    } else if (focused?.kind === 'browser') {
      action = this.#typeIntoBrowser(key, text);
    } else if (focused?.kind === 'game') {
      action = `${key} 키: 미니게임은 스페이스 키로만 놀아요.`;
    } else if (key === 'backspace') {
      if (this.focusedWindow?.kind === 'notepad') {
        this.notepadText = this.notepadText.slice(0, -1);
        this.#refreshNotepadTitle(this.focusedWindow);
        action = 'Backspace: 메모장의 마지막 글자를 지웠어요.';
      } else {
        action = 'Backspace: 글자를 지울 곳이 없어요.';
      }
    } else if (key === 'escape') {
      action = 'Esc 키를 눌렀어요.';
    } else if (text !== null) {
      const hadFocus = this.focusedWindow?.kind === 'notepad';
      this.typeText(text);
      const shown = text === '\n' ? 'Enter(줄바꿈)' : text === '\t' ? 'Tab' : text === ' ' ? 'Space' : `'${text}'`;
      action = hadFocus ? `메모장에 ${shown}을(를) 넣었어요.` : `초점 창이 메모장이 아니어서 메모장을 열고 ${shown}을(를) 넣었어요.`;
    } else {
      action = `${key} 키를 눌렀어요(가상 데스크톱에는 정해진 동작이 없어요).`;
    }
    this.lastAction = action;
    return action;
  }

  /** 스페이스 키를 미니게임에 넣는다(창이 없으면 코드가 보낸 것일 때만 열어 준다 — f121). */
  #spaceToGame(fromScript: boolean): string {
    const window = this.windowOfKind('game');
    if (!window) {
      if (!fromScript) {
        this.lastAction = '스페이스 키를 눌렀어요. 바탕 화면의 [미니게임]을 열면 스페이스 키로 놀 수 있어요.';
        return this.lastAction;
      }
      this.openGame();
    } else if (this.focusedWindow?.id !== window.id) {
      this.focusWindow(window.id);
    }
    return this.pressGame();
  }

  /** 가상 브라우저의 주소창·검색창에 글자를 넣는다. */
  #typeIntoBrowser(key: string, text: string | null): string {
    let action: string;
    if (key === 'enter') {
      action = this.browser.field === 'address' ? this.browserGo() : this.browserSearch();
    } else if (key === 'backspace') {
      action = this.browserBackspace();
    } else if (key === 'escape') {
      action = '가상 브라우저에서 Esc를 눌렀어요.';
    } else if (key === 'tab' || text === '\t') {
      this.browser = { ...this.browser, field: this.browser.field === 'address' ? 'search' : 'address' };
      action = `가상 브라우저에서 ${this.browser.field === 'address' ? '주소창' : '검색창'}으로 옮겼어요.`;
    } else if (text !== null) {
      action = this.browserType(text);
    } else {
      action = `${key} 키: 가상 브라우저에는 정해진 동작이 없어요.`;
    }
    this.lastAction = action;
    return action;
  }

  #typeIntoDialog(key: string, text: string | null): string {
    const dialog = this.dialog!;
    if (key === 'enter') {
      return this.#confirmDialog();
    }
    if (key === 'escape') {
      return this.#cancelDialog();
    }
    if (dialog.kind === 'message') {
      return '안내 상자가 열려 있어요. Enter로 닫아요.';
    }
    if (dialog.kind === 'save' && dialog.selected) {
      // 골라 둔 파일 이름: 지우는 키는 통째로 지우고, 글자는 통째로 바꾸고, 방향키·Home·End는 고름만 푼다(진짜 Windows와 같게)
      if (key === 'backspace' || key === 'delete') {
        dialog.fileName = '';
        dialog.selected = false;
        return '저장 창에서 골라 둔 파일 이름을 지웠어요. 새 이름을 쳐요.';
      }
      if (text !== null && text !== '\n' && text !== '\t') {
        dialog.fileName = text.slice(0, 60);
        dialog.selected = false;
        return `저장 창의 골라 둔 파일 이름을 '${text}'(으)로 바꿨어요. 이어서 새 이름을 쳐요.`;
      }
      if (['left', 'right', 'home', 'end'].includes(key)) {
        dialog.selected = false;
        return `${key} 키: 파일 이름 칸의 고름을 풀었어요(글자는 그대로예요).`;
      }
    }
    if (key === 'backspace') {
      if (dialog.kind === 'save') {
        dialog.fileName = dialog.fileName.slice(0, -1);
      } else {
        dialog.text = dialog.text.slice(0, -1);
      }
      return '대화상자의 마지막 글자를 지웠어요.';
    }
    if (text !== null && text !== '\n' && text !== '\t') {
      if (dialog.kind === 'save') {
        dialog.fileName = (dialog.fileName + text).slice(0, 60);
      } else {
        dialog.text = (dialog.text + text).slice(0, 60);
      }
      return `대화상자에 '${text}'을(를) 넣었어요.`;
    }
    return `${key} 키: 대화상자가 열려 있어요.`;
  }

  #openSaveDialog(): string {
    const focused = this.focusedWindow;
    if (!focused) {
      return 'Ctrl+S: 저장할 창이 없어요.';
    }
    if (focused.kind !== 'notepad' && focused.kind !== 'paint') {
      return `Ctrl+S: ${WINDOW_LABELS[focused.kind]} 창에는 저장할 것이 없어요(메모장·그림판에서 눌러요).`;
    }
    const fileName = focused.kind === 'notepad' ? this.notepadFileName : '그림.png';
    // 진짜 Windows처럼 파일 이름 칸의 글을 모두 골라 둔 채 연다 — 바로 치면 새 이름으로 바뀐다(미해결 178)
    this.dialog = { kind: 'save', windowId: focused.id, fileName, selected: true };
    return `Ctrl+S: 저장 대화상자를 열었어요(${fileName} — 이름이 골라져 있어 바로 치면 바뀌어요). Enter나 [저장]을 눌러요.`;
  }

  #confirmDialog(): string {
    const dialog = this.dialog;
    if (!dialog) {
      return '';
    }
    this.dialog = null;
    let action: string;
    if (dialog.kind === 'save') {
      const window = this.windowById(dialog.windowId);
      const name = dialog.fileName.trim() === '' ? (window?.kind === 'notepad' ? '제목 없음.txt' : '그림.png') : dialog.fileName.trim();
      const file: VirtualFile = {
        name,
        kind: window?.kind === 'notepad' ? 'text' : 'image',
        text: window?.kind === 'notepad' ? this.notepadText : null,
        savedAt: this.#now(),
        source: 'dialog',
      };
      this.addFile(file);
      if (window?.kind === 'notepad') {
        this.notepadFileName = name;
        this.notepadSavedText = this.notepadText;
        this.#refreshNotepadTitle(window);
      }
      action = `가상 파일 "${name}"으로 저장했어요(이 컴퓨터 밖으로 나가지 않아요).`;
    } else if (dialog.kind === 'run') {
      const command = dialog.text.trim().toLowerCase();
      if (['notepad', 'notepad.exe', '메모장'].includes(command)) {
        this.openWindow('notepad');
        action = `실행: "${dialog.text.trim()}" → 메모장을 열었어요.`;
      } else if (['mspaint', 'mspaint.exe', 'paint', '그림판'].includes(command)) {
        this.openWindow('paint');
        action = `실행: "${dialog.text.trim()}" → 그림판을 열었어요.`;
      } else if (['browser', 'web', '브라우저', '웹'].includes(command)) {
        this.openWindow('browser');
        action = `실행: "${dialog.text.trim()}" → 웹 브라우저를 열었어요.`;
      } else if (['game', 'minigame', '게임', '미니게임'].includes(command)) {
        this.openGame();
        action = this.lastAction;
      } else if (command === '') {
        action = '실행: 아무것도 치지 않아서 닫았어요.';
      } else {
        this.dialog = { kind: 'message', text: `"${dialog.text.trim()}" 프로그램은 가상 데스크톱에 없어요. notepad, mspaint, browser, game을 써 봐요.` };
        action = `실행: "${dialog.text.trim()}"은(는) 가상 데스크톱에 없는 프로그램이에요.`;
      }
    } else {
      action = '안내 상자를 닫았어요.';
    }
    this.lastAction = action;
    return action;
  }

  #cancelDialog(): string {
    this.dialog = null;
    this.lastAction = '대화상자를 취소했어요.';
    return this.lastAction;
  }

  #openMenu(point: Point, target: ContextMenu['target']): string {
    let items: MenuItem[];
    if (target.kind === 'desktop') {
      items = [
        { id: 'new-notepad', label: '새 메모장 열기' },
        { id: 'new-paint', label: '새 그림판 열기' },
        { id: 'new-browser', label: '웹 브라우저 열기' },
        { id: 'new-game', label: '미니게임 열기' },
        { id: 'clear', label: '화면 정리(모두 닫기)' },
        { id: 'wallpaper', label: '배경 바꾸기' },
      ];
    } else if (target.kind === 'window') {
      items = [
        { id: 'front', label: '맨 앞으로' },
        { id: 'close', label: '닫기' },
      ];
    } else {
      items = [{ id: 'open', label: '열기' }];
    }
    this.menu = { x: point.x, y: point.y, target, items };
    this.lastAction = '오른쪽 클릭 → 메뉴를 열었어요.';
    return this.lastAction;
  }

  #runMenuItem(id: string): string {
    const menu = this.menu;
    this.menu = null;
    if (!menu) {
      return '';
    }
    let action = `메뉴 "${id}"을(를) 골랐어요.`;
    switch (id) {
      case 'new-notepad':
        this.openWindow('notepad');
        action = '메뉴 → 새 메모장을 열었어요.';
        break;
      case 'new-paint':
        this.openWindow('paint');
        action = '메뉴 → 그림판을 열었어요.';
        break;
      case 'new-browser':
        this.openWindow('browser');
        action = '메뉴 → 웹 브라우저를 열었어요.';
        break;
      case 'new-game':
        this.openGame();
        action = this.lastAction;
        break;
      case 'clear':
        for (const window of [...this.windows]) {
          this.closeWindow(window.id);
        }
        this.strokes = [];
        action = '메뉴 → 창을 모두 닫고 화면을 정리했어요.';
        break;
      case 'wallpaper':
        this.wallpaper = (this.wallpaper + 1) % 3;
        action = `메뉴 → 배경을 ${this.wallpaper + 1}번으로 바꿨어요.`;
        break;
      case 'front':
        if (menu.target.kind === 'window') {
          this.focusWindow(menu.target.id);
          action = `메뉴 → ${this.#windowLabel(menu.target.id)} 창을 맨 앞으로 가져왔어요.`;
        }
        break;
      case 'close':
        if (menu.target.kind === 'window') {
          const label = this.#windowLabel(menu.target.id);
          this.closeWindow(menu.target.id);
          action = `메뉴 → ${label} 창을 닫았어요.`;
        }
        break;
      case 'open':
        if (menu.target.kind === 'icon') {
          const icon = this.icons.find((item) => item.id === (menu.target as { id: string }).id);
          if (icon) {
            this.openWindow(icon.kind);
            action = `메뉴 → ${icon.label}을(를) 열었어요.`;
          }
        }
        break;
      default:
        break;
    }
    this.lastAction = action;
    return action;
  }
}
