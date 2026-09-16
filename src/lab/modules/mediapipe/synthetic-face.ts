/**
 * 합성 얼굴 랜드마크 생성기(PLAN §8.2 P2-09, PD-30 "카메라 없는 PC와 테스트용으로 합성 랜드마크 재생 입력 — 점 좌표만, 얼굴 이미지 없음").
 *
 * 사람 얼굴을 찍거나 추적한 데이터가 **아니다**. MediaPipe 얼굴 그물의 "몇 번 점과 몇 번 점을 잇는가"(face-connections.ts, Apache-2.0)만 쓰고,
 * 점 위치는 이 파일의 계산으로 만든다:
 *   1. 겉테두리(FACEMESH_FACE_OVAL 36점)·눈(16점씩)·눈썹(5점씩 두 줄)·입술(안쪽 20 + 바깥 20)·얼굴 가운데 선을 **정해진 자리**에 놓는다(ANCHORS).
 *   2. 나머지 점(볼·이마·코 옆 등 380여 개)은 "이웃 점들의 평균 자리"로 되풀이해 풀어서(라플라스 평활) 그물이 자연스럽게 펴지게 한다.
 *      이웃 관계는 진짜 얼굴 그물 연결표라서 결과가 얼굴 모양이 된다. 난수를 쓰지 않아 늘 같은 값이 나온다.
 *   3. 깊이(z)는 타원 돔 + 코 봉우리로 계산하고, 고개를 돌릴 때(yaw) 이 깊이로 x를 움직인다 → 코가 눈 가운데보다 크게 움직인다(f035 판정이 바뀐다).
 *
 * **교재 예제가 쓰는 번호가 실제로 움직이는 것**이 목표다(PLAN §8.2 P2-09 완료 기준):
 *   - 눈 깜빡임: 158(위 눈꺼풀)과 153(아래 눈꺼풀)이 가까워진다 → 교안 계단 14(f122)의 "Closed" 판정이 바뀐다.
 *   - 입 벌림: 14(아랫입술 안쪽)가 18(아랫입술 아래)에서 멀어진다 → 교과서 1-3-2(f036·f037)의 MAR가 0.4를 넘는다.
 *   - 고개 돌리기: 1(코끝)이 33·263(두 눈 바깥 끝)의 가운데에서 10픽셀 넘게 벗어난다 → 1-3-1 심화(f035)의 Left/Right가 바뀐다.
 * 실제 값은 tests/unit/mediapipe/synthetic-face.test.ts가 교재와 같은 식으로 계산해 검사한다.
 *
 * 좌표 모양은 MediaPipe와 같다: x·y는 사진 폭·높이 기준 0~1(왼쪽 위가 원점), z는 얼굴 가운데 기준 깊이(카메라 쪽이 음수), 점 개수 478
 * (앞 468은 그물, 468·473은 눈동자 가운데, 469~477은 눈동자 테두리). refine_landmarks=False면 흉내 모듈이 앞 468개만 돌려준다.
 *
 * 이 파일은 DOM·무거운 라이브러리에 기대지 않는 순수 계산이다(Node.js가 타입만 지우고 그대로 실행한다 — enum·네임스페이스 금지).
 * 라이선스: 사이트 소프트웨어(MIT, PD-26). 연결표의 출처 고지는 face-connections.ts와 apc_mediapipe.py 머리말.
 */
import { FACE_CONNECTIONS } from './face-connections.ts';

/** 시퀀스·좌표 계산이 바뀌면 올린다(픽스처에 함께 적혀 어긋남을 알린다). */
export const SYNTHETIC_FACE_VERSION = 1;

/** 얼굴 그물 점 개수(눈동자 제외) */
export const FACE_MESH_LANDMARK_COUNT = 468;

/** 눈동자까지 넣은 점 개수(Tasks FaceLandmarker가 늘 돌려주는 수, refine_landmarks=True) */
export const FACE_LANDMARK_COUNT = 478;

/** 재생 fps(카메라 프레임 제한과 같다) */
export const FACE_SEQUENCE_FPS = 15;

/** 좌표 반올림 자리 */
const DECIMALS = 4;

/** 사진 비율(4:3, 640×480) — x는 이 비율로 줄여 얼굴이 찌그러지지 않게 한다. */
export const FRAME_ASPECT = 4 / 3;

