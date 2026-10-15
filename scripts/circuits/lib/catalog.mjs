// 회로 구성 도구(https://circuit.gorillacell.kr/ — 키트 업체 "Brixel-Circuit Config")의 보드·부품 표.
// 우리 쪽 부품 이름(차시 frontmatter `parts`와 같은 이름)을 도구의 부품 id·핀 id·그림 크기로 옮기는 데 쓴다.
// 근거는 2026-10-15에 도구 화면과 번들 코드를 읽어 적은 것이다(.cache/v140/notes/a4-circuit.md) — 도구가 바뀌면 이 파일만 고친다.
//
// 도구의 약속(읽은 것)
// - `.circuit` 파일 = { version, savedAt, components: [{ id, partId, x, y, rotation }], wires: [{ id, fromCompId, fromPin, toCompId, toPin, color }] }.
//   (x, y)는 부품 **가운데** 좌표(캔버스 좌표, 확대 100%일 때 왼쪽 위가 0, 0). 부품 id는 소문자-하이픈(`board-003`, `dis-001`).
// - 보드 핀 id = `ESP-<구역>-<열>-<행>` (구역 L·C·R, 열 L0~L9·C0~C7·R0~R5, 행 S·S2·S3 신호, G 접지, V 전원).
// - 일반 모듈의 핀은 그림 오른쪽 가장자리에 위에서 아래로 G, V, S, S2, S3 … 순서로 있다(핀 id `<부품 id>-G` 등). 예외: I2C LCD는 왼쪽 가장자리,
//   MP3 플레이어는 오른쪽 G·V·S(TX)·S2(RX)에 더해 스피커 연결단 `-BOT-G`·`-BOT-V`가 그림 아래 왼쪽에 있다.
// - 부품 그림 크기: 보통 높이 150, 너비는 그림 비율(`width`가 정해진 부품은 그 너비). 보드 너비는 480.

/** 도구에서 쓰는 보드: ESP32 실드 V3(선을 이을 수 있는 키트용 보드). */
export const BOARD = Object.freeze({
  toolId: 'board-003',
  name: 'ESP32 실드 V3',
  width: 480,
  imageWidth: 949,
  imageHeight: 597,
});

/** 보드 높이(도구가 그림 비율대로 정한다). */
export function boardHeight() {
  return (BOARD.width * BOARD.imageHeight) / BOARD.imageWidth;
}

/**
 * 실드 V3의 신호 핀 표: [GPIO 번호, 열, 행]. 도구의 `ph["board-003"]` 배열(곁가지 HSPI·VSPI 열은 뺌)을 그대로 옮겼다.
 * 열마다 행 S·S2(·S3)가 한 3핀 헤더 줄이다. GPIO 0·2는 실드에 나오지 않는다(보드 위 부품 전용).
 */
export const BOARD_PINS = Object.freeze([
  [4, 'L0', 'S'], [5, 'L1', 'S'], [12, 'L2', 'S'], [13, 'L3', 'S'], [14, 'L4', 'S'],
  [15, 'L5', 'S'], [16, 'L6', 'S'], [17, 'L7', 'S'], [18, 'L8', 'S'], [19, 'L9', 'S'],
  [5, 'L0', 'S2'], [12, 'L1', 'S2'], [13, 'L2', 'S2'], [14, 'L3', 'S2'], [15, 'L4', 'S2'],
  [16, 'L5', 'S2'], [17, 'L6', 'S2'], [18, 'L7', 'S2'], [19, 'L8', 'S2'], [21, 'L9', 'S2'],
  [21, 'C0', 'S'], [21, 'C1', 'S'], [21, 'C2', 'S'], [22, 'C3', 'S'], [23, 'C4', 'S'],
  [25, 'C5', 'S'], [26, 'C6', 'S'], [27, 'C7', 'S'],
  [22, 'C0', 'S2'], [22, 'C1', 'S2'], [22, 'C2', 'S2'], [21, 'C3', 'S2'], [25, 'C4', 'S2'],
  [26, 'C5', 'S2'], [27, 'C6', 'S2'], [32, 'C7', 'S2'],
  [26, 'C4', 'S3'], [27, 'C5', 'S3'], [32, 'C6', 'S3'], [33, 'C7', 'S3'],
  [32, 'R0', 'S'], [33, 'R1', 'S'], [34, 'R2', 'S'], [35, 'R3', 'S'], [36, 'R4', 'S'], [39, 'R5', 'S'],
  [33, 'R0', 'S2'], [34, 'R1', 'S2'], [35, 'R2', 'S2'], [36, 'R3', 'S2'], [39, 'R4', 'S2'], [36, 'R5', 'S2'],
  [34, 'R0', 'S3'], [35, 'R1', 'S3'], [36, 'R2', 'S3'], [39, 'R3', 'S3'],
]);

/** 열 이름 → 보드 핀 id의 앞부분(예: 'C7' → 'ESP-C-C7'). */
export function columnPrefix(column) {
  return `ESP-${column[0]}-${column}`;
}

/** 열의 가운데 x 위치(보드 너비에 대한 비율) — 도구의 `lg()`가 점을 놓는 식과 같다. */
export function columnFraction(column) {
  const index = Number(column.slice(1));
  const cStart = 0.125 + 10 * 0.029 + 0.029 * 1.45;
  const rStart = cStart + 8.3 * 0.029 + 0.029;
  if (column[0] === 'L') {
    return 0.125 + index * 0.029;
  }
  if (column[0] === 'C') {
    return cStart + index * 0.029;
  }
  return rStart + index * 0.029;
}

