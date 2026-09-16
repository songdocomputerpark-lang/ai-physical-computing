/**
 * 가상 데스크톱 그리기(캔버스 2D) — model.ts의 상태를 한 장으로 그린다. DOM 이벤트·파이썬 연결은 index.ts.
 *
 * 좌표: 모델은 논리 픽셀(기본 1920×1080)이고 캔버스는 화면 폭에 맞춰 줄어든다. drawDesktop이 ctx.setTransform(scale)로 논리 좌표를
 * 그대로 쓰되, 커서 화살표·클릭 표시·궤적 선은 해상도가 커져도 같은 크기로 보이게 표시 픽셀(transform 없음)로 그린다.
 * 사진·상표·원작 화면 없이 도형과 글자만 쓴다(SPEC §6.1·§8). 색은 src/styles/tokens.css의 값과 어울리게 골랐다(캔버스는 CSS 변수를 못 쓴다).
 * 접근성: 캔버스 글자는 읽어 주지 못하므로 index.ts가 메모장 글·마지막 동작을 숨은 글(aria-live)로 함께 둔다.
 */
import { BROWSER_HINT } from './browser.ts';
import { BALLOON_BAND, GAME_COLORS, GAMES, gameInfo, gameScoreText } from './games.ts';
import { PAINT_COLORS, TASKBAR_HEIGHT, TITLE_BAR_HEIGHT, scaleOf, type DesktopModel, type DesktopWindow, type MouseButton, type Point, type Rect } from './model.ts';

export interface ClickMark {
  readonly x: number;
  readonly y: number;
  readonly button: MouseButton;
  /** 표시 시작 시각(ms) */
  readonly at: number;
}

export interface DrawOptions {
  /** 캔버스 픽셀 / 논리 픽셀 */
  readonly scale: number;
  readonly showTrail: boolean;
  readonly reducedMotion: boolean;
  readonly clickMarks: readonly ClickMark[];
  readonly now: number;
  /** 파이썬 코드가 도는 중인지(커서 색으로 표시) */
  readonly running: boolean;
  /** 커서를 그릴지(기본 true). screenshot()은 false — 진짜 PC의 화면 캡처에도 커서는 찍히지 않는다. */
  readonly showCursor?: boolean;
  /** 커서를 그릴 자리(논리 좌표). 없으면 model.cursor. 화면이 커서를 부드럽게 따라가게 할 때 쓴다(reduced-motion이면 안 씀). */
  readonly cursorAt?: Point;
}

/** 표시 픽셀 → 논리 픽셀 비율(캔버스 폭 / 모니터 논리 폭) */
export function displayScale(displayWidth: number, logicalWidth: number): number {
  if (!Number.isFinite(displayWidth) || !Number.isFinite(logicalWidth) || logicalWidth <= 0) {
    return 1;
  }
  return displayWidth / logicalWidth;
}

/** 캔버스 위에서 누른 자리(표시 픽셀) → 가상 모니터 논리 좌표(반올림, 자르지 않음 — 자르기는 model.clampPoint) */
export function logicalPoint(displayX: number, displayY: number, scale: number): Point {
  const factor = scale > 0 ? scale : 1;
  return { x: Math.round(displayX / factor), y: Math.round(displayY / factor) };
}

/** 논리 사각형 → 표시 픽셀 사각형(그림판 영역을 테스트·안내에 알릴 때) */
export function displayRect(rect: Rect, scale: number): Rect {
  return { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
}

/** 클릭 표시가 남는 시간(ms) */
export const CLICK_MARK_MS = 450;

export const UI_FONT = "'Pretendard Variable', Pretendard, 'Pretendard Fallback', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
export const MONO_FONT = "Consolas, 'D2Coding', 'Cascadia Mono', 'Malgun Gothic', monospace";

const COLORS = Object.freeze({
  text: '#17191c',
  textMuted: '#4a5361',
  border: '#7b8594',
  accent: '#1f5bd6',
  accentSoft: '#eaf1fe',
  white: '#ffffff',
  titleFocused: '#1f5bd6',
  titleBlurred: '#c9d1dc',
  taskbar: 'rgba(23, 25, 28, 0.82)',
  trail: '#e0730a',
  selection: 'rgba(31, 91, 214, 0.18)',
  dim: 'rgba(23, 25, 28, 0.35)',
});

const WALLPAPERS: readonly { readonly from: string; readonly to: string; readonly shape: string }[] = Object.freeze([
  { from: '#2c5d92', to: '#183a63', shape: 'rgba(255,255,255,0.08)' },
  { from: '#1f7a6d', to: '#0f4a45', shape: 'rgba(255,255,255,0.09)' },
  { from: '#6b5b95', to: '#3b2f5c', shape: 'rgba(255,255,255,0.08)' },
]);

function roundRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number): void {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.lineTo(rect.x + rect.width - r, rect.y);
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + r);
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - r);
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - r, rect.y + rect.height);
  ctx.lineTo(rect.x + r, rect.y + rect.height);
  ctx.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - r);
  ctx.lineTo(rect.x, rect.y + r);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
  ctx.closePath();
}

