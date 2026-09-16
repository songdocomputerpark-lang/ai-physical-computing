/**
 * 가상 데스크톱 모듈의 화면 쪽(src/lab/README.md 4절) — 파이썬 pyautogui.py와 짝이다. PLAN §8.2 P2-11, CODE_MAPPING §3.4, SPEC §6.1.
 *
 * 하는 일
 * 1. panel.astro가 그려 둔 캔버스에 model.ts의 상태를 render.ts로 그린다(논리 1920×1080 → 캔버스 폭에 맞춰 축소).
 * 2. 파이썬이 보낸 이벤트를 모델에 넣는다: desktop.cursor(커서) · desktop.mouse(누름·끌기·놓음) · desktop.click · desktop.key ·
 *    desktop.scroll. desktop.hotkey는 **표시 전용**이다 — 파이썬 hotkey()가 키 down/up을 먼저 보내고 모델이 그때 조합키를
 *    처리하므로(model.key → model.hotkey), 여기서 또 처리하면 저장 대화상자가 두 번 열린다.
 * 3. 학생이 가상 모니터를 직접 쓰게 한다(마우스·키보드). 커서를 옮기면 desktop.pointer 채널로 알려 파이썬 position()이 따라간다
 *    (진짜 PC에서 사람이 마우스를 움직인 것과 같다). 왼쪽 위 모서리 (0, 0)은 PyAutoGUI 안전장치 자리다([모서리로] 버튼).
 * 4. 실행이 시작될 때 모니터 크기·커서 위치를 desktop.state로 넣는다(정지 2단계로 워커가 다시 떠도 값이 살아 있게 — hello 예시와 같은 규칙).
 * 5. 파이썬 screenshot()의 요청(desktop.screenshot)에 캔버스를 RGBA 바이트로 답한다(버퍼는 transfer로 넘겨 복사하지 않는다).
 * 6. (P2-12) desktop.browser: webbrowser.open(url)이 가상 브라우저 창을 연다 — 진짜 인터넷에 가지 않고, 우리 사이트 주소일 때만
 *    패널에 진짜 링크를 함께 둔다(browser.ts의 허용 목록). desktop.file: 학생 코드가 저장한 그림(PNG 바이트)을 '내 파일'에
 *    미리보기·[내려받기]로 둔다(files.ts, 서버를 거치지 않는 Blob 주소).
 * 7. (P2-12) 미니게임(games.ts): 미니게임 창이 열려 있는 동안만 requestAnimationFrame 시계가 돌아 게임이 움직인다.
 *    press('space')는 desktop.key로 들어와 모델이 게임에 넣는다(f121). 창이 없으면 코드가 보낸 스페이스일 때만 열어 준다.
 *
 * 보이기: 영상처리 실습실의 모든 예제가 가상 모니터를 쓰지는 않으므로, 코드에 pyautogui가 보이거나 파이썬이 desktop.open을 보낼 때만 연다.
 * 접근성: 캔버스 글자는 읽어 주지 못하므로 마지막 동작·메모장 글·커서 위치를 옆의 글(aria-live)로 함께 둔다. 캔버스는 tabindex=0이라
 * 키보드로 닿고, Tab·화살표는 가로채지 않는다(model.keyFromBrowser). 움직임 줄이기(prefers-reduced-motion)면 커서를 부드럽게
 * 따라가게 하지 않고 클릭 표시도 커지지 않는다.
 */
import { readItem, writeItem } from '../../../lib/storage.ts';
import { withBase } from '../../../lib/url.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';
import { GAMES, type GameKind } from './games.ts';
import { downloadBytes, fileSizeText, objectUrlOf, revokeObjectUrl } from './files.ts';
import {
  DEFAULT_SCREEN_HEIGHT,
  DEFAULT_SCREEN_WIDTH,
  DesktopModel,
  SCREEN_PRESETS,
  keyFromBrowser,
  type MouseButton,
  type Point,
  type VirtualFile,
} from './model.ts';
import { displayRect, displayScale, drawDesktop, logicalPoint, pruneClickMarks, type ClickMark } from './render.ts';

