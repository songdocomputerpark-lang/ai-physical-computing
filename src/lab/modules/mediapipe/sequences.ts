/**
 * 재생 입력의 "동작 목록"(PLAN §8.2 P2-08 손 · P2-09 얼굴·자세, PD-30).
 *
 * 손(synthetic-hands.ts)·얼굴(synthetic-face.ts)·자세(synthetic-pose.ts) 생성기를 한 목록으로 모은다. 한 동작은 한 종류만 담는다
 * (손 동작에는 얼굴이 없고, 얼굴 동작에는 손이 없다 — 교재 예제가 한 번에 한 가지만 쓰기 때문이다).
 * 실습실 화면은 이 목록을 <select>로 보여 주고, 파이썬이 face_mesh·pose를 열면 index.ts가 그 종류의 동작으로 알아서 바꾼다.
 *
 * 만든 결과는 한 번만 계산해 기억한다(얼굴은 478점 × 60~90장이라 다시 만들면 아깝다).
 */
import {
  FACE_SEQUENCE_FPS,
  FACE_SEQUENCE_IDS,
  FACE_SEQUENCE_INFO,
  generateFaceSequence,
  isFaceSequenceId,
  type FaceSequenceId,
  type SyntheticFace,
} from './synthetic-face.ts';
import {
  HAND_SEQUENCE_IDS,
  HAND_SEQUENCE_INFO,
  SEQUENCE_FPS,
  generateHandSequence,
  isHandSequenceId,
  type HandSequenceId,
  type SyntheticHand,
} from './synthetic-hands.ts';
import {
  POSE_SEQUENCE_FPS,
  POSE_SEQUENCE_IDS,
  POSE_SEQUENCE_INFO,
  generatePoseSequence,
  isPoseSequenceId,
  type PoseSequenceId,
  type SyntheticPose,
} from './synthetic-pose.ts';

/** 한 동작이 담는 것: 손 / 얼굴 / 자세 */
export type ReplayKind = 'hands' | 'face' | 'pose';

/** 파이썬 solution 이름 → 재생 동작 종류 */
export function kindForSolution(solution: string): ReplayKind {
  if (solution === 'pose') return 'pose';
  if (solution === 'face_mesh' || solution === 'face_detection') return 'face';
  return 'hands';
}

export interface ReplayFrame {
  readonly hands: readonly SyntheticHand[];
  readonly faces: readonly SyntheticFace[];
  readonly poses: readonly SyntheticPose[];
}

export interface ReplaySequence {
  readonly id: ReplaySequenceId;
  readonly kind: ReplayKind;
  readonly label: string;
  readonly description: string;
  readonly fps: number;
  readonly frames: readonly ReplayFrame[];
}

export type ReplaySequenceId = HandSequenceId | FaceSequenceId | PoseSequenceId;

/** 화면 목록 순서(손 → 얼굴 → 자세) */
export const REPLAY_SEQUENCE_IDS: readonly ReplaySequenceId[] = Object.freeze([...HAND_SEQUENCE_IDS, ...FACE_SEQUENCE_IDS, ...POSE_SEQUENCE_IDS]);

/** 종류마다 기본으로 고르는 동작 */
export const DEFAULT_SEQUENCE_FOR_KIND: Readonly<Record<ReplayKind, ReplaySequenceId>> = Object.freeze({
  hands: 'count',
  face: 'face-turn',
  pose: 'pose-raise',
});

const EMPTY: readonly never[] = Object.freeze([]);

const cache = new Map<ReplaySequenceId, ReplaySequence>();

export function isReplaySequenceId(value: unknown): value is ReplaySequenceId {
  return isHandSequenceId(value) || isFaceSequenceId(value) || isPoseSequenceId(value);
}

export function replayKindOf(id: ReplaySequenceId): ReplayKind {
  if (isFaceSequenceId(id)) return 'face';
  if (isPoseSequenceId(id)) return 'pose';
  return 'hands';
}

/** 동작 하나를 만든다(같은 id면 같은 것을 돌려준다). */
export function replaySequence(id: ReplaySequenceId): ReplaySequence {
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }
  let sequence: ReplaySequence;
  if (isFaceSequenceId(id)) {
    const made = generateFaceSequence(id);
    sequence = {
      id,
      kind: 'face',
      label: made.label,
      description: made.description,
      fps: made.fps,
      frames: made.frames.map((frame) => ({ hands: EMPTY, faces: frame.faces, poses: EMPTY })),
    };
  } else if (isPoseSequenceId(id)) {
    const made = generatePoseSequence(id);
    sequence = {
      id,
      kind: 'pose',
      label: made.label,
      description: made.description,
      fps: made.fps,
      frames: made.frames.map((frame) => ({ hands: EMPTY, faces: EMPTY, poses: frame.poses })),
    };
  } else {
    const made = generateHandSequence(id);
    sequence = {
      id,
      kind: 'hands',
      label: made.label,
      description: made.description,
      fps: made.fps,
      frames: made.frames.map((frame) => ({ hands: frame.hands, faces: EMPTY, poses: EMPTY })),
    };
  }
  cache.set(id, sequence);
  return sequence;
}

/**
 * 목록에 보여 줄 정보(이름·설명·장 수). **좌표를 만들지 않는다** — 얼굴 한 동작이 478점 × 90장이라 화면을 그릴 때마다 만들면 느리다.
 * 실제 좌표는 그 동작을 고를 때 replaySequence(id)가 한 번만 만든다.
 */
export function listReplaySequences(): { id: ReplaySequenceId; kind: ReplayKind; label: string; description: string; frames: number }[] {
  return REPLAY_SEQUENCE_IDS.map((id) => {
    if (isFaceSequenceId(id)) {
      const info = FACE_SEQUENCE_INFO[id];
      return { id, kind: 'face' as const, label: info.label, description: info.description, frames: Math.round(info.seconds * FACE_SEQUENCE_FPS) };
    }
    if (isPoseSequenceId(id)) {
      const info = POSE_SEQUENCE_INFO[id];
      return { id, kind: 'pose' as const, label: info.label, description: info.description, frames: Math.round(info.seconds * POSE_SEQUENCE_FPS) };
    }
    const info = HAND_SEQUENCE_INFO[id];
    return { id, kind: 'hands' as const, label: info.label, description: info.description, frames: Math.round(info.seconds * SEQUENCE_FPS) };
  });
}