/** 교재·교안 예제가 쓰는 점 번호(픽스처 기록과 테스트가 본다) */
export const FACE_KEY_LANDMARKS: readonly number[] = Object.freeze([
  1, 5, 6, 10, 13, 14, 17, 18, 19, 33, 78, 133, 152, 153, 158, 160, 234, 263, 308, 362, 373, 380, 385, 387, 454, 468, 473,
]);

export type Point3 = readonly [number, number, number];

export interface SyntheticFace {
  /** 478개 [x, y, z] */
  readonly landmarks: readonly Point3[];
  /** 얼굴 상자(FaceDetection 흉내가 쓰는 0~1 값) */
  readonly box: { readonly xmin: number; readonly ymin: number; readonly width: number; readonly height: number };
  readonly score: number;
}

export interface FacePose {
  /** 얼굴 가운데 위치(사진 기준 0~1) */
  readonly cx: number;
  readonly cy: number;
  /** 얼굴 높이(이마 끝~턱 끝, 사진 높이 기준) */
  readonly size: number;
  /** 고개 좌우 돌림(도, 양수면 얼굴이 사진 오른쪽을 본다) */
  readonly yaw: number;
  /** 고개 갸웃(도) */
  readonly roll: number;
  /** 눈 감음 0(뜸)~1(감음): [사진 왼쪽 눈(33쪽), 사진 오른쪽 눈(263쪽)] */
  readonly blink: readonly [number, number];
  /** 입 벌림 0(닫음)~1(크게) */
  readonly mouthOpen: number;
  readonly score?: number;
}

// ── 연결표에서 고리(ring)와 사슬(chain) 꺼내기 ──

type Pairs = readonly (readonly [number, number])[];

function adjacency(pairs: Pairs): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const [start, end] of pairs) {
    if (!map.has(start)) map.set(start, []);
    if (!map.has(end)) map.set(end, []);
    if (!map.get(start)!.includes(end)) map.get(start)!.push(end);
    if (!map.get(end)!.includes(start)) map.get(end)!.push(start);
  }
  return map;
}

/** 이어진 점들을 차례대로 늘어놓는다(고리·사슬 모두). 같은 표에 여러 덩어리가 있으면 여러 개를 돌려준다. */
export function walkGroups(pairs: Pairs): number[][] {
  const map = adjacency(pairs);
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (const start of map.keys()) {
    if (seen.has(start)) continue;
    const group = [start];
    seen.add(start);
    let previous: number | null = null;
    let current = start;
    for (;;) {
      const next = map.get(current)!.find((node) => node !== previous && !seen.has(node));
      if (next === undefined) break;
      group.push(next);
      seen.add(next);
      previous = current;
      current = next;
    }
    groups.push(group);
  }
  return groups;
}

/** 한 고리를 start부터 시작하도록 돌리고, before가 after보다 먼저 오게 방향을 맞춘다. */
export function orientRing(ring: readonly number[], start: number, before: number): number[] {
  const at = ring.indexOf(start);
  if (at < 0) {
    throw new Error(`고리에 ${start}번 점이 없어요.`);
  }
  const rotated = [...ring.slice(at), ...ring.slice(0, at)];
  return rotated.indexOf(before) > rotated.length / 2 ? [rotated[0]!, ...rotated.slice(1).reverse()] : rotated;
}

// ── 자리 정하기(얼굴 공간: x 오른쪽, y 아래, 이마 끝 -0.5 ~ 턱 끝 +0.5) ──

const DEG = Math.PI / 180;

/** 겉테두리 타원 반지름 */
const OVAL_RX = 0.37;
const OVAL_RY = 0.5;

/** 눈 자리(사진 왼쪽 눈 = 33번 무리) */
const EYE_Y = -0.13;
const EYE_OUTER_X = 0.28;
const EYE_INNER_X = 0.09;
/** 위·아래 눈꺼풀이 눈 가운데선에서 떨어지는 정도(뜬 눈) */
const EYE_UPPER = 0.055;
const EYE_LOWER = 0.048;
/** 눈동자 반지름 */
const IRIS_R = 0.028;

