/**
 * 합성 손 좌표 시퀀스 생성기(PLAN §8.2 P2-08, PD-30 "카메라 없는 PC와 테스트용으로 합성 랜드마크 재생 입력").
 *
 * 사람 손을 찍은 데이터가 아니라 **코드가 계산한 21개 관절 좌표**다(손바닥 위치·크기·기울기와 손가락마다 접힘 정도 0~1로 정한다).
 * 좌표 모양은 MediaPipe 손 랜드마크와 같다: 21점, x·y는 사진 폭·높이 기준 0~1(왼쪽 위가 원점), z는 손목 기준 깊이(카메라 쪽이 음수).
 * 손 좌우 이름(handedness)은 레거시·Tasks가 모두 가정하는 "거울처럼 뒤집힌 셀카 영상" 기준이다 — 화면 오른쪽에 보이는 손이 'Right'.
 *
 * 같은 계산을 세 곳이 쓴다(한 곳만 고치면 셋이 함께 바뀐다):
 *   1. 재생 입력 소스(replay-source.ts): 실습실이 프레임에 뼈대를 그리고, 파이썬 process()에 이 좌표를 돌려준다.
 *   2. scripts/gen-landmarks.mjs: tests/fixtures/landmarks/hands.json을 만든다(단위 테스트·Node Pyodide 테스트가 읽는다).
 *   3. 단위 테스트: 픽스처가 이 코드와 같은지(어긋나면 스크립트를 다시 돌리라고 알린다), 접힌 손가락 판별(교안 f136 방식)이 뜻대로 나오는지.
 *
 * 시퀀스 4개(HAND_SEQUENCES 순서 = 화면 목록 순서): count(손가락 0~5개 펴기), pinch(엄지·검지 핀치), draw(검지로 그리기 — 시작 0.4초는 손 없음),
 * two-hands(두 손). 모두 15fps, 각 4~6초이고 끝과 처음이 이어져 되풀이해도 튀지 않는다. 난수를 쓰지 않아 늘 같은 값이 나온다.
 *
 * 이 파일은 DOM·다른 모듈에 기대지 않는다(Node.js가 타입만 지우고 그대로 실행한다 — enum·네임스페이스 금지).
 * 라이선스: 사이트 소프트웨어(MIT, PD-26). 21점 번호와 연결표는 MediaPipe 손 랜드마크 규격(Apache-2.0, apc_mediapipe.py 머리말 고지)을 따른다.
 */

/** 시퀀스 모양이 바뀌면 올린다(픽스처 JSON에 함께 적혀 어긋남을 알린다). */
export const SYNTHETIC_HANDS_VERSION = 1;

/** 재생 fps(카메라 프레임 제한 15fps와 같다 — 한 장에 한 좌표) */
export const SEQUENCE_FPS = 15;

/** 좌표를 이 자리까지 반올림한다(JSON 크기·비교 안정성) */
const DECIMALS = 4;

/** 손 모양을 정할 때 가정하는 사진 비율(4:3, 640×480). x 좌표는 이 비율로 줄여 화면에서 손이 찌그러지지 않게 한다. */
export const FRAME_ASPECT = 4 / 3;

export type HandLabel = 'Left' | 'Right';

export interface SyntheticHandedness {
  /** 레거시·Tasks 분류 번호: Left = 0, Right = 1 */
  readonly index: number;
  readonly score: number;
  readonly label: HandLabel;
}

export interface SyntheticHand {
  /** 21개 [x, y, z] */
  readonly landmarks: readonly (readonly [number, number, number])[];
  readonly handedness: SyntheticHandedness;
}

export interface SyntheticFrame {
  /** 이 장에서 보이는 손(없으면 빈 목록 → 파이썬 결과는 None) */
  readonly hands: readonly SyntheticHand[];
}

export interface HandSequence {
  readonly id: HandSequenceId;
  /** 화면 목록에 보이는 이름 */
  readonly label: string;
  /** 한 줄 설명(고1 눈높이) */
  readonly description: string;
  readonly fps: number;
  readonly frames: readonly SyntheticFrame[];
}