function drawWallpaper(ctx: CanvasRenderingContext2D, model: DesktopModel): void {
  const paper = WALLPAPERS[model.wallpaper % WALLPAPERS.length]!;
  const gradient = ctx.createLinearGradient(0, 0, model.width, model.height);
  gradient.addColorStop(0, paper.from);
  gradient.addColorStop(1, paper.to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, model.width, model.height);
  // 부드러운 원 몇 개(사진이 아닌 직접 그린 배경)
  ctx.fillStyle = paper.shape;
  const radii = [0.32, 0.22, 0.16];
  radii.forEach((ratio, index) => {
    ctx.beginPath();
    ctx.arc(model.width * (0.72 + index * 0.08), model.height * (0.68 - index * 0.18), model.height * ratio, 0, Math.PI * 2);
    ctx.fill();
  });
  // 왼쪽 위 모서리 = PyAutoGUI 안전장치 지점(0, 0) 표시
  const s = scaleOf(model.width);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(28 * s, 0);
  ctx.lineTo(0, 28 * s);
  ctx.closePath();
  ctx.fill();
}

function drawIcons(ctx: CanvasRenderingContext2D, model: DesktopModel): void {
  const s = scaleOf(model.width);
  for (const icon of model.icons) {
    const { cell } = icon;
    if (model.selectedIcon === icon.id) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      roundRect(ctx, cell, 12 * s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
    const size = 64 * s;
    const x = cell.x + (cell.width - size) / 2;
    const y = cell.y + 10 * s;
    if (icon.kind === 'paint') {
      // 팔레트: 둥근 판 + 색점 4개 + 붓
      ctx.fillStyle = '#f4f6fa';
      roundRect(ctx, { x, y, width: size, height: size * 0.8 }, 20 * s);
      ctx.fill();
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      const dots = ['#d24b4b', '#1f5bd6', '#3b9360', '#e0b400'];
      dots.forEach((color, index) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + size * (0.25 + (index % 2) * 0.5), y + size * (0.22 + Math.floor(index / 2) * 0.32), 7 * s, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = 5 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + size * 0.15, y + size * 0.98);
      ctx.lineTo(x + size * 0.92, y + size * 0.45);
      ctx.stroke();
    } else if (icon.kind === 'browser') {
      // 가상 브라우저: 주소 줄이 있는 창(상표·로고 없이 도형만)
      ctx.fillStyle = '#f4f6fa';
      roundRect(ctx, { x, y, width: size, height: size * 0.82 }, 10 * s);
      ctx.fill();
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.fillStyle = COLORS.accent;
      roundRect(ctx, { x: x + 8 * s, y: y + 10 * s, width: size - 16 * s, height: 14 * s }, 6 * s);
      ctx.fill();
      ctx.strokeStyle = COLORS.textMuted;
      ctx.lineWidth = 3 * s;
      for (let line = 0; line < 3; line += 1) {
        const ly = y + size * (0.42 + line * 0.14);
        ctx.beginPath();
        ctx.moveTo(x + 10 * s, ly);
        ctx.lineTo(x + size - (line === 2 ? 26 : 10) * s, ly);
        ctx.stroke();
      }
    } else if (icon.kind === 'game') {
      // 미니게임: 띠와 동그라미(자체 제작 게임의 화면을 그대로 줄인 그림)
      ctx.fillStyle = '#f4f6fa';
      roundRect(ctx, { x, y, width: size, height: size * 0.82 }, 12 * s);
      ctx.fill();
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.fillStyle = 'rgba(31, 91, 214, 0.25)';
      ctx.fillRect(x + 6 * s, y + size * 0.3, size - 12 * s, size * 0.22);
      ctx.fillStyle = '#3b9360';
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size * 0.41, 10 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillRect(x + size * 0.25, y + size * 0.66, size * 0.5, 8 * s);
    } else {
      // 메모장: 접힌 종이 + 줄
      const fold = 16 * s;
      ctx.fillStyle = '#fffdf3';
      ctx.beginPath();
      ctx.moveTo(x + 6 * s, y);
      ctx.lineTo(x + size - fold, y);
      ctx.lineTo(x + size, y + fold);
      ctx.lineTo(x + size, y + size);
      ctx.lineTo(x + 6 * s, y + size);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.strokeStyle = COLORS.textMuted;
      ctx.lineWidth = 3 * s;
      for (let line = 0; line < 4; line += 1) {
        const ly = y + size * (0.35 + line * 0.16);
        ctx.beginPath();
        ctx.moveTo(x + 16 * s, ly);
        ctx.lineTo(x + size - 12 * s - (line === 3 ? 18 * s : 0), ly);
        ctx.stroke();
      }
    }
    ctx.fillStyle = COLORS.white;
    ctx.font = `${22 * s}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4 * s;
    ctx.fillText(icon.label, cell.x + cell.width / 2, cell.y + cell.height - 14 * s);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
  ctx.textAlign = 'left';
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const char of paragraph) {
      const candidate = current + char;
      if (current !== '' && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawNotepadBody(ctx: CanvasRenderingContext2D, model: DesktopModel, window: DesktopWindow, focused: boolean): void {
  const s = scaleOf(model.width);
  const body = model.bodyRect(window);
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(body.x, body.y, body.width, body.height);
  const padding = 20 * s;
  const fontSize = 28 * s;
  const lineHeight = 40 * s;
  ctx.font = `${fontSize}px ${MONO_FONT}`;
  ctx.fillStyle = COLORS.text;
  ctx.textBaseline = 'top';
  ctx.save();
  ctx.beginPath();
  ctx.rect(body.x, body.y, body.width, body.height);
  ctx.clip();
  const lines = wrapLines(ctx, model.notepadText, body.width - padding * 2);
  const visible = Math.max(1, Math.floor((body.height - padding * 2) / lineHeight));
  const start = Math.max(0, lines.length - visible);
  const shown = lines.slice(start);
  shown.forEach((line, index) => {
    ctx.fillText(line, body.x + padding, body.y + padding + index * lineHeight);
  });
  if (focused && !model.dialog && !model.menu) {
    const lastLine = shown[shown.length - 1] ?? '';
    const caretX = body.x + padding + ctx.measureText(lastLine).width + 2 * s;
    const caretY = body.y + padding + (shown.length - 1) * lineHeight;
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(caretX, caretY, 3 * s, lineHeight * 0.9);
  }
  if (model.notepadText === '') {
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = `${24 * s}px ${UI_FONT}`;
    ctx.fillText('여기에 typewrite()로 친 글자가 들어가요.', body.x + padding, body.y + padding + lineHeight * 1.2);
  }
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function drawPaintBody(ctx: CanvasRenderingContext2D, model: DesktopModel, window: DesktopWindow): void {
  const s = scaleOf(model.width);
  const body = model.bodyRect(window);
  const canvas = model.canvasRect(window);
  ctx.fillStyle = '#eef1f5';
  ctx.fillRect(body.x, body.y, body.width, body.height);
  for (const cell of model.paletteCells(window)) {
    const entry = PAINT_COLORS.find((item) => item.id === cell.id)!;
    ctx.fillStyle = entry.color;
    roundRect(ctx, cell.rect, 8 * s);
    ctx.fill();
    ctx.lineWidth = (model.paintColorId === cell.id ? 4 : 1.5) * s;
    ctx.strokeStyle = model.paintColorId === cell.id ? COLORS.accent : COLORS.border;
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `${20 * s}px ${UI_FONT}`;
  ctx.textBaseline = 'middle';
  const paletteEnd = model.paletteCells(window).slice(-1)[0];
  if (paletteEnd) {
    ctx.fillText('끌어서 그려요(dragTo·dragRel). moveTo는 선을 남기지 않아요.', paletteEnd.rect.x + paletteEnd.rect.width + 20 * s, paletteEnd.rect.y + paletteEnd.rect.height / 2);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(canvas.x, canvas.y, canvas.width, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(canvas.x, canvas.y, canvas.width, canvas.height);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const strokes = model.currentStroke ? [...model.strokes, model.currentStroke] : model.strokes;
  for (const stroke of strokes) {
    if (stroke.points.length === 0) {
      continue;
    }
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    const first = stroke.points[0]!;
    ctx.moveTo(first.x, first.y);
    if (stroke.points.length === 1) {
      ctx.lineTo(first.x + 0.01, first.y);
    }
    for (const point of stroke.points.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** 글 한 줄을 칸 안에 그린다(넘치면 … 으로 자른다) */
function drawClipped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): void {
  let shown = text;
  if (ctx.measureText(shown).width > maxWidth) {
    while (shown.length > 1 && ctx.measureText(`${shown}…`).width > maxWidth) {
      shown = shown.slice(0, -1);
    }
    shown = `${shown}…`;
  }
  ctx.fillText(shown, x, y);
}

/** 글자 칸(주소창·검색창) 하나 */
function drawField(ctx: CanvasRenderingContext2D, rect: Rect, text: string, placeholder: string, focused: boolean, s: number): void {
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, rect, 10 * s);
  ctx.fill();
  ctx.strokeStyle = focused ? COLORS.accent : COLORS.border;
  ctx.lineWidth = (focused ? 3 : 1.5) * s;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.textBaseline = 'middle';
  ctx.font = `${24 * s}px ${MONO_FONT}`;
  ctx.fillStyle = text === '' ? COLORS.textMuted : COLORS.text;
  drawClipped(ctx, text === '' ? placeholder : `${text}${focused ? '|' : ''}`, rect.x + 14 * s, rect.y + rect.height / 2, rect.width - 24 * s);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

/** 단추 하나(캔버스 안 가짜 단추 — 진짜 단추는 패널에 있다) */
function drawButton(ctx: CanvasRenderingContext2D, rect: Rect, label: string, s: number, active = false): void {
  ctx.fillStyle = active ? COLORS.accent : COLORS.accentSoft;
  roundRect(ctx, rect, 10 * s);
  ctx.fill();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  ctx.fillStyle = active ? COLORS.white : COLORS.accent;
  ctx.font = `600 ${22 * s}px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * 가상 브라우저 창(P2-12). 실제 포털·검색 사이트의 화면 구성·로고·색을 흉내 내지 않는다(SPEC §8):
 * 주소 줄과 연습 검색창, 그리고 이 사이트 안의 쪽 목록만 도형과 글자로 그린다.
 */
function drawBrowserBody(ctx: CanvasRenderingContext2D, model: DesktopModel, window: DesktopWindow, focused: boolean): void {
  const s = scaleOf(model.width);
  const body = model.bodyRect(window);
  const state = model.browser;
  ctx.fillStyle = '#eef1f5';
  ctx.fillRect(body.x, body.y, body.width, body.height);
  const bar = model.browserBarRects(window);
  drawField(ctx, bar.address, state.url, '주소를 적어요', focused && state.field === 'address', s);
  drawButton(ctx, bar.go, '이동', s);

  const page = model.browserPageRect(window);
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(page.x, page.y, page.width, page.height);
  const search = model.browserSearchRects(window);
  ctx.textBaseline = 'top';
  if (state.view === 'practice') {
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${44 * s}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('연습 검색', page.x + page.width / 2, page.y + 56 * s);
    ctx.font = `${24 * s}px ${UI_FONT}`;
    ctx.fillStyle = COLORS.textMuted;
    ctx.fillText(BROWSER_HINT, page.x + page.width / 2, page.y + 112 * s);
    ctx.textAlign = 'left';
  }
  drawField(ctx, search.field, state.query, '찾을 낱말을 적어요', focused && state.field === 'search', s);
  drawButton(ctx, search.go, '검색', s, true);

  const infoY = search.field.y + search.field.height + 18 * s;
  if (state.view === 'practice') {
    ctx.font = `${22 * s}px ${UI_FONT}`;
    ctx.fillStyle = COLORS.textMuted;
    drawClipped(ctx, `주소: ${state.url}`, page.x + 60 * s, infoY, page.width - 120 * s);
    ctx.fillStyle = state.info.kind === 'outside' ? '#b04a00' : COLORS.textMuted;
    const lines = wrapLines(ctx, state.info.notice, page.width - 120 * s);
    lines.slice(0, 2).forEach((line, index) => {
      ctx.fillText(line, page.x + 60 * s, infoY + (32 + index * 30) * s);
    });
  } else if (state.view === 'results') {
    ctx.font = `600 ${26 * s}px ${UI_FONT}`;
    ctx.fillStyle = COLORS.text;
    const title = state.results?.fallback ? `"${state.query}"에 꼭 맞는 쪽이 없어요 — 이 사이트에서 배울 거리예요` : `"${state.query}" 검색 결과(이 사이트 안)`;
    drawClipped(ctx, title, page.x + 60 * s, infoY + 6 * s, page.width - 120 * s);
    const rows = model.browserResultRects(window);
    (state.results?.entries ?? []).forEach((entry, index) => {
      const rect = rows[index];
      if (!rect) {
        return;
      }
      ctx.fillStyle = '#f6f8fb';
      roundRect(ctx, rect, 10 * s);
      ctx.fill();
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      ctx.fillStyle = COLORS.accent;
      ctx.font = `600 ${26 * s}px ${UI_FONT}`;
      drawClipped(ctx, entry.title, rect.x + 18 * s, rect.y + 10 * s, rect.width - 36 * s);
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = `${21 * s}px ${UI_FONT}`;
      drawClipped(ctx, entry.description, rect.x + 18 * s, rect.y + 42 * s, rect.width - 36 * s);
      ctx.font = `${19 * s}px ${MONO_FONT}`;
      drawClipped(ctx, entry.path, rect.x + 18 * s, rect.y + 68 * s, rect.width - 36 * s);
    });
  } else if (state.page) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 ${34 * s}px ${UI_FONT}`;
    drawClipped(ctx, state.page.title, page.x + 60 * s, infoY + 20 * s, page.width - 120 * s);
    ctx.font = `${24 * s}px ${UI_FONT}`;
    ctx.fillStyle = COLORS.textMuted;
    wrapLines(ctx, state.page.description, page.width - 120 * s)
      .slice(0, 3)
      .forEach((line, index) => {
        ctx.fillText(line, page.x + 60 * s, infoY + (68 + index * 32) * s);
      });
    ctx.font = `${20 * s}px ${MONO_FONT}`;
    ctx.fillText(state.page.path, page.x + 60 * s, infoY + 180 * s);
    ctx.font = `${20 * s}px ${UI_FONT}`;
    ctx.fillText('여기는 가상 브라우저 안의 연습 쪽이에요. 진짜 쪽은 아래 패널의 링크로 열어요.', page.x + 60 * s, infoY + 212 * s);
  }

  // 어느 화면에서든 보이는 아래쪽 안내 줄 — "진짜 인터넷이 아니다"를 학생이 늘 볼 수 있게(SPEC §8 사칭 금지).
  const footerHeight = 46 * s;
  const footerY = page.y + page.height - footerHeight;
  ctx.fillStyle = '#f2f4f8';
  ctx.fillRect(page.x, footerY, page.width, footerHeight);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(page.x, footerY);
  ctx.lineTo(page.x + page.width, footerY);
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.font = `${20 * s}px ${UI_FONT}`;
  ctx.fillStyle = state.info.kind === 'outside' ? '#b04a00' : COLORS.textMuted;
  const footerText =
    state.info.kind === 'outside'
      ? '가상 브라우저예요 — 이 주소는 진짜 인터넷에 가지 않고, 이 사이트 안의 연습 쪽만 보여 줘요.'
      : '가상 브라우저예요 — 이 사이트 안의 연습 쪽만 보여 줘요. 진짜 인터넷에는 가지 않아요.';
  drawClipped(ctx, footerText, page.x + 24 * s, footerY + footerHeight / 2, page.width - 48 * s);
  ctx.textBaseline = 'alphabetic';
}

/** 미니게임 창(P2-12, games.ts). 도형·색만 쓴 자체 제작 게임이다(원작 게임의 캐릭터·장애물·화면 구성을 쓰지 않는다). */
function drawGameBody(ctx: CanvasRenderingContext2D, model: DesktopModel, window: DesktopWindow): void {
  const s = scaleOf(model.width);
  const body = model.bodyRect(window);
  const game = model.game;
  ctx.fillStyle = '#f2f4f8';
  ctx.fillRect(body.x, body.y, body.width, body.height);
  for (const tab of model.gameTabRects(window)) {
    const label = tab.game ? GAMES.find((info) => info.id === tab.game)!.label : '다시 하기';
    drawButton(ctx, tab.rect, label, s, tab.game === game.kind);
  }
  const area = model.gameAreaRect(window);
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(area.x, area.y, area.width, area.height);
  const inner: Rect = { x: area.x + 40 * s, y: area.y + 90 * s, width: area.width - 80 * s, height: area.height - 200 * s };

  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `${21 * s}px ${UI_FONT}`;
  drawClipped(ctx, gameInfo(game.kind).rule, area.x + 40 * s, area.y + 18 * s, area.width - 80 * s);

  if (game.kind === 'balloon') {
    const bandTop = inner.y + inner.height * BALLOON_BAND.top;
    const bandHeight = inner.height * (BALLOON_BAND.bottom - BALLOON_BAND.top);
    ctx.fillStyle = 'rgba(31, 91, 214, 0.14)';
    ctx.fillRect(inner.x, bandTop, inner.width, bandHeight);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2 * s;
    ctx.setLineDash([10 * s, 8 * s]);
    ctx.strokeRect(inner.x, bandTop, inner.width, bandHeight);
    ctx.setLineDash([]);
    ctx.fillStyle = game.inBand ? '#3b9360' : '#d24b4b';
    ctx.beginPath();
    ctx.arc(inner.x + inner.width / 2, inner.y + inner.height * game.y, 26 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (game.kind === 'timing') {
    const barY = inner.y + inner.height / 2 - 24 * s;
    ctx.fillStyle = '#e6eaf1';
    roundRect(ctx, { x: inner.x, y: barY, width: inner.width, height: 48 * s }, 12 * s);
    ctx.fill();
    const target: Rect = { x: inner.x + inner.width * 0.45, y: barY, width: inner.width * 0.1, height: 48 * s };
    ctx.fillStyle = 'rgba(59, 147, 96, 0.35)';
    ctx.fillRect(target.x, target.y, target.width, target.height);
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(inner.x + inner.width * game.marker - 4 * s, barY - 16 * s, 8 * s, 80 * s);
  } else {
    const target = GAME_COLORS[game.targetIndex] ?? GAME_COLORS[0]!;
    const current = GAME_COLORS[game.colorIndex] ?? GAME_COLORS[0]!;
    ctx.fillStyle = COLORS.text;
    ctx.font = `600 ${24 * s}px ${UI_FONT}`;
    ctx.fillText(`목표 색: ${target.label}`, inner.x, inner.y);
    ctx.fillStyle = target.color;
    roundRect(ctx, { x: inner.x + 180 * s, y: inner.y - 6 * s, width: 60 * s, height: 36 * s }, 8 * s);
    ctx.fill();
    ctx.fillStyle = current.color;
    const box: Rect = { x: inner.x + inner.width / 2 - 90 * s, y: inner.y + 70 * s, width: 180 * s, height: 180 * s };
    roundRect(ctx, box, 18 * s);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = `${22 * s}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`지금 색: ${current.label}`, box.x + box.width / 2, box.y + box.height + 14 * s);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = COLORS.text;
  ctx.font = `600 ${26 * s}px ${UI_FONT}`;
  drawClipped(ctx, gameScoreText(game), area.x + 40 * s, area.y + area.height - 84 * s, area.width - 80 * s);
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `${21 * s}px ${UI_FONT}`;
  drawClipped(ctx, game.message, area.x + 40 * s, area.y + area.height - 48 * s, area.width - 80 * s);
  ctx.textBaseline = 'alphabetic';
}

function drawWindow(ctx: CanvasRenderingContext2D, model: DesktopModel, window: DesktopWindow, focused: boolean): void {
  const s = scaleOf(model.width);
  const title = TITLE_BAR_HEIGHT * s;
  const { rect } = window;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 24 * s;
  ctx.shadowOffsetY = 8 * s;
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, rect, 12 * s);
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, rect, 12 * s);
  ctx.clip();
  ctx.fillStyle = focused ? COLORS.titleFocused : COLORS.titleBlurred;
  ctx.fillRect(rect.x, rect.y, rect.width, title);
  ctx.fillStyle = focused ? COLORS.white : COLORS.text;
  ctx.font = `${24 * s}px ${UI_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(window.title, rect.x + 20 * s, rect.y + title / 2);
  // 닫기 단추(×)
  const closeX = rect.x + rect.width - title;
  ctx.strokeStyle = focused ? COLORS.white : COLORS.text;
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(closeX + title * 0.32, rect.y + title * 0.32);
  ctx.lineTo(closeX + title * 0.68, rect.y + title * 0.68);
  ctx.moveTo(closeX + title * 0.68, rect.y + title * 0.32);
  ctx.lineTo(closeX + title * 0.32, rect.y + title * 0.68);
  ctx.stroke();
  ctx.textBaseline = 'alphabetic';
  if (window.kind === 'notepad') {
    drawNotepadBody(ctx, model, window, focused);
  } else if (window.kind === 'browser') {
    drawBrowserBody(ctx, model, window, focused);
  } else if (window.kind === 'game') {
    drawGameBody(ctx, model, window);
  } else {
    drawPaintBody(ctx, model, window);
  }
  ctx.restore();
  ctx.strokeStyle = focused ? COLORS.accent : COLORS.border;
  ctx.lineWidth = 2 * s;
  roundRect(ctx, rect, 12 * s);
  ctx.stroke();
}

function drawTaskbar(ctx: CanvasRenderingContext2D, model: DesktopModel): void {
  const s = scaleOf(model.width);
  const bar = TASKBAR_HEIGHT * s;
  ctx.fillStyle = COLORS.taskbar;
  ctx.fillRect(0, model.height - bar, model.width, bar);
  ctx.fillStyle = COLORS.white;
  ctx.font = `${22 * s}px ${UI_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('가상 데스크톱', 20 * s, model.height - bar / 2);
  for (const entry of model.taskbarEntries()) {
    const focused = model.focusedWindow?.id === entry.id;
    ctx.fillStyle = focused ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
    roundRect(ctx, entry.rect, 8 * s);
    ctx.fill();
    ctx.fillStyle = COLORS.white;
    ctx.font = `${20 * s}px ${UI_FONT}`;
    ctx.save();
    ctx.beginPath();
    ctx.rect(entry.rect.x, entry.rect.y, entry.rect.width, entry.rect.height);
    ctx.clip();
    ctx.fillText(entry.title, entry.rect.x + 14 * s, entry.rect.y + entry.rect.height / 2);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `${20 * s}px ${UI_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${model.width}×${model.height}`, model.width - 20 * s, model.height - bar / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawMenu(ctx: CanvasRenderingContext2D, model: DesktopModel): void {
  const box = model.menuRect();
  if (!box) {
    return;
  }
  const s = scaleOf(model.width);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 16 * s;
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, box, 10 * s);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1.5 * s;
  roundRect(ctx, box, 10 * s);
  ctx.stroke();
  ctx.fillStyle = COLORS.text;
  ctx.font = `${24 * s}px ${UI_FONT}`;
  ctx.textBaseline = 'middle';
  for (const item of model.menuItemRects()) {
    ctx.fillText(item.label, item.rect.x + 24 * s, item.rect.y + item.rect.height / 2);
  }
  ctx.textBaseline = 'alphabetic';
}

function drawDialog(ctx: CanvasRenderingContext2D, model: DesktopModel): void {
  const dialog = model.dialog;
  if (!dialog) {
    return;
  }
  const s = scaleOf(model.width);
  ctx.fillStyle = COLORS.dim;
  ctx.fillRect(0, 0, model.width, model.height);
  const box = model.dialogRect();
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 24 * s;
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, box, 14 * s);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 ${28 * s}px ${UI_FONT}`;
  ctx.textBaseline = 'top';
  const title = dialog.kind === 'save' ? '저장' : dialog.kind === 'run' ? '실행' : '안내';
  ctx.fillText(title, box.x + 32 * s, box.y + 28 * s);
  ctx.font = `${24 * s}px ${UI_FONT}`;
  if (dialog.kind === 'save') {
    ctx.fillText('파일 이름:', box.x + 32 * s, box.y + 88 * s);
    const field: Rect = { x: box.x + 160 * s, y: box.y + 78 * s, width: box.width - 192 * s, height: 48 * s };
    ctx.fillStyle = '#f6f8fb';
    roundRect(ctx, field, 8 * s);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = `${24 * s}px ${MONO_FONT}`;
    ctx.fillText(`${dialog.fileName}|`, field.x + 14 * s, field.y + 10 * s);
  } else if (dialog.kind === 'run') {
    ctx.fillText('열 프로그램 이름(notepad, mspaint):', box.x + 32 * s, box.y + 80 * s);
    const field: Rect = { x: box.x + 32 * s, y: box.y + 118 * s, width: box.width - 64 * s, height: 48 * s };
    ctx.fillStyle = '#f6f8fb';
    roundRect(ctx, field, 8 * s);
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = `${24 * s}px ${MONO_FONT}`;
    ctx.fillText(`${dialog.text}|`, field.x + 14 * s, field.y + 10 * s);
  } else {
    ctx.fillText(dialog.text, box.x + 32 * s, box.y + 90 * s);
  }
  for (const button of model.dialogButtons()) {
    ctx.fillStyle = button.id === 'ok' ? COLORS.accent : COLORS.white;
    roundRect(ctx, button.rect, 10 * s);
    ctx.fill();
    ctx.strokeStyle = button.id === 'ok' ? COLORS.accent : COLORS.border;
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.fillStyle = button.id === 'ok' ? COLORS.white : COLORS.text;
    ctx.font = `600 ${24 * s}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.label, button.rect.x + button.rect.width / 2, button.rect.y + button.rect.height / 2);
    ctx.textAlign = 'left';
  }
  ctx.textBaseline = 'alphabetic';
}

