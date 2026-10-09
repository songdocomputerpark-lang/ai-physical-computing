/**
 * 사이트 공용 선 아이콘의 모양 표(판 1.3.0 — 설계서 2절). Icon.astro가 이 표를 읽어 그린다.
 *
 * 24×24 격자, 선 굵기 2, 둥근 끝(Icon.astro가 stroke="currentColor"로 그린다). 전부 직접 그린 모양이고 래스터 이미지는 없다.
 * 한 아이콘은 조각(IconPart) 여러 개다.
 *   - 글자(string)  : 선으로만 그리는 path의 d 값
 *   - { solid }     : 글자 색으로 채우는 조각(재생 ▶·정지 ■ 같은 꽉 찬 모양. 둥근 모서리는 선이 맡는다)
 * 이름을 더하면 ICON_NAMES·ICONS 둘 다 고친다(tests/unit/icons.test.ts가 짝이 맞는지 본다).
 */

/** 소수점 잡음을 없애 d 값을 짧게 */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** 모서리가 둥근 사각형의 d 값 */
function rr(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(h - 2 * r)}` +
    `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}h${n(-(w - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}` +
    `v${n(-(h - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}z`
  );
}

/** 원의 d 값 */
function circle(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0 ${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0z`;
}

/** 점 하나(길이 0짜리 선 — 둥근 끝이 점이 된다) */
function dot(x: number, y: number): string {
  return `M${n(x)} ${n(y)}h.01`;
}

/** 아이콘 조각: 글자는 선으로 그리는 path d, { solid }는 글자 색으로 채우는 path d */
export type IconPart = string | { readonly solid: string };

/** 이름 목록 — 설계서 2절의 이름 그대로이고, 뒤쪽 몇 개는 다른 구역이 쓰라고 더한 것이다. */
export const ICON_NAMES = [
  'home',
  'search',
  'flag',
  'book',
  'flask',
  'teacher',
  'lifebuoy',
  'glossary',
  'camera',
  'chip',
  'plug',
  'signal',
  'bluetooth',
  'wifi',
  'grid',
  'alert',
  'check',
  'check-circle',
  'circle',
  'arrow-right',
  'arrow-left',
  'chevron-right',
  'chevron-down',
  'menu',
  'close',
  'play',
  'stop',
  'clock',
  'settings',
  'external',
  'lightbulb',
  'map',
  'monitor',
  'sparkles',
  'list',
  'eye',
  // 더한 것
  'chevron-left',
  'chevron-up',
  'info',
  'code',
  'presentation',
  'browser',
  'unlock',
  'pause',
  'replay',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const ICONS: Readonly<Record<IconName, readonly IconPart[]>> = {
  // 집
  home: ['M3 11.5 12 4l9 7.5', 'M5.5 10v9.5a1 1 0 0 0 1 1H10v-5.5h4v5.5h3.5a1 1 0 0 0 1-1V10'],
  // 돋보기
  search: [circle(11, 11, 6.5), 'M16 16l4.5 4.5'],
  // 깃발(시작하기)
  flag: ['M5 21V4', 'M5 4.5h12.5L15 8.5l2.5 4H5'],
  // 펼친 책(배우기)
  book: ['M12 6.8C9.8 5.2 6.8 4.7 3.5 5.2v13c3.3-.5 6.3 0 8.5 1.6 2.2-1.6 5.2-2.1 8.5-1.6v-13c-3.3-.5-6.3 0-8.5 1.6z', 'M12 6.8v13'],
  // 플라스크(실습실)
  flask: ['M9 3h6M10 3v6.3l-5.3 9A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.5-2.7L14 9.3V3', 'M7.3 15.5h9.4'],
  // 학사모(교사용)
  teacher: ['M2 9.5 12 5l10 4.5-10 4.5z', 'M6 11.7V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.3', 'M22 9.5V14'],
  // 구명 튜브(문제 해결)
  lifebuoy: [
    circle(12, 12, 9),
    circle(12, 12, 3.5),
    'M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9',
  ],
  // 낱말 책(용어사전): 겉표지 + 책등 + 가운데 A
  glossary: [
    'M6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z',
    'M9 3v18',
    'M12.5 15l2.5-6.5 2.5 6.5M13.4 13h3.2',
  ],
  // 카메라
  camera: [
    'M3 9a2 2 0 0 1 2-2h2.2l1.5-2.2A1.8 1.8 0 0 1 10.2 4h3.6a1.8 1.8 0 0 1 1.5.8L16.8 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    circle(12, 13, 3.5),
  ],
  // ESP32 보드(칩)
  chip: [rr(6.5, 6.5, 11, 11, 2), 'M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21', { solid: circle(12, 12, 1) }],
  // USB 꽂개
  plug: ['M9 2.5v4M15 2.5v4', rr(6, 6.5, 12, 7.5, 2), 'M12 14v2.5A4.5 4.5 0 0 1 7.5 21H6'],
  // 통신(퍼지는 전파)
  signal: [
    { solid: circle(12, 12, 0.5) },
    'M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7',
    'M5.7 5.7a9 9 0 0 0 0 12.6M18.3 5.7a9 9 0 0 1 0 12.6',
  ],
  // 블루투스
  bluetooth: ['M7 7l10 10-5 4.5V2.5L17 7 7 17'],
  // 와이파이
  wifi: ['M2.5 9.5a14 14 0 0 1 19 0', 'M5.5 13a9.5 9.5 0 0 1 13 0', 'M8.7 16.3a5 5 0 0 1 6.6 0', dot(12, 19.5)],
  // 갤러리(네 칸)
  grid: [rr(4, 4, 7, 7, 1.5), rr(13, 4, 7, 7, 1.5), rr(4, 13, 7, 7, 1.5), rr(13, 13, 7, 7, 1.5)],
  // 경고(세모 + 느낌표)
  alert: ['M10.3 4.4 2.9 17.4A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3.1L13.7 4.4a2 2 0 0 0-3.4 0z', 'M12 9.5v4.5', dot(12, 17.3)],
  // 확인 표시
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  'check-circle': [circle(12, 12, 9), 'M8 12.3l2.8 2.8 5.4-5.6'],
  circle: [circle(12, 12, 9)],
  'arrow-right': ['M5 12h14M13 6l6 6-6 6'],
  'arrow-left': ['M19 12H5M11 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  // 메뉴(세 줄)·닫기(×)
  menu: ['M4 6.5h16M4 12h16M4 17.5h16'],
  close: ['M6 6l12 12M18 6L6 18'],
  // 재생 ▶·정지 ■
  play: [{ solid: 'M8.5 5.8v12.4a.6.6 0 0 0 .9.5l10-6.2a.6.6 0 0 0 0-1l-10-6.2a.6.6 0 0 0-.9.5z' }],
  stop: [{ solid: rr(6.5, 6.5, 11, 11, 1.5) }],
  clock: [circle(12, 12, 9), 'M12 7v5l3.5 2'],
  // 설정(조절 막대 세 줄)
  settings: [
    'M4 7h9M17 7h3',
    circle(15, 7, 2),
    'M4 12h3M11 12h9',
    circle(9, 12, 2),
    'M4 17h11M19 17h1',
    circle(17, 17, 2),
  ],
  // 새 창으로 열기
  external: ['M14 4h6v6M20 4l-9 9', 'M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10'],
  // 전구(알아두면 좋은 것)
  lightbulb: ['M9 18h6M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'],
  // 접은 지도(배움 지도)
  map: ['M9 4 3.5 6.5V20L9 17.5l6 2.5 5.5-2.5V4L15 6.5z', 'M9 4v13.5M15 6.5V20'],
  // 화면(모니터)
  monitor: [rr(3, 4, 18, 12, 2), 'M9 20h6M12 16v4'],
  // 반짝임
  sparkles: ['M10 4l1.8 5.2L17 11l-5.2 1.8L10 18l-1.8-5.2L3 11l5.2-1.8z', 'M18 3.5v4M16 5.5h4', 'M18.5 15.5v4M16.5 17.5h4'],
  // 목록
  list: ['M9 6.5h11M9 12h11M9 17.5h11', dot(4.5, 6.5), dot(4.5, 12), dot(4.5, 17.5)],
  // 눈(봤어요)
  eye: ['M2.5 12C4.5 8 8 5.5 12 5.5s7.5 2.5 9.5 6.5c-2 4-5.5 6.5-9.5 6.5S4.5 16 2.5 12z', circle(12, 12, 3)],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  info: [circle(12, 12, 9), 'M12 11v5.5', dot(12, 7.8)],
  code: ['M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5'],
  // 발표 화면
  presentation: [rr(3, 4, 18, 12, 1.5), 'M12 16v3M8.5 21l3.5-2 3.5 2M7 12.5l3-3 2.5 2.5L17 7.5'],
  // 브라우저 창(설치 없이)
  browser: [rr(3, 4, 18, 16, 2), 'M3 8.5h18M8.5 14.5l2.3 2.3 4.7-4.8'],
  // 열린 자물쇠(가입 없이)
  unlock: [rr(5, 11, 14, 10, 2), 'M8.5 11V7.5a3.5 3.5 0 0 1 6.8-1.2M12 15v2'],
  pause: ['M9 6.5v11M15 6.5v11'],
  replay: ['M4.5 12a7.5 7.5 0 1 0 2.2-5.3', 'M4.5 4.5v4h4'],
};

/** 이름이 아이콘 표에 있는지(타입을 믿을 수 없는 입력 확인용) */
export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && (ICON_NAMES as readonly string[]).includes(value);
}