export const HAND_SEQUENCE_IDS = ['count', 'pinch', 'draw', 'two-hands'] as const;
export type HandSequenceId = (typeof HAND_SEQUENCE_IDS)[number];

export const HAND_SEQUENCE_INFO: Readonly<Record<HandSequenceId, { readonly label: string; readonly description: string; readonly seconds: number }>> = Object.freeze({
  count: { label: '손가락 0~5개 펴기', description: '주먹에서 시작해 검지·중지·약지·소지·엄지를 하나씩 펴요(1초마다).', seconds: 6 },
  pinch: { label: '엄지·검지 핀치', description: '엄지 끝과 검지 끝이 가까워졌다 멀어져요(거리 재기 예제용).', seconds: 4 },
  draw: { label: '검지로 그리기', description: '검지만 편 손이 8자 모양을 따라 움직여요. 시작 0.4초는 손이 없어요(선 끊김 확인용).', seconds: 6 },
  'two-hands': { label: '두 손', description: '왼손(Left)과 오른손(Right)이 함께 보이며 천천히 흔들려요.', seconds: 4 },
});

/** MediaPipe 손 연결표(21쌍) — mp.solutions.hands.HAND_CONNECTIONS와 같다. 뼈대 그리기와 테스트가 쓴다. */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = Object.freeze([
  [0, 1], [1, 2], [2, 3], [3, 4], // 엄지
  [0, 5], [5, 6], [6, 7], [7, 8], // 검지
  [5, 9], [9, 10], [10, 11], [11, 12], // 중지
  [9, 13], [13, 14], [14, 15], [15, 16], // 약지
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // 소지
]);

/** 손가락별 관절 번호(손목 0 제외). 손가락 순서: 엄지·검지·중지·약지·소지 */
export const FINGER_JOINTS: readonly (readonly [number, number, number, number])[] = Object.freeze([
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
]);

/** 손 한 개의 자세 */
export interface HandPose {
  /** 손목 위치(사진 기준 0~1) */
  readonly cx: number;
  readonly cy: number;
  /** 손 길이(사진 높이 기준, 손목→중지 끝이 약 1.15배) */
  readonly size: number;
  /** 기울기(도). 양수면 엄지 쪽으로 기운다 */
  readonly angle: number;
  readonly label: HandLabel;
  /** 손가락 접힘 정도 0(펼침)~1(주먹). 순서: 엄지·검지·중지·약지·소지 */
  readonly curls: readonly [number, number, number, number, number];
  /** 엄지 끝과 검지 끝을 맞대는 정도 0~1(1이면 거의 닿음). 검지·엄지 접힘보다 먼저 적용한다 */
  readonly pinch?: number;
  readonly score?: number;
}

type Vec = { x: number; y: number; z: number };

const DEG = Math.PI / 180;

/** 손바닥 뼈대(손 길이 1 기준, 손목 원점, y는 위쪽이 양수, 엄지 쪽이 +x) */
const PALM: Readonly<Record<number, readonly [number, number]>> = Object.freeze({
  0: [0, 0],
  1: [0.16, 0.16], // 엄지 CMC
  5: [0.19, 0.58], // 검지 MCP
  9: [0.05, 0.62], // 중지 MCP
  13: [-0.08, 0.59], // 약지 MCP
  17: [-0.2, 0.52], // 소지 MCP
});

/** 손가락 마디 길이(손 길이 1 기준): [첫 마디, 둘째 마디, 끝 마디] */
const FINGER_LENGTHS: readonly (readonly [number, number, number])[] = Object.freeze([
  [0.21, 0.15, 0.13], // 엄지(CMC→MCP→IP→TIP)
  [0.24, 0.14, 0.11], // 검지
  [0.26, 0.16, 0.12], // 중지
  [0.24, 0.15, 0.11], // 약지
  [0.19, 0.12, 0.1], // 소지
]);

/** 손가락이 뻗는 기본 방향(도, 위쪽 0, 엄지 쪽이 양수) */
const FINGER_BASE_ANGLE: readonly number[] = Object.freeze([55, 7, 0, -7, -15]);

