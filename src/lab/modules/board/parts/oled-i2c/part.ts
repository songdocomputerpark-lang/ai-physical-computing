/**
 * 부품: OLED 128×64(I2C, 주소 0x3C) — 바깥 출력 부품(PLAN §6.2 "OLED 128×64 | 2-1-3 (f054~f058)", §6.1 "OLED 이름", §8.3 P3-04, 원고 132~137쪽).
 * 부품 id oled-i2c는 README 7.5의 제안 id 그대로다.
 *
 * 핀: sda·scl — 기본 GPIO21·22(원고 133쪽 "SDA(21번 핀)·SCL(22번 핀)"). 방향은 문자 LCD와 같은 까닭으로 'out'(보드가 선을 내보냄).
 * 화면: 파이썬 부품 흉내(apc_part_oled_i2c.py — SSD1306 호환 명령·그림 바이트 해석)가 보낸 'board.device' 상태를 oled-screen.ts로 읽어
 * 128×64 점을 그린다(켜진 점을 줄마다 이어진 조각 하나의 <path>로 — 점 8192개를 요소로 만들지 않는다). 대비(contrast)는 점의 밝기, 화면 꺼짐(poweroff)은 검은 화면.
 * 보드가 멈췄으면(전원 없음) 검은 화면이고, 실행을 시작했는데 상태가 아직 없으면 전원 직후 모습(화면 꺼짐)이다.
 * 모습 값(data-visual-*): lit(화면 켜짐), brightness(대비 0~100), pixels(켜진 점 수), text(드라이버가 text()로 쓴 글자 — " | "로 이음), frame(받은 상태 순서 번호).
 * 화면 낭독기: 보드 화면(view.ts)이 붙이는 이름("OLED(128×64)(GPIO21·GPIO22): 켜짐 — 설명") 뒤에 부품 요소의 <desc>로 글자·켜진 점 수를 설명한다.
 * 그림: 사이트가 직접 그린 브랜드 중립 1.3인치 OLED 모듈(파란 기판·검은 화면·흰 점 — 원고 136쪽 키트 사진의 색).
 */
import type { PartDefinition } from '../../part-types.ts';
import { isLive } from '../../state.ts';
import { OLED_HEIGHT, OLED_WIDTH, countLit, oledBrightness, oledPixels, oledSummary, oledText, parseOledState, pixelPath, type OledScreen } from './oled-screen.ts';

const WIDTH = 216;
const HEIGHT = 136;
const SCALE = 1.5;
const GLASS_X = 12;
const GLASS_Y = 22;
const GLASS_WIDTH = OLED_WIDTH * SCALE;
const GLASS_HEIGHT = OLED_HEIGHT * SCALE;

const COLORS = Object.freeze({
  board: '#1e3a8a',
  boardStroke: '#172554',
  bezel: '#0b1220',
  glass: '#030712',
  pixel: '#e0f2fe',
});

interface Picture {
  readonly screen: OledScreen | null;
  readonly pixels: Uint8Array;
  readonly lit: number;
}

const DARK: Picture = Object.freeze({ screen: null, pixels: new Uint8Array(OLED_WIDTH * OLED_HEIGHT), lit: 0 });
const POWER_ON: Picture = Object.freeze({ ...DARK });
/** 같은 상태 객체를 여러 번 그리지 않게(board.state가 올 때마다 visual이 다시 불린다) */
const pictures = new WeakMap<object, Picture>();

/** 보이는 모습: 멈췄으면 전원 없음, 실행 중인데 상태가 없거나 틀리면 전원 직후(화면 꺼짐) */
function pictureOf(live: boolean, state: unknown): Picture {
  if (!live) {
    return DARK;
  }
  if (!state || typeof state !== 'object') {
    return POWER_ON;
  }
  const cached = pictures.get(state);
  if (cached) {
    return cached;
  }
  const screen = parseOledState(state);
  const pixels = oledPixels(screen);
  const picture: Picture = { screen, pixels, lit: countLit(pixels) };
  pictures.set(state, picture);
  return picture;
}

