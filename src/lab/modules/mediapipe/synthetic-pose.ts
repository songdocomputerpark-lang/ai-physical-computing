/**
 * 합성 자세(포즈) 랜드마크 생성기(PLAN §8.2 P2-09, PD-30 — 점 좌표만, 사람 영상 없음).
 *
 * 사람을 찍은 데이터가 아니라 **코드가 계산한 33개 관절 좌표**다. MediaPipe Pose와 같은 번호(0 코 … 32 오른발 끝)와 같은 좌표계
 * (x·y는 사진 기준 0~1, z는 엉덩이 가운데 기준 깊이, visibility 0~1)를 쓴다. 팔·다리 위치는 어깨 너비를 기준으로 한 간단한 뼈대 모형이다.
 *
 * **교재 예제가 쓰는 값이 실제로 움직이는 것**이 목표다:
 *   - 손 들기: LEFT_WRIST(15)의 y가 0.3보다 작아진다 → 교과서 1-4-1 심화(f041)의 "Success!"가 뜬다.
 *   - 어깨 기울기: LEFT_SHOULDER(11)과 RIGHT_SHOULDER(12)의 y 차이가 40픽셀을 넘는다 → 1-4-2(f042·f043)의 안내 문구가 바뀐다.
 *   - 다리(무릎·발목)는 화면 밖이라 visibility를 0.5보다 작게 준다 → draw_landmarks가 그 점을 건너뛰는 레거시 규칙이 그대로 보인다.
 *
 * 왼쪽/오른쪽은 MediaPipe 규칙대로 **사람 기준**이다(LEFT_*는 그 사람의 왼쪽). 재생 화면에서는 사람이 우리를 마주 본다고 보고
 * LEFT_* 관절을 사진의 오른쪽에 그린다(거울처럼 보는 셀카 화면과 같다).
 *
 * 이 파일은 DOM·다른 모듈에 기대지 않는 순수 계산이다. 라이선스: 사이트 소프트웨어(MIT, PD-26).
 * 관절 번호와 연결표는 MediaPipe Pose 규격(Apache-2.0, 고지는 face-connections.ts·apc_mediapipe.py 머리말)을 따른다.
 */

/** 시퀀스·좌표 계산이 바뀌면 올린다(픽스처에 함께 적혀 어긋남을 알린다). */
export const SYNTHETIC_POSE_VERSION = 1;

export const POSE_LANDMARK_COUNT = 33;

export const POSE_SEQUENCE_FPS = 15;

const DECIMALS = 4;

/** 교재 예제가 쓰는 관절 번호(픽스처 기록과 테스트가 본다): 코·어깨·팔꿈치·손목·엉덩이 */
export const POSE_KEY_LANDMARKS: readonly number[] = Object.freeze([0, 11, 12, 13, 14, 15, 16, 23, 24]);

/** MediaPipe Pose 33점 이름(순서 = 번호). 파이썬 쪽 PoseLandmark IntEnum과 같아야 한다. */
export const POSE_LANDMARK_NAMES: readonly string[] = Object.freeze([
  'NOSE',
  'LEFT_EYE_INNER',
  'LEFT_EYE',
  'LEFT_EYE_OUTER',
  'RIGHT_EYE_INNER',
  'RIGHT_EYE',
  'RIGHT_EYE_OUTER',
  'LEFT_EAR',
  'RIGHT_EAR',
  'MOUTH_LEFT',
  'MOUTH_RIGHT',
  'LEFT_SHOULDER',
  'RIGHT_SHOULDER',
  'LEFT_ELBOW',
  'RIGHT_ELBOW',
  'LEFT_WRIST',
  'RIGHT_WRIST',
  'LEFT_PINKY',
  'RIGHT_PINKY',
  'LEFT_INDEX',
  'RIGHT_INDEX',
  'LEFT_THUMB',
  'RIGHT_THUMB',
  'LEFT_HIP',
  'RIGHT_HIP',
  'LEFT_KNEE',
  'RIGHT_KNEE',
  'LEFT_ANKLE',
  'RIGHT_ANKLE',
  'LEFT_HEEL',
  'RIGHT_HEEL',
  'LEFT_FOOT_INDEX',
  'RIGHT_FOOT_INDEX',
]);

/** 왼쪽↔오른쪽 짝(영상을 좌우로 뒤집으면 모델이 반대로 부른다 — mirror.ts가 쓴다) */
export const POSE_MIRROR_PAIRS: readonly (readonly [number, number])[] = Object.freeze([
  [1, 4],
  [2, 5],
  [3, 6],
  [7, 8],
  [9, 10],
  [11, 12],
  [13, 14],
  [15, 16],
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
  [31, 32],
]);

export type Point4 = readonly [number, number, number, number];