/** 엄지 마디마다 접힐 때 손바닥을 가로질러 도는 각(도, 누적) */
const THUMB_FOLD: readonly [number, number, number] = Object.freeze([40, 45, 45]);

/** 손가락(엄지 제외) 마디마다 카메라 쪽으로 굽는 각(도): MCP·PIP·DIP */
const FINGER_FLEX: readonly [number, number, number] = Object.freeze([85, 100, 70]);

/** 깊이(z)는 굽은 마디가 카메라 쪽으로 나오는 만큼 음수. 이 배율로 줄여 x·y와 비슷한 크기로 둔다 */
const Z_SCALE = 0.5;

function round(value: number): number {
  const factor = 10 ** DECIMALS;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 0→1 부드러운 전환 */
export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 손 자세 → 21개 관절(사진 기준 0~1, z는 손목 기준). 손 길이 1의 손바닥 뼈대에 손가락을 붙이고, 접힘·핀치를 넣은 뒤
 * 기울기 → 좌우(왼손은 x 반전) → 크기·비율 → 손목 위치를 차례로 적용한다.
 */
export function handLandmarks(pose: HandPose): (readonly [number, number, number])[] {
  const points: Vec[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [index, [x, y]] of Object.entries(PALM)) {
    points[Number(index)] = { x, y, z: 0 };
  }
  // 손바닥은 손목보다 조금 카메라 쪽(살짝 음수)
  for (const index of [1, 5, 9, 13, 17]) {
    points[index]!.z = -0.02;
  }

  // 엄지: 손바닥을 가로질러 접힌다(평면 안 회전)
  {
    const curl = clamp01(pose.curls[0]);
    let cursor = { ...points[1]! };
    let accumulated = 0;
    const lengths = FINGER_LENGTHS[0]!;
    [2, 3, 4].forEach((joint, step) => {
      accumulated += THUMB_FOLD[step]!;
      const direction = (FINGER_BASE_ANGLE[0]! - curl * accumulated) * DEG;
      const length = lengths[step]!;
      cursor = { x: cursor.x + Math.sin(direction) * length, y: cursor.y + Math.cos(direction) * length, z: -0.03 - 0.02 * step - curl * 0.04 };
      points[joint] = cursor;
    });
  }

  // 네 손가락: 카메라 쪽으로 굽는다(보이는 길이가 줄고 끝이 손목 쪽으로 내려온다)
  for (let finger = 1; finger < 5; finger += 1) {
    const [mcp, pip, dip, tip] = FINGER_JOINTS[finger]!;
    const curl = clamp01(pose.curls[finger]!);
    const base = points[mcp]!;
    const direction = FINGER_BASE_ANGLE[finger]! * DEG;
    const axis = { x: Math.sin(direction), y: Math.cos(direction) };
    const lengths = FINGER_LENGTHS[finger]!;
    let along = 0;
    let depth = base.z;
    let bend = 0;
    [pip, dip, tip].forEach((joint, step) => {
      bend += curl * FINGER_FLEX[step]! * DEG;
      const length = lengths[step]!;
      along += Math.cos(bend) * length;
      depth += -Math.sin(bend) * length * Z_SCALE;
      points[joint] = { x: base.x + axis.x * along, y: base.y + axis.y * along, z: depth - 0.01 * (step + 1) };
    });
  }

  // 핀치: 엄지 끝과 검지 끝을 서로 당긴다(가운데 마디는 그 사이에 살짝 바깥으로 휘어 놓는다)
  if (pose.pinch !== undefined && pose.pinch > 0) {
    const pinch = clamp01(pose.pinch);
    const thumbTip = points[4]!;
    const indexTip = points[8]!;
    const middle = { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2, z: (thumbTip.z + indexTip.z) / 2 };
    const pull = pinch * 0.92;
    const newThumbTip = { x: lerp(thumbTip.x, middle.x, pull), y: lerp(thumbTip.y, middle.y, pull), z: lerp(thumbTip.z, middle.z, pull) };
    const newIndexTip = { x: lerp(indexTip.x, middle.x, pull), y: lerp(indexTip.y, middle.y, pull), z: lerp(indexTip.z, middle.z, pull) };
    placeBetween(points, 1, newThumbTip, [2, 3], [0.42, 0.72], 0.06 * pinch, +1);
    placeBetween(points, 5, newIndexTip, [6, 7], [0.45, 0.75], 0.06 * pinch, -1);
    points[4] = newThumbTip;
    points[8] = newIndexTip;
  }

  // 기울기(손목 기준 회전), 좌우, 크기·비율, 위치
  const rotation = pose.angle * DEG;
  const mirror = pose.label === 'Right' ? 1 : -1;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return points.map((point) => {
    const rx = point.x * cos - point.y * sin;
    const ry = point.x * sin + point.y * cos;
    const x = pose.cx + rx * mirror * pose.size / FRAME_ASPECT;
    const y = pose.cy - ry * pose.size;
    return [round(x), round(y), round(point.z * pose.size)] as const;
  });
}

/** 시작 관절과 새 끝점 사이에 가운데 관절들을 놓는다(fractions 위치, bulge만큼 옆으로 휘게). side는 휘는 방향(+1 엄지 쪽) */
function placeBetween(points: Vec[], startIndex: number, end: Vec, joints: readonly number[], fractions: readonly number[], bulge: number, side: 1 | -1): void {
  const start = points[startIndex]!;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: (-dy / length) * side, y: (dx / length) * side };
  joints.forEach((joint, step) => {
    const fraction = fractions[step]!;
    const swell = Math.sin(Math.PI * fraction) * bulge;
    points[joint] = { x: start.x + dx * fraction + normal.x * swell, y: start.y + dy * fraction + normal.y * swell, z: lerp(start.z, end.z, fraction) };
  });
}