function drawTrail(ctx: CanvasRenderingContext2D, points: readonly Point[], scale: number): void {
  if (points.length === 0) {
    return;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = COLORS.trail;
  ctx.fillStyle = COLORS.trail;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x * scale;
    const y = point.y * scale;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  // 스크립트가 커서를 둔 자리마다 점
  const step = Math.max(1, Math.floor(points.length / 400));
  for (let index = 0; index < points.length; index += step) {
    const point = points[index]!;
    ctx.beginPath();
    ctx.arc(point.x * scale, point.y * scale, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawClickMarks(ctx: CanvasRenderingContext2D, marks: readonly ClickMark[], scale: number, now: number, reducedMotion: boolean): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const mark of marks) {
    const age = now - mark.at;
    if (age < 0 || age > CLICK_MARK_MS) {
      continue;
    }
    const progress = reducedMotion ? 0.5 : age / CLICK_MARK_MS;
    const radius = 8 + progress * 22;
    ctx.globalAlpha = reducedMotion ? 0.8 : 1 - progress;
    ctx.strokeStyle = mark.button === 'right' ? '#e0730a' : mark.button === 'middle' ? '#3b9360' : COLORS.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mark.x * scale, mark.y * scale, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 화살표 커서(표시 픽셀 기준 약 22px). 버튼을 누른 채면 채운 색이 진해진다. */
export function drawCursor(ctx: CanvasRenderingContext2D, point: Point, scale: number, pressed: boolean, running: boolean): void {
  const x = point.x * scale;
  const y = point.y * scale;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(x, y);
  const k = 1.35;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 16 * k);
  ctx.lineTo(4 * k, 12.5 * k);
  ctx.lineTo(7 * k, 18.5 * k);
  ctx.lineTo(9.2 * k, 17.5 * k);
  ctx.lineTo(6.3 * k, 11.5 * k);
  ctx.lineTo(11 * k, 11.5 * k);
  ctx.closePath();
  ctx.fillStyle = pressed ? '#1f5bd6' : running ? '#ffffff' : '#f6f8fb';
  ctx.strokeStyle = '#17191c';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** 모델 전체를 캔버스에 그린다. 캔버스 크기는 부르는 쪽이 맞춰 둔다(index.ts). */
export function drawDesktop(ctx: CanvasRenderingContext2D, model: DesktopModel, options: DrawOptions): void {
  const { scale } = options;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawWallpaper(ctx, model);
  drawIcons(ctx, model);
  model.windows.forEach((window, index) => {
    drawWindow(ctx, model, window, index === model.windows.length - 1);
  });
  if (model.selection) {
    ctx.fillStyle = COLORS.selection;
    ctx.fillRect(model.selection.x, model.selection.y, model.selection.width, model.selection.height);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2 * scaleOf(model.width);
    ctx.setLineDash([8 * scaleOf(model.width), 6 * scaleOf(model.width)]);
    ctx.strokeRect(model.selection.x, model.selection.y, model.selection.width, model.selection.height);
    ctx.setLineDash([]);
  }
  drawTaskbar(ctx, model);
  drawMenu(ctx, model);
  drawDialog(ctx, model);
  if (options.showTrail) {
    drawTrail(ctx, model.trail, scale);
  }
  drawClickMarks(ctx, options.clickMarks, scale, options.now, options.reducedMotion);
  if (options.showCursor !== false) {
    drawCursor(ctx, options.cursorAt ?? model.cursor, scale, model.pressed !== null, options.running);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** 클릭 표시 가운데 아직 보이는 것만 남긴다. */
export function pruneClickMarks(marks: readonly ClickMark[], now: number): ClickMark[] {
  return marks.filter((mark) => now - mark.at <= CLICK_MARK_MS);
}