/** 입 자리 */
const MOUTH_Y = 0.235;
const MOUTH_INNER_X = 0.13;
const MOUTH_OUTER_X = 0.165;
const MOUTH_INNER_UPPER = 0.013;
const MOUTH_INNER_LOWER = 0.013;
const MOUTH_OUTER_UPPER = 0.042;
const MOUTH_OUTER_LOWER = 0.045;

/** 입을 가장 크게 벌렸을 때 턱이 내려가는 거리(얼굴 높이 기준) */
const JAW_DROP = 0.26;
/** 아랫입술은 턱보다 덜 내려간다(입술이 이에 붙어 늘어난다) — 14와 18이 멀어지는 까닭 */
const JAW_INNER_LIP = 0.68;
const JAW_OUTER_LIP = 0.85;

/** 얼굴 가운데 선(위에서 아래로). 코끝 4, 코 아래 1·19·2, 입술 위 0은 다른 표에서 다시 정한다. */
const MIDLINE: readonly (readonly [number, number])[] = Object.freeze([
  [151, -0.44],
  [9, -0.35],
  [8, -0.28],
  [168, -0.24],
  [6, -0.2],
  [197, -0.15],
  [195, -0.09],
  [5, -0.03],
  [4, 0.03],
  [1, 0.06],
  [19, 0.105],
  [94, 0.125],
  [2, 0.145],
  [164, 0.175],
  [18, 0.3],
  [200, 0.34],
  [199, 0.39],
  [175, 0.44],
]);

/** 겉테두리에서 방향을 잡는 네 점 */
const OVAL_TOP = 10;
const OVAL_RIGHT = 454;
const OVAL_BOTTOM = 152;
const OVAL_LEFT = 234;