/**
 * 접힌 손가락 판별 — 교안 f136(계단 9 "접혀있는 손가락 감지")과 같은 계산: 손가락 끝이 기준점(엄지는 소지 MCP 17, 나머지는 손목 0)에서
 * 그 손가락 MCP보다 멀면 펴진 것(true). 순서: 엄지·검지·중지·약지·소지.
 */
export function extendedFingers(landmarks: readonly (readonly [number, number, number])[]): [boolean, boolean, boolean, boolean, boolean] {
  const compare: readonly (readonly [number, number, number])[] = [
    [2, 4, 17],
    [5, 8, 0],
    [9, 12, 0],
    [13, 16, 0],
    [17, 20, 0],
  ];
  const squared = (a: readonly [number, number, number], b: readonly [number, number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  return compare.map(([mcp, tip, reference]) => squared(landmarks[reference]!, landmarks[tip]!) > squared(landmarks[reference]!, landmarks[mcp]!)) as [
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
  ];
}

/** 펴진 손가락 개수 */
export function countExtendedFingers(landmarks: readonly (readonly [number, number, number])[]): number {
  return extendedFingers(landmarks).filter(Boolean).length;
}

function hand(pose: HandPose): SyntheticHand {
  return {
    landmarks: handLandmarks(pose),
    handedness: { index: pose.label === 'Left' ? 0 : 1, score: round(pose.score ?? 0.97), label: pose.label },
  };
}

type FrameBuilder = (t: number, seconds: number) => SyntheticFrame;

const FIST: readonly [number, number, number, number, number] = [1, 1, 1, 1, 1];

/** count: 1초마다 손가락을 하나씩 편다(검지→중지→약지→소지→엄지), 전환은 0.3초 */
function countFrame(t: number, seconds: number): SyntheticFrame {
  const phaseSeconds = seconds / 6;
  const phase = Math.min(5, Math.floor(t / phaseSeconds));
  const into = t - phase * phaseSeconds;
  const blend = smoothstep(into / 0.3);
  const curlsFor = (count: number): number[] => {
    // 펴는 순서: 검지(1), 중지(2), 약지(3), 소지(4), 엄지(0)
    const order = [1, 2, 3, 4, 0];
    const curls = [...FIST];
    for (let index = 0; index < count; index += 1) {
      curls[order[index]!] = 0;
    }
    return curls;
  };
  const previous = curlsFor(Math.max(0, phase - 1));
  const target = curlsFor(phase);
  const curls = target.map((value, index) => (phase === 0 ? value : lerp(previous[index]!, value, blend))) as unknown as [number, number, number, number, number];
  return {
    hands: [
      hand({
        cx: 0.5 + 0.03 * Math.sin((2 * Math.PI * t) / seconds),
        cy: 0.74 + 0.02 * Math.sin((4 * Math.PI * t) / seconds),
        size: 0.36,
        angle: 6 * Math.sin((2 * Math.PI * t) / (seconds / 2)),
        label: 'Right',
        curls,
      }),
    ],
  };
}

/** pinch: 엄지·검지만 펴고 두 끝이 2초에 한 번 닿는다 */
function pinchFrame(t: number, seconds: number): SyntheticFrame {
  const period = seconds / 2;
  const pinch = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period);
  return {
    hands: [
      hand({
        cx: 0.5 + 0.02 * Math.sin((2 * Math.PI * t) / seconds),
        cy: 0.76,
        size: 0.36,
        angle: -10,
        label: 'Right',
        curls: [0, 0, 1, 1, 1],
        pinch,
      }),
    ],
  };
}

/** draw: 처음 0.4초는 손 없음, 그 뒤 검지 끝이 8자(리사주) 경로를 따라 움직인다(끝과 처음이 이어짐) */
function drawFrame(t: number, seconds: number): SyntheticFrame {
  const gap = 0.4;
  if (t < gap) {
    return { hands: [] };
  }
  const u = (t - gap) / (seconds - gap);
  const pose: HandPose = { cx: 0, cy: 0, size: 0.34, angle: -12, label: 'Right', curls: [0.8, 0, 1, 1, 1] };
  const relative = handLandmarks(pose);
  const tip = relative[8]!;
  const targetX = 0.5 + 0.22 * Math.sin(2 * Math.PI * u);
  const targetY = 0.42 + 0.14 * Math.sin(4 * Math.PI * u);
  return { hands: [hand({ ...pose, cx: targetX - tip[0], cy: targetY - tip[1] })] };
}

/** two-hands: 오른손·왼손이 나란히 보이며 흔들린다 */
function twoHandsFrame(t: number, seconds: number): SyntheticFrame {
  const swing = Math.sin((2 * Math.PI * t) / seconds);
  const wiggle = 0.12 + 0.1 * Math.sin((4 * Math.PI * t) / seconds);
  return {
    hands: [
      hand({ cx: 0.71, cy: 0.8, size: 0.33, angle: 10 * swing, label: 'Right', curls: [0.15, wiggle, 0.05, 0.05, 0.1], score: 0.98 }),
      hand({ cx: 0.29, cy: 0.8, size: 0.33, angle: -10 * Math.sin((2 * Math.PI * t) / seconds + 0.6), label: 'Left', curls: [0.15, 0.05, wiggle, 0.05, 0.1], score: 0.95 }),
    ],
  };
}

const BUILDERS: Readonly<Record<HandSequenceId, FrameBuilder>> = Object.freeze({
  count: countFrame,
  pinch: pinchFrame,
  draw: drawFrame,
  'two-hands': twoHandsFrame,
});

/** 시퀀스 하나를 만든다(늘 같은 결과). */
export function generateHandSequence(id: HandSequenceId): HandSequence {
  const info = HAND_SEQUENCE_INFO[id];
  const build = BUILDERS[id];
  const total = Math.round(info.seconds * SEQUENCE_FPS);
  const frames: SyntheticFrame[] = [];
  for (let index = 0; index < total; index += 1) {
    frames.push(build(index / SEQUENCE_FPS, info.seconds));
  }
  return { id, label: info.label, description: info.description, fps: SEQUENCE_FPS, frames };
}

/** 네 시퀀스 모두(목록 순서) */
export function generateHandSequences(): HandSequence[] {
  return HAND_SEQUENCE_IDS.map((id) => generateHandSequence(id));
}

export function isHandSequenceId(value: unknown): value is HandSequenceId {
  return typeof value === 'string' && (HAND_SEQUENCE_IDS as readonly string[]).includes(value);
}