const definition: PartDefinition = {
  id: 'oled-i2c',
  title: 'OLED(128×64)',
  description: 'I2C(주소 0x3C)로 그림 점을 받아 128×64칸에 보여 주는 OLED 화면이에요.',
  pins: [
    { role: 'sda', label: 'SDA', direction: 'out' },
    { role: 'scl', label: 'SCL', direction: 'out' },
  ],
  defaultPins: { sda: 21, scl: 22 },
  size: { width: WIDTH, height: HEIGHT },
  python: 'apc_part_oled_i2c',
  visual({ snapshot, device }) {
    const picture = pictureOf(isLive(snapshot), device?.state);
    const on = picture.screen?.on === true;
    return {
      lit: on,
      brightness: on ? oledBrightness(picture.screen) : 0,
      pixels: picture.lit,
      text: oledText(picture.screen),
      frame: device?.seq ?? 0,
    };
  },
  render(target, { svg, instance }) {
    const pinMarks = ['sda', 'scl'].map((role, index) =>
      svg('rect', { x: 5 + index * 18, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8, 'data-role': role }),
    );
    const board = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: COLORS.board, stroke: COLORS.boardStroke, 'stroke-width': 1.2 });
    const pinLabel = svg('text', { x: 41, y: 13, class: 'board-part__label board-part__label--small' }, [`SDA IO${instance.pins.sda ?? ''} · SCL IO${instance.pins.scl ?? ''}`]);
    // Pretendard는 숫자 사이의 x를 곱하기 기호(×)로 바꿔 그려 "0x3C"가 "0×3C"로 보인다 — 합자·문맥 대체를 끈다(2026-09-18 Edge에서 확인)
    const title = svg('text', { x: WIDTH - 6, y: 13, 'text-anchor': 'end', class: 'board-part__title', style: 'font-variant-ligatures: none;' }, ['OLED 0x3C']);
    const bezel = svg('rect', { x: GLASS_X - 3, y: GLASS_Y - 3, width: GLASS_WIDTH + 6, height: GLASS_HEIGHT + 6, rx: 3, fill: COLORS.bezel });
    const glass = svg('rect', { x: GLASS_X, y: GLASS_Y, width: GLASS_WIDTH, height: GLASS_HEIGHT, fill: COLORS.glass });
    const path = svg('path', { d: '', fill: COLORS.pixel, 'shape-rendering': 'crispEdges', 'data-oled-pixels': '' });
    const layer = svg('g', { transform: `translate(${GLASS_X} ${GLASS_Y}) scale(${SCALE})`, 'aria-hidden': 'true' }, [path]);
    const state = svg('text', { x: WIDTH / 2, y: HEIGHT - 6, 'text-anchor': 'middle', class: 'board-part__state' }, ['전원 꺼짐']);
    target.append(board, ...pinMarks, pinLabel, title, bezel, glass, layer, state);

    let desc: SVGDescElement | null = null;
    let lastPath = '';
    const describe = (text: string) => {
      // 부품 요소(view.ts가 만든 role="img" <g>)의 <desc>가 화면 낭독기의 설명이 된다(SVG-AAM)
      const root = target.closest('[data-board-part]');
      if (!root) {
        return;
      }
      if (!desc || desc.parentNode !== root) {
        desc = svg('desc', { 'data-part-desc': '' });
        root.insertBefore(desc, root.firstChild);
      }
      if (desc.textContent !== text) {
        desc.textContent = text;
      }
    };

    return (_visual, extra) => {
      const live = isLive(extra.snapshot);
      const picture = pictureOf(live, extra.device?.state);
      const d = pixelPath(picture.pixels);
      if (d !== lastPath) {
        path.setAttribute('d', d);
        lastPath = d;
      }
      // 대비 0 → 흐리게(0.35), 255 → 또렷하게(1)
      const contrast = picture.screen ? picture.screen.contrast : 0;
      path.setAttribute('opacity', (0.35 + 0.65 * (contrast / 255)).toFixed(3));
      if (!live) {
        state.textContent = '전원 꺼짐';
      } else if (picture.screen?.on) {
        state.textContent = `화면 켜짐 · 켜진 점 ${picture.lit}개`;
      } else {
        state.textContent = '화면 꺼짐';
      }
      describe(`OLED 화면: ${live ? oledSummary(picture.screen, picture.lit) : '전원이 꺼져 있어요.'}`);
    };
  },
};

export default definition;