export interface SyntheticPose {
  /** 33개 [x, y, z, visibility] */
  readonly landmarks: readonly Point4[];
  readonly score: number;
}

export interface PosePose {
  /** 몸 가운데 x(사진 기준 0~1) */
  readonly cx: number;
  /** 어깨 높이 y */
  readonly shoulderY: number;
  /** 어깨 반너비(사진 기준) */
  readonly half: number;
  /** 어깨 기울기(y 차이의 절반, 양수면 사람의 왼쪽 어깨가 내려간다) */
  readonly tilt: number;
  /** 팔 올린 정도 0(내림)~1(번쩍): [사람의 왼팔, 오른팔] */
  readonly arms: readonly [number, number];
  readonly score?: number;
}

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

/** 관절마다 "보이는 정도"(화면 밖 다리는 0.5보다 작다 → draw_landmarks가 건너뛴다) */
const VISIBILITY: readonly number[] = Object.freeze([
  0.99, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.96, 0.96, 0.95, 0.95, // 머리
  0.99, 0.99, 0.97, 0.97, 0.95, 0.95, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, // 어깨·팔·손
  0.82, 0.82, // 엉덩이
  0.32, 0.32, 0.18, 0.18, 0.15, 0.15, 0.12, 0.12, // 다리(화면 밖)
]);

/**
 * 자세 → 33개 [x, y, z, visibility]. 사람의 왼쪽(LEFT_*)은 사진의 오른쪽에 그린다(마주 본 모습).
 */
export function poseLandmarks(pose: PosePose): Point4[] {
  const { cx, shoulderY, half, tilt } = pose;
  const points: [number, number, number][] = Array.from({ length: POSE_LANDMARK_COUNT }, () => [0, 0, 0]);
  /** side 1 = 사람의 왼쪽(사진 오른쪽), -1 = 오른쪽 */
  const sideX = (side: 1 | -1, offset: number) => cx + side * offset;
  const sideTilt = (side: 1 | -1) => side * tilt;

  // 머리
  const noseY = shoulderY - 0.3;
  points[0] = [cx, noseY, 0];
  points[1] = [sideX(1, 0.022), noseY - 0.035, 0];
  points[2] = [sideX(1, 0.038), noseY - 0.038, 0];
  points[3] = [sideX(1, 0.054), noseY - 0.035, 0];
  points[4] = [sideX(-1, 0.022), noseY - 0.035, 0];
  points[5] = [sideX(-1, 0.038), noseY - 0.038, 0];
  points[6] = [sideX(-1, 0.054), noseY - 0.035, 0];
  points[7] = [sideX(1, 0.075), noseY - 0.02, 0.03];
  points[8] = [sideX(-1, 0.075), noseY - 0.02, 0.03];
  points[9] = [sideX(1, 0.028), noseY + 0.05, 0];
  points[10] = [sideX(-1, 0.028), noseY + 0.05, 0];

  // 어깨·엉덩이
  const hipY = shoulderY + 0.42;
  for (const side of [1, -1] as const) {
    const shoulder: [number, number, number] = [sideX(side, half), shoulderY + sideTilt(side), 0];
    const hip: [number, number, number] = [sideX(side, half * 0.7), hipY + sideTilt(side) * 0.4, 0];
    points[side === 1 ? 11 : 12] = shoulder;
    points[side === 1 ? 23 : 24] = hip;

    // 팔: 내렸을 때(아래로) ↔ 들었을 때(위로)
    const raise = clamp01(pose.arms[side === 1 ? 0 : 1]!);
    const elbow: [number, number, number] = [
      lerp(shoulder[0] + side * 0.045, shoulder[0] + side * 0.14, raise),
      lerp(shoulder[1] + 0.17, shoulder[1] - 0.02, raise),
      0.02,
    ];
    const wrist: [number, number, number] = [
      lerp(elbow[0] + side * 0.03, elbow[0] + side * 0.05, raise),
      lerp(elbow[1] + 0.18, elbow[1] - 0.24, raise),
      0.03,
    ];
    points[side === 1 ? 13 : 14] = elbow;
    points[side === 1 ? 15 : 16] = wrist;
    // 손끝(새끼·검지·엄지)은 손목에서 팔 방향으로 조금 더 간다
    const dx = wrist[0] - elbow[0];
    const dy = wrist[1] - elbow[1];
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const hand = (along: number, across: number): [number, number, number] => [
      round(wrist[0] + ux * along - uy * across),
      round(wrist[1] + uy * along + ux * across),
      0.04,
    ];
    points[side === 1 ? 17 : 18] = hand(0.055, side * 0.018);
    points[side === 1 ? 19 : 20] = hand(0.06, -side * 0.012);
    points[side === 1 ? 21 : 22] = hand(0.035, -side * 0.026);

    // 다리(대부분 화면 밖)
    points[side === 1 ? 25 : 26] = [sideX(side, half * 0.62), hipY + 0.36, 0.05];
    points[side === 1 ? 27 : 28] = [sideX(side, half * 0.58), hipY + 0.72, 0.06];
    points[side === 1 ? 29 : 30] = [sideX(side, half * 0.58), hipY + 0.78, 0.07];
    points[side === 1 ? 31 : 32] = [sideX(side, half * 0.62), hipY + 0.84, 0.08];
  }

  return points.map(([x, y, z], index) => [round(x), round(y), round(z), VISIBILITY[index]!] as Point4);
}