/** 열 목록(왼쪽부터). */
export const COLUMNS = Object.freeze([
  ...Array.from({ length: 10 }, (_, i) => `L${i}`),
  ...Array.from({ length: 8 }, (_, i) => `C${i}`),
  ...Array.from({ length: 6 }, (_, i) => `R${i}`),
]);

/**
 * 우리 부품 이름 → 도구 부품.
 * - roles: 신호 핀의 이름(차시 `parts.pins`의 글자)을 도구 핀 행(S·S2·S3)에 대응시킨다.
 * - prefer: 한 열에 그대로 꽂을 수 있을 때 먼저 볼 열(전원 구역 — 보드 그림의 3.3V·5V 표시를 따름, 실물 확인 전).
 * - pinSide: 'left'면 핀이 그림 왼쪽 가장자리(I2C LCD만).
 * - pinCount: 핀 수(위에서 아래로 G, V, S, S2 …).
 */
export const PARTS = Object.freeze({
  'lcd-i2c': { toolId: 'dis-001', label: 'I2C 1602 LCD', imageWidth: 958, imageHeight: 433, width: 380, pinCount: 4, roles: { sda: 'S', scl: 'S2' }, prefer: ['C1', 'C2', 'C0'], pinSide: 'left' },
  'oled-i2c': { toolId: 'dis-012', label: 'OLED 1.3인치(SH1106)', imageWidth: 794, imageHeight: 533, pinCount: 4, roles: { sda: 'S', scl: 'S2' }, prefer: ['C0', 'C1', 'C2'] },
  'touch-digital': { toolId: 'd-022', label: '터치 센서', imageWidth: 584, imageHeight: 591, pinCount: 3, roles: { pin: 'S' }, prefer: ['L7'] },
  'touch-analog-4ch': { toolId: 'a-022', label: '아날로그 터치 센서(4채널)', imageWidth: 792, imageHeight: 525, pinCount: 3, roles: { pin: 'S' }, prefer: ['R0'] },
  'rgb-led': { toolId: 'dis-002', label: 'RGB LED', imageWidth: 593, imageHeight: 596, pinCount: 5, roles: { r: 'S', g: 'S2', b: 'S3' }, prefer: ['C7', 'C5'] },
  laser: { toolId: 'dis-009', label: '레이저(180도)', imageWidth: 1116, imageHeight: 1125, pinCount: 3, roles: { pin: 'S' }, prefer: ['L8', 'C1'] },
  neopixel: { toolId: 'dis-013', label: '네오픽셀 링', imageWidth: 872, imageHeight: 874, pinCount: 3, roles: { pin: 'S' }, prefer: ['C4'] },
  buzzer: { toolId: 'o-001', label: '부저', imageWidth: 592, imageHeight: 594, pinCount: 3, roles: { pin: 'S' }, prefer: ['L5'] },
  // MP3 플레이어: S는 모듈의 TX(보드 RX로 감), S2는 모듈의 RX(보드 TX에서 옴). 스피커(o-003)는 그림에서 함께 그린다.
  mp3: { toolId: 'o-002', label: 'MP3 플레이어(KT403A)', imageWidth: 789, imageHeight: 528, pinCount: 4, roles: { module_tx: 'S', module_rx: 'S2' }, prefer: ['L6'], companion: 'speaker' },
  'fan-motor': { toolId: 'm-002', label: '팬 모터(L9110)', imageWidth: 929, imageHeight: 529, pinCount: 4, roles: { ina: 'S', inb: 'S2' }, prefer: ['C5'] },
  servo: { toolId: 'm-006', label: 'MG90S 서보', imageWidth: 666, imageHeight: 417, pinCount: 3, roles: { pin: 'S' }, prefer: ['C5', 'C6'] },
  // USB-UART 변환기: 변환기 TX는 보드 RX 핀으로, 변환기 RX는 보드 TX 핀으로 가야 한다(서로 엇갈림). 전원(VCC)은 따로 USB라 잇지 않는다.
  'uart-converter': { toolId: 'c-007', label: 'USB-UART 컨버터', imageWidth: 586, imageHeight: 593, pinCount: 4, roles: { converter_tx: 'S', converter_rx: 'S2' }, prefer: ['L6', 'L7'], noPower: true },
  'vibration-motor': { toolId: 'm-001', label: '진동 모터', imageWidth: 597, imageHeight: 596, pinCount: 3, roles: { pin: 'S' }, prefer: ['L9'] },
});

/** 곁들이는 부품(그림에만 놓고 모듈에 잇는다): MP3 스피커. */
export const COMPANIONS = Object.freeze({
  speaker: { toolId: 'o-003', label: 'MP3 스피커', imageWidth: 238, imageHeight: 203, pinCount: 2 },
});

/** 부품 그림 크기(도구의 `za()`와 같은 규칙: 높이 150, 너비는 그림 비율, 너비가 정해진 부품은 그 너비). */
export function partSize(def) {
  const aspect = def.imageWidth / def.imageHeight;
  if (def.width) {
    return { width: def.width, height: def.width / aspect };
  }
  return { width: 150 * aspect, height: 150 };
}