function round(value: number): number {
  const factor = 10 ** DECIMALS;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface BaseFace {
  /** 468개 얼굴 공간 좌표 [x, y] */
  readonly xy: readonly (readonly [number, number])[];
  /** 카메라 쪽으로 튀어나온 정도(0 이상) */
  readonly depth: readonly number[];
  /** 턱이 내려갈 때 따라 내려가는 비율 0~1 */
  readonly jaw: readonly number[];
  /** 눈 깜빡임에 따라 움직이는 점: [눈 번호(0 = 33쪽), 눈 가운데선에서의 거리] */
  readonly eyelid: ReadonlyMap<number, readonly [number, number]>;
}

/** 겉테두리 타원 위의 자리(각 θ, 도) */
function ovalPoint(angleDeg: number): [number, number] {
  const angle = angleDeg * DEG;
  const sin = Math.sin(angle);
  const taper = sin > 0 ? 1 - 0.45 * sin * sin : 1 - 0.12 * sin * sin;
  return [OVAL_RX * Math.cos(angle) * taper, OVAL_RY * sin];
}

/** 고리를 따라가며 정해진 자리(anchors) 사이를 부드럽게 채운다(각도 보간). */
function placeOvalRing(anchors: Map<number, [number, number]>): void {
  const ring = orientRing(walkGroups(FACE_CONNECTIONS.FACEMESH_FACE_OVAL)[0]!, OVAL_TOP, OVAL_RIGHT);
  const marks = [
    { index: ring.indexOf(OVAL_TOP), angle: -90 },
    { index: ring.indexOf(OVAL_RIGHT), angle: 0 },
    { index: ring.indexOf(OVAL_BOTTOM), angle: 90 },
    { index: ring.indexOf(OVAL_LEFT), angle: 180 },
    { index: ring.length, angle: 270 },
  ];
  for (const [position, point] of ring.entries()) {
    let segment = 0;
    while (segment + 1 < marks.length && position >= marks[segment + 1]!.index) segment += 1;
    const from = marks[segment]!;
    const to = marks[segment + 1]!;
    const fraction = (position - from.index) / Math.max(1, to.index - from.index);
    anchors.set(point, ovalPoint(lerp(from.angle, to.angle, fraction)));
  }
}

/** 눈 한 개(고리 16점: 바깥 끝 → 아래 눈꺼풀 7 → 안쪽 끝 → 위 눈꺼풀 7) */
function placeEye(
  anchors: Map<number, [number, number]>,
  eyelid: Map<number, [number, number]>,
  pairs: Pairs,
  outer: number,
  inner: number,
  side: -1 | 1,
  eyeIndex: 0 | 1,
): { center: [number, number] } {
  const ring = orientRing(walkGroups(pairs)[0]!, outer, inner);
  const outerPoint: [number, number] = [side * EYE_OUTER_X, EYE_Y];
  const innerPoint: [number, number] = [side * EYE_INNER_X, EYE_Y + 0.005];
  anchors.set(outer, outerPoint);
  anchors.set(inner, innerPoint);
  const half = (ring.length - 2) / 2;
  const innerAt = ring.indexOf(inner);
  for (const [position, point] of ring.entries()) {
    if (point === outer || point === inner) continue;
    const lower = position < innerAt;
    const step = lower ? position : position - innerAt;
    const t = step / (half + 1);
    const from = lower ? outerPoint : innerPoint;
    const to = lower ? innerPoint : outerPoint;
    const offset = Math.sin(Math.PI * t) * (lower ? EYE_LOWER : -EYE_UPPER);
    anchors.set(point, [lerp(from[0], to[0], t), lerp(from[1], to[1], t) + offset]);
    eyelid.set(point, [eyeIndex, offset]);
  }
  return { center: [side * (EYE_OUTER_X + EYE_INNER_X) / 2, EYE_Y + 0.002] };
}

/** 눈썹 두 줄(각 5점, 바깥 → 안쪽) */
function placeEyebrow(anchors: Map<number, [number, number]>, pairs: Pairs, side: -1 | 1): void {
  const groups = walkGroups(pairs);
  groups.forEach((chain, order) => {
    const y = EYE_Y - (order === 0 ? 0.075 : 0.105);
    chain.forEach((point, step) => {
      const t = step / (chain.length - 1);
      const x = side * lerp(EYE_OUTER_X + 0.015, EYE_INNER_X - 0.015, t);
      anchors.set(point, [x, y - Math.sin(Math.PI * t) * 0.012]);
    });
  });
}

/** 입술 고리 하나(아래 반 → 반대쪽 끝 → 위 반) */
function placeLips(
  anchors: Map<number, [number, number]>,
  jawGroup: Map<number, number>,
  ring: readonly number[],
  halfWidth: number,
  upper: number,
  lower: number,
  jawFactor: number,
): void {
  const left: [number, number] = [-halfWidth, MOUTH_Y];
  const right: [number, number] = [halfWidth, MOUTH_Y];
  const half = ring.length / 2;
  for (const [position, point] of ring.entries()) {
    const down = position <= half;
    const t = (down ? position : position - half) / half;
    const from = down ? left : right;
    const to = down ? right : left;
    const offset = Math.sin(Math.PI * t) * (down ? lower : -upper);
    anchors.set(point, [lerp(from[0], to[0], t), MOUTH_Y + offset]);
    jawGroup.set(point, down ? jawFactor : 0);
  }
}

let cachedBase: BaseFace | null = null;

/** 468점의 기본 자리(얼굴 공간)를 한 번만 계산한다. */
export function baseFace(): BaseFace {
  if (cachedBase) {
    return cachedBase;
  }
  const anchors = new Map<number, [number, number]>();
  const eyelid = new Map<number, [number, number]>();
  const jawGroup = new Map<number, number>();

  placeOvalRing(anchors);
  for (const [point, y] of MIDLINE) {
    anchors.set(point, [0, y]);
  }
  // 사진 왼쪽 눈 = MediaPipe가 'RIGHT_EYE'라 부르는 무리(33·133·153·158 …), 사진 오른쪽 눈 = 'LEFT_EYE'(263·362 …)
  const leftEye = placeEye(anchors, eyelid, FACE_CONNECTIONS.FACEMESH_RIGHT_EYE, 33, 133, -1, 0);
  const rightEye = placeEye(anchors, eyelid, FACE_CONNECTIONS.FACEMESH_LEFT_EYE, 263, 362, 1, 1);
  placeEyebrow(anchors, FACE_CONNECTIONS.FACEMESH_RIGHT_EYEBROW, -1);
  placeEyebrow(anchors, FACE_CONNECTIONS.FACEMESH_LEFT_EYEBROW, 1);

  const lipRings = walkGroups(FACE_CONNECTIONS.FACEMESH_LIPS);
  const innerRing = orientRing(lipRings.find((ring) => ring.includes(13))!, 78, 14);
  const outerRing = orientRing(lipRings.find((ring) => ring.includes(0))!, 61, 17);
  placeLips(anchors, jawGroup, innerRing, MOUTH_INNER_X, MOUTH_INNER_UPPER, MOUTH_INNER_LOWER, JAW_INNER_LIP);
  placeLips(anchors, jawGroup, outerRing, MOUTH_OUTER_X, MOUTH_OUTER_UPPER, MOUTH_OUTER_LOWER, JAW_OUTER_LIP);

  // 나머지 점: 이웃 평균으로 되풀이해 푼다(라플라스 평활). 이웃은 진짜 얼굴 그물 연결표.
  const neighbours: number[][] = Array.from({ length: FACE_MESH_LANDMARK_COUNT }, () => []);
  for (const [start, end] of FACE_CONNECTIONS.FACEMESH_TESSELATION) {
    if (!neighbours[start]!.includes(end)) neighbours[start]!.push(end);
    if (!neighbours[end]!.includes(start)) neighbours[end]!.push(start);
  }
  const xy: [number, number][] = Array.from({ length: FACE_MESH_LANDMARK_COUNT }, (_unused, index) => {
    const anchor = anchors.get(index);
    return anchor ? [anchor[0], anchor[1]] : [0, 0];
  });
  for (let round_ = 0; round_ < 600; round_ += 1) {
    for (let index = 0; index < FACE_MESH_LANDMARK_COUNT; index += 1) {
      if (anchors.has(index)) continue;
      const list = neighbours[index]!;
      if (list.length === 0) continue;
      let sumX = 0;
      let sumY = 0;
      for (const other of list) {
        sumX += xy[other]![0];
        sumY += xy[other]![1];
      }
      xy[index] = [sumX / list.length, sumY / list.length];
    }
  }

  // 눈동자(468 = 사진 왼쪽 눈 가운데, 473 = 사진 오른쪽 눈 가운데)
  const iris: [number, number][] = [];
  for (const [center, ring] of [
    [leftEye.center, FACE_CONNECTIONS.FACEMESH_RIGHT_IRIS],
    [rightEye.center, FACE_CONNECTIONS.FACEMESH_LEFT_IRIS],
  ] as const) {
    iris.push([center[0], center[1]]);
    const points = walkGroups(ring)[0]!;
    for (const [step] of points.entries()) {
      const angle = (step / points.length) * 2 * Math.PI;
      iris.push([center[0] + Math.cos(angle) * IRIS_R * 0.75, center[1] + Math.sin(angle) * IRIS_R]);
    }
  }
  const all = [...xy, ...iris];

  // 깊이: 타원 돔 + 코 봉우리
  const depth = all.map(([x, y]) => {
    const dome = 0.17 * Math.max(0, 1 - (x / OVAL_RX) ** 2 - (y / OVAL_RY) ** 2);
    const nose = 0.1 * Math.exp(-((x * x + (y - 0.02) ** 2) / (2 * 0.075 ** 2)));
    return dome + nose;
  });

  // 턱을 따라 내려가는 비율: 입술은 표대로, 입 아래는 1, 윗입술 위는 0, 사이는 부드럽게
  const jaw = all.map(([, y], index) => {
    const known = jawGroup.get(index);
    if (known !== undefined) return known;
    if (y >= 0.3) return 1;
    if (y <= 0.22) return 0;
    return smoothstep((y - 0.22) / 0.08);
  });

  cachedBase = { xy: all, depth, jaw, eyelid };
  return cachedBase;
}

/** 얼굴 자세 → 478개 [x, y, z](사진 기준 0~1) */
export function faceLandmarks(pose: FacePose): Point3[] {
  const base = baseFace();
  const scaleY = pose.size;
  const scaleX = pose.size / FRAME_ASPECT;
  const yaw = pose.yaw * DEG;
  const roll = pose.roll * DEG;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const drop = clamp01(pose.mouthOpen) * JAW_DROP;
  return base.xy.map(([x, y], index) => {
    let fx = x;
    let fy = y + base.jaw[index]! * drop;
    const lid = base.eyelid.get(index);
    if (lid) {
      const [eye, offset] = lid;
      // 감을수록 눈꺼풀이 눈 가운데선으로 모인다(158과 153이 가까워진다).
      fy = fy - offset + offset * (1 - clamp01(pose.blink[eye]!));
    }
    const depth = base.depth[index]!;
    // 고개 좌우 돌림: 튀어나온 곳(코)일수록 많이 움직인다
    const rotatedX = fx * cosYaw + depth * sinYaw;
    const rotatedDepth = -fx * sinYaw + depth * cosYaw;
    fx = rotatedX;
    const tiltedX = fx * cosRoll - fy * sinRoll;
    const tiltedY = fx * sinRoll + fy * cosRoll;
    return [round(pose.cx + tiltedX * scaleX), round(pose.cy + tiltedY * scaleY), round(-rotatedDepth * scaleX)] as Point3;
  });
}

/** 얼굴 상자(겉테두리 점들의 최소·최대, FaceDetection 흉내가 쓴다) */
export function faceBox(landmarks: readonly Point3[]): SyntheticFace['box'] {
  const ring = walkGroups(FACE_CONNECTIONS.FACEMESH_FACE_OVAL)[0]!;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const index of ring) {
    const [x, y] = landmarks[index]!;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // 레거시 얼굴 검출 상자는 그물보다 조금 넓다(머리카락 쪽으로).
  const padX = (maxX - minX) * 0.06;
  const padY = (maxY - minY) * 0.12;
  return {
    xmin: round(Math.max(0, minX - padX)),
    ymin: round(Math.max(0, minY - padY)),
    width: round(Math.min(1, maxX + padX) - Math.max(0, minX - padX)),
    height: round(Math.min(1, maxY + padY) - Math.max(0, minY - padY)),
  };
}

function face(pose: FacePose): SyntheticFace {
  const landmarks = faceLandmarks(pose);
  return { landmarks, box: faceBox(landmarks), score: round(pose.score ?? 0.96) };
}

export interface SyntheticFaceFrame {
  readonly faces: readonly SyntheticFace[];
}

export interface FaceSequence {
  readonly id: FaceSequenceId;
  readonly label: string;
  readonly description: string;
  readonly fps: number;
  readonly frames: readonly SyntheticFaceFrame[];
}

export const FACE_SEQUENCE_IDS = ['face-blink', 'face-yawn', 'face-turn'] as const;
export type FaceSequenceId = (typeof FACE_SEQUENCE_IDS)[number];

export const FACE_SEQUENCE_INFO: Readonly<Record<FaceSequenceId, { readonly label: string; readonly description: string; readonly seconds: number }>> =
  Object.freeze({
    'face-blink': { label: '눈 깜빡이기', description: '두 눈을 2초에 한 번 감았다 떠요(눈 감김 판정 예제용).', seconds: 4 },
    'face-yawn': { label: '입 벌리기(하품)', description: '입을 크게 벌렸다 닫아요(하품·입 벌림 판정 예제용).', seconds: 5 },
    'face-turn': { label: '고개 돌리기', description: '고개를 왼쪽·오른쪽으로 천천히 돌려요(코 위치·고개 방향 예제용).', seconds: 6 },
  });

const REST: FacePose = Object.freeze({ cx: 0.5, cy: 0.48, size: 0.62, yaw: 0, roll: 0, blink: [0, 0] as const, mouthOpen: 0 });

/** 0~1을 오갔다 돌아오는 값(0 → 1 → 0), 가장자리는 부드럽게 */
function pulse(t: number, from: number, to: number): number {
  if (t <= from || t >= to) return 0;
  const u = (t - from) / (to - from);
  return u < 0.5 ? smoothstep(u * 2) : smoothstep((1 - u) * 2);
}

function blinkFrame(t: number, seconds: number): SyntheticFaceFrame {
  const bob = 0.004 * Math.sin((2 * Math.PI * t) / seconds);
  const blink = Math.max(pulse(t, 0.6, 1.2), pulse(t, 2.4, 3.0));
  return { faces: [face({ ...REST, cy: REST.cy + bob, blink: [blink, blink], yaw: 3 * Math.sin((2 * Math.PI * t) / seconds) })] };
}

function yawnFrame(t: number, seconds: number): SyntheticFaceFrame {
  // 1.2초부터 3.4초까지 크게 벌린다(가운데 1.4초는 거의 최대 — CONSECUTIVE_FRAMES=5를 넉넉히 넘긴다)
  const open = Math.min(1, pulse(t, 1.2, 3.4) * 1.6);
  return { faces: [face({ ...REST, mouthOpen: open, cy: REST.cy - 0.01 * open, yaw: 2 * Math.sin((2 * Math.PI * t) / seconds) })] };
}

function turnFrame(t: number, seconds: number): SyntheticFaceFrame {
  const yaw = 28 * Math.sin((2 * Math.PI * t) / seconds);
  return { faces: [face({ ...REST, yaw, roll: 3 * Math.sin((4 * Math.PI * t) / seconds) })] };
}

const BUILDERS: Readonly<Record<FaceSequenceId, (t: number, seconds: number) => SyntheticFaceFrame>> = Object.freeze({
  'face-blink': blinkFrame,
  'face-yawn': yawnFrame,
  'face-turn': turnFrame,
});

export function generateFaceSequence(id: FaceSequenceId): FaceSequence {
  const info = FACE_SEQUENCE_INFO[id];
  const build = BUILDERS[id];
  const total = Math.round(info.seconds * FACE_SEQUENCE_FPS);
  const frames: SyntheticFaceFrame[] = [];
  for (let index = 0; index < total; index += 1) {
    frames.push(build(index / FACE_SEQUENCE_FPS, info.seconds));
  }
  return { id, label: info.label, description: info.description, fps: FACE_SEQUENCE_FPS, frames };
}

export function generateFaceSequences(): FaceSequence[] {
  return FACE_SEQUENCE_IDS.map((id) => generateFaceSequence(id));
}

export function isFaceSequenceId(value: unknown): value is FaceSequenceId {
  return typeof value === 'string' && (FACE_SEQUENCE_IDS as readonly string[]).includes(value);
}

// ── 교재 예제와 같은 계산(테스트·문서가 쓴다) ──

/** 교안 계단 14(f122)와 같은 눈 감김 계산: |158-153|² 이 |133-33|² × 0.05 보다 작으면 감은 것 */
export function eyeClosed(landmarks: readonly Point3[], frameWidth = 640, frameHeight = 480): boolean {
  const px = (index: number): [number, number] => [Math.trunc(landmarks[index]![0] * frameWidth), Math.trunc(landmarks[index]![1] * frameHeight)];
  const [ux, uy] = px(158);
  const [lx, ly] = px(153);
  const [ix, iy] = px(133);
  const [ox, oy] = px(33);
  const lid = (ux - lx) ** 2 + (uy - ly) ** 2;
  const width = (ix - ox) ** 2 + (iy - oy) ** 2;
  return width * 0.05 > lid;
}

/** 교과서 1-3-2 심화(f037)와 같은 MAR 계산(입 모양 비율, 0.4를 넘으면 하품) */
export function mouthAspectRatio(landmarks: readonly Point3[], frameWidth = 640, frameHeight = 480): number {
  const px = (index: number): [number, number] => [Math.trunc(landmarks[index]![0] * frameWidth), Math.trunc(landmarks[index]![1] * frameHeight)];
  const points = [13, 14, 19, 18, 78, 308].map(px);
  const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return (distance(points[0]!, points[2]!) + distance(points[1]!, points[3]!)) / (2 * distance(points[4]!, points[5]!));
}

/** 교과서 1-3-1 심화(f035)와 같은 고개 방향 계산: 코(1)와 두 눈 바깥 끝(33·263) 가운데의 픽셀 차이 */
export function headDirection(landmarks: readonly Point3[], frameWidth = 640, threshold = 10): 'Left' | 'Right' | 'Center' {
  const noseX = Math.trunc(landmarks[1]![0] * frameWidth);
  const eyeCenterX = Math.trunc((Math.trunc(landmarks[33]![0] * frameWidth) + Math.trunc(landmarks[263]![0] * frameWidth)) / 2);
  const diff = noseX - eyeCenterX;
  if (diff < -threshold) return 'Left';
  if (diff > threshold) return 'Right';
  return 'Center';
}