export interface SyntheticPoseFrame {
  readonly poses: readonly SyntheticPose[];
}

export interface PoseSequence {
  readonly id: PoseSequenceId;
  readonly label: string;
  readonly description: string;
  readonly fps: number;
  readonly frames: readonly SyntheticPoseFrame[];
}

export const POSE_SEQUENCE_IDS = ['pose-raise', 'pose-tilt'] as const;
export type PoseSequenceId = (typeof POSE_SEQUENCE_IDS)[number];

export const POSE_SEQUENCE_INFO: Readonly<Record<PoseSequenceId, { readonly label: string; readonly description: string; readonly seconds: number }>> =
  Object.freeze({
    'pose-raise': { label: '손 들기', description: '왼손을 번쩍 들었다 내려요(손 들기 판정 예제용).', seconds: 5 },
    'pose-tilt': { label: '어깨 기울이기', description: '어깨를 한쪽씩 기울여요(어깨 높이 차이 예제용).', seconds: 4 },
  });

const REST: PosePose = Object.freeze({ cx: 0.5, shoulderY: 0.5, half: 0.13, tilt: 0, arms: [0, 0] as const });

function pose(values: PosePose): SyntheticPose {
  return { landmarks: poseLandmarks(values), score: round(values.score ?? 0.94) };
}

function raiseFrame(t: number, seconds: number): SyntheticPoseFrame {
  // 1초~3.6초 사이에 왼손을 든다(가운데는 거의 최대)
  const u = (t - 1) / 2.6;
  const raise = u <= 0 || u >= 1 ? 0 : Math.min(1, (u < 0.5 ? smoothstep(u * 2) : smoothstep((1 - u) * 2)) * 1.7);
  const sway = 0.006 * Math.sin((2 * Math.PI * t) / seconds);
  return { poses: [pose({ ...REST, cx: REST.cx + sway, arms: [raise, 0], tilt: 0.012 * raise })] };
}

function tiltFrame(t: number, seconds: number): SyntheticPoseFrame {
  const tilt = 0.062 * Math.sin((2 * Math.PI * t) / seconds);
  return { poses: [pose({ ...REST, tilt, cx: REST.cx + 0.01 * Math.sin((2 * Math.PI * t) / seconds) })] };
}

const BUILDERS: Readonly<Record<PoseSequenceId, (t: number, seconds: number) => SyntheticPoseFrame>> = Object.freeze({
  'pose-raise': raiseFrame,
  'pose-tilt': tiltFrame,
});

export function generatePoseSequence(id: PoseSequenceId): PoseSequence {
  const info = POSE_SEQUENCE_INFO[id];
  const build = BUILDERS[id];
  const total = Math.round(info.seconds * POSE_SEQUENCE_FPS);
  const frames: SyntheticPoseFrame[] = [];
  for (let index = 0; index < total; index += 1) {
    frames.push(build(index / POSE_SEQUENCE_FPS, info.seconds));
  }
  return { id, label: info.label, description: info.description, fps: POSE_SEQUENCE_FPS, frames };
}

export function generatePoseSequences(): PoseSequence[] {
  return POSE_SEQUENCE_IDS.map((id) => generatePoseSequence(id));
}

export function isPoseSequenceId(value: unknown): value is PoseSequenceId {
  return typeof value === 'string' && (POSE_SEQUENCE_IDS as readonly string[]).includes(value);
}

// ── 교재 예제와 같은 계산(테스트·문서가 쓴다) ──

/** 교과서 1-4-1 심화(f041): 왼손 손목의 y(0.3보다 작으면 "Success!") */
export function leftWristY(landmarks: readonly Point4[]): number {
  return landmarks[15]![1];
}

/** 교과서 1-4-2(f042·f043): 두 어깨의 y 픽셀 차이(40보다 크면 "자세가 틀어졌습니다") */
export function shoulderDiffPx(landmarks: readonly Point4[], frameHeight = 480): number {
  return Math.abs(Math.trunc(landmarks[11]![1] * frameHeight) - Math.trunc(landmarks[12]![1] * frameHeight));
}