/** 화면 캡처(screenshot)의 최대 가로 픽셀 — 1920 그대로 찍으면 한 장이 8MB라 절반으로 찍고 파이썬 쪽 Pillow가 논리 크기로 늘린다. */
export const SCREENSHOT_MAX_WIDTH = 960;
/** 학생이 마우스를 움직일 때 파이썬에 알리는 간격(ms) */
const POINTER_PUSH_MS = 60;
/** 두 번 누름으로 보는 시간·거리 */
const DOUBLE_CLICK_MS = 450;
const CLICK_SLOP = 12;
/** 캔버스 픽셀 밀도 상한(고해상도 화면에서 캔버스가 너무 커지지 않게) */
const MAX_PIXEL_RATIO = 2;

/** 학생 코드가 가상 데스크톱을 쓰는지(패널을 열지 정한다) */
export function usesDesktop(code: string): boolean {
  return /^[ \t]*(?:import[ \t]+pyautogui|from[ \t]+pyautogui[ \t]+import)/mu.test(code);
}

/** 브라우저 마우스 단추 번호 → 모델 단추 이름 */
export function buttonName(button: number): MouseButton {
  return button === 2 ? 'right' : button === 1 ? 'middle' : 'left';
}

/** 저장 이름(ctx.storageName(name)과 같은 열쇠가 되게 module:<id>:<name> 규칙을 그대로 쓴다 — [기록 지우기]가 함께 지운다) */
function storeName(name: string): string {
  return `module:${manifest.id}:${name}`;
}

interface DesktopElements {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  screenSelect: HTMLSelectElement | null;
  trailToggle: HTMLInputElement | null;
  cornerButton: HTMLButtonElement | null;
  resetButton: HTMLButtonElement | null;
  actionText: HTMLElement | null;
  notepadText: HTMLElement | null;
  cursorText: HTMLElement | null;
  filesText: HTMLElement | null;
  gameSelect: HTMLSelectElement | null;
  gameOpenButton: HTMLButtonElement | null;
  browserOpenButton: HTMLButtonElement | null;
  gameScoreText: HTMLElement | null;
  browserLink: HTMLElement | null;
  browserHref: HTMLAnchorElement | null;
  fileList: HTMLElement | null;
}

function findElements(panel: HTMLElement): DesktopElements | null {
  const root = panel.querySelector<HTMLElement>('[data-desktop]');
  const canvas = panel.querySelector<HTMLCanvasElement>('[data-desktop-canvas]');
  const stage = panel.querySelector<HTMLElement>('[data-desktop-stage]');
  if (!root || !canvas || !stage) {
    return null;
  }
  return {
    root,
    canvas,
    stage,
    screenSelect: panel.querySelector<HTMLSelectElement>('[data-desktop-screen]'),
    trailToggle: panel.querySelector<HTMLInputElement>('[data-desktop-trail]'),
    cornerButton: panel.querySelector<HTMLButtonElement>('[data-desktop-corner]'),
    resetButton: panel.querySelector<HTMLButtonElement>('[data-desktop-reset]'),
    actionText: panel.querySelector<HTMLElement>('[data-desktop-action]'),
    notepadText: panel.querySelector<HTMLElement>('[data-desktop-notepad]'),
    cursorText: panel.querySelector<HTMLElement>('[data-desktop-cursor]'),
    filesText: panel.querySelector<HTMLElement>('[data-desktop-files]'),
    gameSelect: panel.querySelector<HTMLSelectElement>('[data-desktop-game-select]'),
    gameOpenButton: panel.querySelector<HTMLButtonElement>('[data-desktop-game-open]'),
    browserOpenButton: panel.querySelector<HTMLButtonElement>('[data-desktop-browser-open]'),
    gameScoreText: panel.querySelector<HTMLElement>('[data-desktop-game-text]'),
    browserLink: panel.querySelector<HTMLElement>('[data-desktop-browser-link]'),
    browserHref: panel.querySelector<HTMLAnchorElement>('[data-desktop-browser-href]'),
    fileList: panel.querySelector<HTMLElement>('[data-desktop-file-list]'),
  };
}

/** 화면에서 읽을 수 있는 가상 데스크톱 조작(브라우저 테스트·다음 단계 모듈이 쓴다) */
export interface DesktopView {
  readonly model: DesktopModel;
  /** 지금 상태를 다시 그린다(다음 애니메이션 프레임에) */
  redraw(): void;
  /** 파이썬에 모니터 크기·커서 위치를 알린다 */
  sendState(): void;
  /** 가상 모니터를 연다(코드에 pyautogui가 보이면 자동으로 열린다) */
  show(): void;
  dispose(): void;
}

const views = new WeakMap<HTMLElement, DesktopView>();

/** 붙어 있는 가상 데스크톱 화면(다음 단계 모듈·테스트가 모델을 볼 때) */
export function getDesktopView(root: HTMLElement | null): DesktopView | null {
  return root ? (views.get(root) ?? null) : null;
}

function mount(context: LabModuleContext): LabModuleHandle {
  const panel = context.panel;
  const found = panel ? findElements(panel) : null;
  if (!panel || !found) {
    context.notice('가상 데스크톱 화면을 찾지 못했어요(panel.astro).');
    return {};
  }
  // 아래 함수들이 닫아 쓰므로 "null이 아님"을 새 const에 담는다(닫힌 함수 안에서는 위 검사의 좁히기가 이어지지 않는다).
  const elements: DesktopElements = found;
  const { root, canvas, stage } = elements;
  const ctx2d = canvas.getContext('2d', { alpha: false });
  if (!ctx2d) {
    context.notice('이 브라우저에서 가상 모니터를 그릴 수 없어요(캔버스 2D를 쓸 수 없어요).');
    return {};
  }

  const reducedMotionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const savedScreen = readItem(storeName('screen'));
  const preset = SCREEN_PRESETS.find((item) => `${item.width}x${item.height}` === savedScreen);
  const model = new DesktopModel(preset?.width ?? DEFAULT_SCREEN_WIDTH, preset?.height ?? DEFAULT_SCREEN_HEIGHT);
  let clickMarks: ClickMark[] = [];
  let showTrail = readItem(storeName('trail')) !== 'off';
  let running = false;
  let frame = 0;
  let cursorAt: Point = model.cursor;
  let lastPointerPush = 0;
  let lastPointerDown = { x: 0, y: 0, at: 0, count: 0 };
  let disposed = false;
  // 방금 온 조합키 이름(안내 글 앞에 붙인다). 모델의 마지막 동작이 바뀌면 지운다 — 그리기가 돌 때마다 덮어쓰이지 않게 여기서 함께 만든다.
  let hotkeyLabel: string | null = null;
  let hotkeyFor: string | null = null;
  /** 미니게임이 열려 있는 동안 도는 시계(requestAnimationFrame). 창이 닫히면 멈춘다. */
  let gameFrame = 0;
  /** 파일 미리보기 주소(Blob). 카드를 다시 만들 때 거둔다. */
  let fileUrls: string[] = [];
  let lastFilesKey = '';

  const reducedMotion = () => reducedMotionQuery?.matches === true;

  // ── 그리기 ──

  function fitCanvas(): void {
    const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    const cssWidth = Math.max(160, Math.round(stage.clientWidth));
    const cssHeight = Math.round((cssWidth * model.height) / model.width);
    stage.style.setProperty('--desktop-height', `${cssHeight}px`);
    const pixelWidth = Math.round(cssWidth * ratio);
    const pixelHeight = Math.round(cssHeight * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
  }

  function draw(): void {
    frame = 0;
    if (disposed) {
      return;
    }
    fitCanvas();
    const now = performance.now();
    clickMarks = pruneClickMarks(clickMarks, now);
    const scale = displayScale(canvas.width, model.width);
    const still = reducedMotion();
    if (still) {
      cursorAt = model.cursor;
    } else {
      // 커서가 목표로 부드럽게 다가간다(duration=0으로 건너뛴 이동도 눈으로 따라갈 수 있게).
      const dx = model.cursor.x - cursorAt.x;
      const dy = model.cursor.y - cursorAt.y;
      cursorAt = Math.abs(dx) + Math.abs(dy) < 3 ? model.cursor : { x: cursorAt.x + dx * 0.4, y: cursorAt.y + dy * 0.4 };
    }
    drawDesktop(ctx2d!, model, { scale, showTrail, reducedMotion: still, clickMarks, now, running, cursorAt });
    updateText(scale);
    // 미니게임 창이 열려 있으면 게임 시계를 챙긴다(창을 어떻게 열었든 한 곳에서 시작된다).
    startGameLoop();
    if (clickMarks.length > 0 || (cursorAt !== model.cursor && !still)) {
      redraw();
    }
  }

  function redraw(): void {
    if (frame === 0 && !disposed) {
      frame = requestAnimationFrame(draw);
    }
  }

  /**
   * 미니게임 창이 열려 있는 동안만 도는 시계. 창이 없으면 스스로 멈춘다(가만히 있을 때 CPU를 쓰지 않게).
   * 움직임 줄이기(prefers-reduced-motion)면 games.ts가 속도를 절반으로 낮춘다.
   */
  function gameTick(): void {
    gameFrame = 0;
    if (disposed || !model.windowOfKind('game')) {
      return;
    }
    // 시계는 모델과 같은 것(Date.now)을 쓴다 — performance.now를 섞으면 games.ts가 매 판 시계를 다시 맞추느라 게임이 멈춘다.
    if (model.stepGame({ reducedMotion: reducedMotion() })) {
      redraw();
    }
    startGameLoop();
  }

  function startGameLoop(): void {
    if (gameFrame === 0 && !disposed && model.windowOfKind('game')) {
      gameFrame = requestAnimationFrame(gameTick);
    }
  }

  function updateText(scale: number): void {
    root.dataset.desktopWidth = String(model.width);
    root.dataset.desktopHeight = String(model.height);
    root.dataset.desktopX = String(model.cursor.x);
    root.dataset.desktopY = String(model.cursor.y);
    root.dataset.desktopWindows = model.windows.map((window) => window.kind).join(' ');
    root.dataset.desktopStrokes = String(model.strokes.length);
    root.dataset.desktopChars = String(model.notepadText.length); // 메모장 글자 수(글 자체는 [data-desktop-notepad])
    root.dataset.desktopRunning = running ? 'yes' : 'no';
    root.dataset.desktopDialog = model.dialog?.kind ?? ''; // save|run|message (없으면 빈 글자)
    root.dataset.desktopMenu = model.menu ? model.menu.target.kind : ''; // desktop|window|icon
    root.dataset.desktopFileCount = String(model.files.length);
    // 그림판에서 실제로 그려지는 영역(캔버스 픽셀 — getImageData와 같은 좌표계). 브라우저 테스트가 이 안의 픽셀을 센다.
    const paint = model.windowOfKind('paint');
    if (paint) {
      const area = displayRect(model.canvasRect(paint), scale);
      root.dataset.desktopPaintRect = [area.x, area.y, area.width, area.height].map((value) => Math.round(value)).join(',');
    } else {
      delete root.dataset.desktopPaintRect;
    }
    if (elements.cursorText) {
      elements.cursorText.textContent = `커서 (${model.cursor.x}, ${model.cursor.y}) · 모니터 ${model.width}×${model.height}`;
    }
    if (elements.actionText) {
      if (hotkeyLabel !== null && hotkeyFor !== model.lastAction) {
        hotkeyLabel = null;
        hotkeyFor = null;
      }
      const text = hotkeyLabel === null ? model.lastAction : `${hotkeyLabel} — ${model.lastAction}`;
      if (elements.actionText.textContent !== text) {
        elements.actionText.textContent = text;
      }
    }
    if (elements.notepadText) {
      elements.notepadText.textContent = model.notepadText;
    }
    if (elements.filesText) {
      elements.filesText.textContent = model.files.length === 0 ? '아직 저장한 파일이 없어요.' : model.files.map((file) => file.name).join(', ');
    }
    updateBrowserText();
    updateGameText();
    updateFileList();
  }

  /** 가상 브라우저 상태(테스트가 읽는 값 + 우리 사이트 주소일 때의 진짜 링크) */
  function updateBrowserText(): void {
    const browser = model.browser;
    const open = model.windowOfKind('browser') !== null;
    root.dataset.desktopBrowser = open ? browser.view : ''; // practice|results|page (창이 없으면 빈 글자)
    root.dataset.desktopBrowserUrl = browser.url;
    root.dataset.desktopBrowserQuery = browser.query;
    root.dataset.desktopBrowserResults = String(browser.results?.entries.length ?? 0);
    root.dataset.desktopBrowserKind = browser.info.kind; // site|outside|empty
    const path = open && browser.info.kind === 'site' ? browser.info.path : null;
    if (elements.browserLink) {
      elements.browserLink.hidden = path === null;
    }
    if (elements.browserHref && path) {
      elements.browserHref.href = withBase(path);
    }
  }

  /** 미니게임 점수(캔버스 글자는 읽어 주지 못하므로 옆에 글로도 둔다) */
  function updateGameText(): void {
    const open = model.windowOfKind('game') !== null;
    root.dataset.desktopGame = open ? model.game.kind : '';
    root.dataset.desktopGameScore = String(model.game.score);
    root.dataset.desktopGamePresses = String(model.game.presses);
    if (elements.gameScoreText) {
      const text = open ? model.gameScore() : '';
      if (elements.gameScoreText.textContent !== text) {
        elements.gameScoreText.textContent = text;
      }
    }
    if (elements.gameSelect && elements.gameSelect.value !== model.game.kind) {
      elements.gameSelect.value = model.game.kind;
    }
  }

  /** '내 파일' 카드(미리보기 + [내려받기]). 목록이 바뀔 때만 다시 만든다. */
  function updateFileList(): void {
    const list = elements.fileList;
    if (!list) {
      return;
    }
    const key = model.files.map((file) => `${file.name}:${file.savedAt}:${file.bytes?.byteLength ?? 0}`).join('|');
    if (key === lastFilesKey) {
      return;
    }
    lastFilesKey = key;
    for (const url of fileUrls) {
      revokeObjectUrl(url);
    }
    fileUrls = [];
    list.textContent = '';
    for (const file of model.files) {
      list.append(fileCard(file));
    }
  }

  function fileCard(file: VirtualFile): HTMLElement {
    const doc = root.ownerDocument;
    const item = doc.createElement('li');
    item.className = 'desktop__file';
    item.dataset.desktopFile = file.name;
    if (file.bytes) {
      const url = objectUrlOf(file.bytes);
      if (url) {
        fileUrls.push(url);
        const image = doc.createElement('img');
        image.src = url;
        image.alt = `${file.name} 미리보기`;
        image.width = 160;
        item.append(image);
      }
    }
    const name = doc.createElement('p');
    name.className = 'desktop__file-name';
    name.textContent = file.name;
    item.append(name);
    const size = doc.createElement('p');
    size.className = 'desktop__file-size';
    size.textContent = file.bytes
      ? `${file.width ?? 0}×${file.height ?? 0} · ${fileSizeText(file.bytes.byteLength)}`
      : file.kind === 'text'
        ? `글 ${file.text?.length ?? 0}자(가상 파일)`
        : '가상 파일';
    item.append(size);
    if (file.bytes) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'lab-button lab-button--small';
      button.dataset.desktopDownload = file.name;
      button.textContent = '내려받기';
      button.addEventListener('click', () => {
        if (!downloadBytes(file.name, file.bytes!)) {
          context.notice('이 브라우저에서는 파일 내려받기를 시작할 수 없어요.');
        }
      });
      item.append(button);
    }
    return item;
  }

  function addClickMark(x: number, y: number, button: MouseButton): void {
    clickMarks = [...clickMarks.slice(-11), { x, y, button, at: performance.now() }];
  }

  // ── 파이썬 → 화면 ──

  function open(): void {
    context.showPanel();
    redraw();
  }

  context.onEvent('desktop.open', (payload) => {
    const state = (payload ?? {}) as { width?: number; height?: number };
    if (typeof state.width === 'number' && typeof state.height === 'number' && (state.width !== model.width || state.height !== model.height)) {
      // 파이썬이 다른 크기를 알고 있으면(예전 실행) 화면 크기를 다시 알린다.
      sendState();
    }
    open();
  });

  context.onEvent('desktop.cursor', (payload) => {
    const point = (payload ?? {}) as { x?: number; y?: number };
    const moved = model.moveCursor(Number(point.x ?? 0), Number(point.y ?? 0));
    model.addTrail(moved);
    redraw();
  });

  context.onEvent('desktop.mouse', (payload) => {
    const event = (payload ?? {}) as { type?: string; x?: number; y?: number; button?: string };
    const x = Number(event.x ?? model.cursor.x);
    const y = Number(event.y ?? model.cursor.y);
    const button = (event.button === 'right' || event.button === 'middle' ? event.button : 'left') as MouseButton;
    if (event.type === 'down') {
      model.mouseDown(x, y, button);
    } else if (event.type === 'up') {
      model.mouseUp(x, y, button);
    } else {
      model.addTrail(model.moveCursor(x, y));
    }
    redraw();
  });

  context.onEvent('desktop.click', (payload) => {
    const event = (payload ?? {}) as { x?: number; y?: number; button?: string; count?: number };
    const x = Number(event.x ?? model.cursor.x);
    const y = Number(event.y ?? model.cursor.y);
    const button = (event.button === 'right' || event.button === 'middle' ? event.button : 'left') as MouseButton;
    model.click(x, y, button, Number(event.count ?? 1));
    addClickMark(model.cursor.x, model.cursor.y, button);
    redraw();
  });

  context.onEvent('desktop.key', (payload) => {
    const event = (payload ?? {}) as { type?: string; key?: string; text?: string | null };
    if (typeof event.key !== 'string') {
      return;
    }
    // fromScript: 학생 코드가 보낸 키다. press('space')는 미니게임으로 가고, 게임 창이 없으면 열어 준다(f121).
    model.key(event.type === 'up' ? 'up' : 'down', event.key, typeof event.text === 'string' ? event.text : null, { fromScript: true });
    redraw();
  });

  // webbrowser.open(url) → 가상 브라우저 창(P2-12). 진짜 인터넷 요청은 나가지 않는다.
  context.onEvent('desktop.browser', (payload) => {
    const event = (payload ?? {}) as { url?: unknown };
    model.openBrowser(typeof event.url === 'string' ? event.url : '');
    open();
    redraw();
  });

  // screenshot().save(이름) → '내 파일'(미리보기·내려받기). bytes는 PNG 바이트다.
  context.onEvent('desktop.file', (payload) => {
    const event = (payload ?? {}) as { name?: unknown; bytes?: unknown; width?: unknown; height?: unknown };
    if (typeof event.name !== 'string' || !(event.bytes instanceof Uint8Array)) {
      return;
    }
    model.addFile({
      name: event.name,
      kind: 'image',
      text: null,
      savedAt: Date.now(),
      bytes: event.bytes,
      width: Number(event.width ?? 0),
      height: Number(event.height ?? 0),
      source: 'python',
    });
    model.lastAction = `학생 코드가 그림 파일 "${event.name}"을(를) 저장했어요(아래 '내 파일'에서 내려받을 수 있어요).`;
    redraw();
  });

  // 조합키는 파이썬이 보낸 키 down/up으로 모델이 이미 처리했다. 여기서는 마지막 동작 글 앞에 조합키 이름만 붙인다(두 번 처리 금지).
  context.onEvent('desktop.hotkey', (payload) => {
    const keys = ((payload ?? {}) as { keys?: unknown }).keys;
    if (Array.isArray(keys) && keys.length > 0) {
      hotkeyLabel = keys.map((key) => String(key)).join('+');
      hotkeyFor = model.lastAction;
      redraw();
    }
  });

  context.onEvent('desktop.scroll', (payload) => {
    const event = (payload ?? {}) as { x?: number; y?: number; clicks?: number };
    model.scroll(Number(event.x ?? model.cursor.x), Number(event.y ?? model.cursor.y), Number(event.clicks ?? 0));
    redraw();
  });

  context.onRequest('desktop.screenshot', (request) => {
    try {
      const shot = renderScreenshot();
      // getImageData의 data.buffer 타입은 ArrayBufferLike(SharedArrayBuffer도 될 수 있는 이름)지만,
      // 캔버스가 준 것은 언제나 ArrayBuffer라 그대로 옮긴다(transfer).
      request.reply(shot, [shot.data.buffer as ArrayBuffer]);
    } catch (error) {
      request.fail(`가상 모니터를 캡처하지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  /** 가상 모니터를 그림 한 장(RGBA)으로 찍는다. 커서·궤적·클릭 표시는 빼서 진짜 PC의 화면 캡처와 같게 한다. */
  function renderScreenshot(): { width: number; height: number; data: Uint8ClampedArray } {
    const scale = Math.min(1, SCREENSHOT_MAX_WIDTH / model.width);
    const width = Math.max(1, Math.round(model.width * scale));
    const height = Math.max(1, Math.round(model.height * scale));
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const shotCtx = offscreen.getContext('2d', { alpha: false });
    if (!shotCtx) {
      throw new Error('캔버스 2D를 쓸 수 없어요.');
    }
    drawDesktop(shotCtx, model, {
      scale: width / model.width,
      showTrail: false,
      reducedMotion: true,
      clickMarks: [],
      now: performance.now(),
      running: false,
      showCursor: false,
    });
    const image = shotCtx.getImageData(0, 0, width, height);
    return { width, height, data: image.data };
  }

  // ── 화면 → 파이썬 ──

  function sendState(): void {
    context.setValue('desktop.state', { width: model.width, height: model.height, x: model.cursor.x, y: model.cursor.y });
  }

  function pushPointer(force = false): void {
    const now = performance.now();
    if (!force && now - lastPointerPush < POINTER_PUSH_MS) {
      return;
    }
    lastPointerPush = now;
    if (context.runtime.state === 'running') {
      context.pushEvent('desktop.pointer', { x: model.cursor.x, y: model.cursor.y });
    } else {
      sendState();
    }
  }

  // ── 학생의 마우스·키보드 ──

  function pointOf(event: PointerEvent | MouseEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const scale = displayScale(rect.width, model.width);
    const point = logicalPoint(event.clientX - rect.left, event.clientY - rect.top, scale);
    return model.clampPoint(point.x, point.y);
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 2) {
      return; // contextmenu에서 다룬다
    }
    const point = pointOf(event);
    canvas.focus();
    canvas.setPointerCapture?.(event.pointerId);
    const now = performance.now();
    const near = Math.abs(point.x - lastPointerDown.x) + Math.abs(point.y - lastPointerDown.y) <= CLICK_SLOP;
    lastPointerDown = { x: point.x, y: point.y, at: now, count: near && now - lastPointerDown.at < DOUBLE_CLICK_MS ? lastPointerDown.count + 1 : 1 };
    model.mouseDown(point.x, point.y, buttonName(event.button));
    pushPointer(true);
    redraw();
  };

  const onPointerMove = (event: PointerEvent) => {
    const point = pointOf(event);
    if (point.x === model.cursor.x && point.y === model.cursor.y) {
      return;
    }
    model.moveCursor(point.x, point.y);
    pushPointer();
    redraw();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.button === 2) {
      return;
    }
    const point = pointOf(event);
    const dragged = model.dragKind;
    model.mouseUp(point.x, point.y, buttonName(event.button));
    const moved = Math.abs(point.x - lastPointerDown.x) + Math.abs(point.y - lastPointerDown.y) > CLICK_SLOP;
    if (!moved && dragged === 'none') {
      model.click(point.x, point.y, buttonName(event.button), lastPointerDown.count);
      addClickMark(point.x, point.y, buttonName(event.button));
    }
    pushPointer(true);
    redraw();
  };

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    const point = pointOf(event);
    model.click(point.x, point.y, 'right', 1);
    addClickMark(point.x, point.y, 'right');
    pushPointer(true);
    redraw();
  };

  const onWheel = (event: WheelEvent) => {
    // 초점이 가상 모니터에 있을 때만 스크롤을 가져간다(그렇지 않으면 페이지를 못 내려 답답하다).
    if (!event.deltaY || document.activeElement !== canvas) {
      return;
    }
    event.preventDefault();
    model.scroll(model.cursor.x, model.cursor.y, event.deltaY > 0 ? -1 : 1);
    redraw();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const key = keyFromBrowser(event);
    if (!key) {
      return; // Tab·화살표는 브라우저에 맡긴다(초점 이동)
    }
    event.preventDefault();
    if (key.modifiers.length > 0) {
      model.hotkey([...key.modifiers, key.key]);
    } else {
      // 학생이 직접 누른 키다(fromScript 아님): 스페이스는 미니게임이 이미 열려 있을 때만 게임으로 간다.
      model.key('down', key.key, key.text);
    }
    redraw();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const key = keyFromBrowser(event);
    if (key && key.modifiers.length === 0) {
      model.key('up', key.key, null);
    }
  };

  // ── 패널 조작 ──

  const onScreenChange = () => {
    const value = elements.screenSelect?.value ?? '';
    const chosen = SCREEN_PRESETS.find((item) => `${item.width}x${item.height}` === value);
    if (!chosen) {
      return;
    }
    model.resize(chosen.width, chosen.height);
    writeItem(storeName('screen'), value);
    cursorAt = model.cursor;
    sendState();
    redraw();
  };

  const onTrailChange = () => {
    showTrail = elements.trailToggle?.checked !== false;
    writeItem(storeName('trail'), showTrail ? 'on' : 'off');
    redraw();
  };

  const onCorner = () => {
    model.moveCursor(0, 0);
    model.lastAction = '커서를 왼쪽 위 모서리 (0, 0)로 보냈어요 — 다음 pyautogui 함수에서 FailSafeException이 나요.';
    cursorAt = model.cursor;
    pushPointer(true);
    redraw();
  };

  const onReset = () => {
    model.reset();
    clickMarks = [];
    cursorAt = model.cursor;
    sendState();
    redraw();
  };

  const onGameOpen = () => {
    const chosen = GAMES.find((game) => game.id === elements.gameSelect?.value);
    model.openGame(chosen?.id as GameKind | undefined);
    canvas.focus();
    redraw();
  };

  const onGameSelect = () => {
    const chosen = GAMES.find((game) => game.id === elements.gameSelect?.value);
    if (chosen && model.windowOfKind('game')) {
      model.selectGame(chosen.id);
      redraw();
    }
  };

  const onBrowserOpen = () => {
    model.openWindow('browser');
    model.lastAction = '가상 브라우저를 열었어요. 주소창이나 연습 검색창에 글자를 쳐 봐요.';
    canvas.focus();
    redraw();
  };

  const onResize = () => redraw();

  stage.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  elements.screenSelect?.addEventListener('change', onScreenChange);
  elements.trailToggle?.addEventListener('change', onTrailChange);
  elements.cornerButton?.addEventListener('click', onCorner);
  elements.resetButton?.addEventListener('click', onReset);
  elements.gameOpenButton?.addEventListener('click', onGameOpen);
  elements.gameSelect?.addEventListener('change', onGameSelect);
  elements.browserOpenButton?.addEventListener('click', onBrowserOpen);
  window.addEventListener('resize', onResize);

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => redraw()) : null;
  observer?.observe(stage);

  // 화면 고르기 상자 값 맞추기
  if (elements.screenSelect) {
    elements.screenSelect.value = `${model.width}x${model.height}`;
  }
  if (elements.trailToggle) {
    elements.trailToggle.checked = showTrail;
  }

  // ── 실습실 이벤트 ──

  context.onLab('run', () => {
    running = true;
    model.clearTrail();
    clickMarks = [];
    sendState();
    redraw();
  });

  context.onLab('done', () => {
    running = false;
    redraw();
  });

  context.onLab('code', (event) => {
    if (usesDesktop(event.code)) {
      open();
    }
  });

  context.onLab('records-cleared', () => {
    showTrail = true;
    if (elements.trailToggle) {
      elements.trailToggle.checked = true;
    }
    model.resize(DEFAULT_SCREEN_WIDTH, DEFAULT_SCREEN_HEIGHT);
    if (elements.screenSelect) {
      elements.screenSelect.value = `${DEFAULT_SCREEN_WIDTH}x${DEFAULT_SCREEN_HEIGHT}`;
    }
    cursorAt = model.cursor;
    sendState();
    redraw();
  });

  if (usesDesktop(context.lab.getCode())) {
    open();
  }
  sendState();
  redraw();

  const view: DesktopView = {
    model,
    redraw,
    sendState,
    show: open,
    dispose() {
      disposed = true;
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      if (gameFrame !== 0) {
        cancelAnimationFrame(gameFrame);
        gameFrame = 0;
      }
      for (const url of fileUrls) {
        revokeObjectUrl(url);
      }
      fileUrls = [];
      observer?.disconnect();
      stage.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      elements.screenSelect?.removeEventListener('change', onScreenChange);
      elements.trailToggle?.removeEventListener('change', onTrailChange);
      elements.cornerButton?.removeEventListener('click', onCorner);
      elements.resetButton?.removeEventListener('click', onReset);
      elements.gameOpenButton?.removeEventListener('click', onGameOpen);
      elements.gameSelect?.removeEventListener('change', onGameSelect);
      elements.browserOpenButton?.removeEventListener('click', onBrowserOpen);
      window.removeEventListener('resize', onResize);
    },
  };
  views.set(context.root, view);
  return {
    dispose() {
      views.delete(context.root);
      view.dispose();
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
