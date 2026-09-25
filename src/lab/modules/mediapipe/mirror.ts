/**
 * 재생 입력(합성 손 좌표)에서 "학생 코드가 영상을 좌우로 뒤집었는지" 알아내고 좌표를 함께 뒤집는다(PLAN §8.2 P2-08, CODE_MAPPING §3.1·§3.2).
 *
 * 왜 필요한가: 자료의 손 예제 대부분은 `frame = cv2.flip(frame, 1)` 뒤에 `hands.process(...)`를 부른다(f029~f033, 계단 5~10 …).
 * 진짜 카메라 + 모델일 때는 **파이썬이 넘긴 배열**로 추론하므로 좌표가 뒤집힌 영상과 저절로 맞는다(CODE_MAPPING §3.1 "좌우 반전").
 * 그런데 재생 입력은 이미지를 보고 추론하는 것이 아니라 **그려 둔 좌표를 그대로 돌려주므로**, 학생이 뒤집으면 뼈대가 반대쪽에 그려진다.
 * 그래서 넘어온 이미지가 우리가 그린 것의 거울상인지 보고, 거울상이면 좌표도 뒤집어 준다.
 *
 * 어떻게: 재생 화면 왼쪽 위 구석에 작은 **분홍(마젠타) 표시**를 그려 둔다(replay-source.ts `drawOrientationMark`).
 * - 분홍 (255, 0, 255)는 R과 B가 같아 **RGB·BGR 어느 쪽으로 읽어도 그대로**다 — f026처럼 색 변환 없이 넘기는 예제에서도 찾을 수 있다.
 * - 뼈대·바탕은 회색·하늘색·노랑뿐이라 분홍과 겹치지 않는다(손이 구석에 와도 잘못 세지 않는다).
 * - 왼쪽 위 구석과 오른쪽 위 구석에서 분홍 점을 세어 오른쪽에서 나오면 뒤집힌 것이다. 위아래 뒤집기(`flip(frame, 0)`)는 다루지 않는다
 *   (자료의 손 예제에 없다 — 그때는 '모름'이 되어 이전 판단을 그대로 쓴다).
 *
 * 좌우 이름(handedness)도 함께 바꾼다: 레거시·Tasks 모두 "거울처럼 뒤집힌 셀카 영상"을 가정하므로, 뒤집힌 영상을 넣으면 진짜 모델도
 * 좌우를 반대로 부른다(오른손이 왼손처럼 보이므로). 재생 입력이 그 동작까지 흉내 내야 교재와 결과가 같다.
 *
 * 이 파일은 DOM·다른 모듈에 기대지 않는 순수 함수라 단위 테스트가 가짜 이미지로 검사한다.
 */
import { baseFace, type SyntheticFace } from './synthetic-face.ts';
import type { SyntheticHand, SyntheticHandedness } from './synthetic-hands.ts';
import { POSE_MIRROR_PAIRS, type SyntheticPose } from './synthetic-pose.ts';

/** 표시 색(마젠타). R과 B가 같아 RGB↔BGR 바꿔 읽어도 같은 색이다. */
export const ORIENTATION_MARK_COLOR = '#ff00ff';

/** 표시 크기(짧은 쪽 길이 기준)와 구석에서 띄우는 거리 */
export const ORIENTATION_MARK_SIZE = 0.05;
export const ORIENTATION_MARK_INSET = 0.012;

/** 표시를 찾는 구석 넓이(가로·세로 각각 이 비율만큼) */
export const ORIENTATION_SAMPLE = 0.12;

/** 분홍 점으로 셀 기준(RGBA 한 점) */
export function isMarkPixel(r: number, g: number, b: number): boolean {
  return r > 150 && b > 150 && g < 100;
}

export interface MirrorFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

/** 구석 한 곳의 분홍 점 개수 */
function countMark(frame: MirrorFrame, fromX: number, toX: number, toY: number): number {
  const { width, data } = frame;
  let found = 0;
  for (let y = 0; y < toY; y += 1) {
    const row = y * width * 4;
    for (let x = fromX; x < toX; x += 1) {
      const index = row + x * 4;
      if (isMarkPixel(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0)) {
        found += 1;
      }
    }
  }
  return found;
}

/**
 * 넘어온 이미지가 우리가 그린 재생 화면의 거울상인지.
 * @returns true = 좌우가 뒤집힘, false = 그대로, null = 모름(표시를 못 찾음 — 이전 판단을 그대로 쓴다)
 */
export function detectMirroredFrame(frame: MirrorFrame): boolean | null {
  const { width, height, data } = frame;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data.length < width * height * 4) {
    return null;
  }
  const sampleWidth = Math.max(1, Math.round(width * ORIENTATION_SAMPLE));
  const sampleHeight = Math.max(1, Math.round(height * ORIENTATION_SAMPLE));
  const left = countMark(frame, 0, Math.min(sampleWidth, width), Math.min(sampleHeight, height));
  const right = countMark(frame, Math.max(0, width - sampleWidth), width, Math.min(sampleHeight, height));
  const enough = 4;
  if (left >= enough && left > right * 2) {
    return false;
  }
  if (right >= enough && right > left * 2) {
    return true;
  }
  return null;
}

/** 좌우 이름을 바꾼다(Left ↔ Right, 분류 번호도 함께). 이름이 둘 중 하나가 아니면 그대로 둔다. */
export function mirrorHandedness(handedness: SyntheticHandedness): SyntheticHandedness {
  if (handedness.label === 'Left') {
    return { ...handedness, label: 'Right', index: 1 };
  }
  if (handedness.label === 'Right') {
    return { ...handedness, label: 'Left', index: 0 };
  }
  return handedness;
}

/** 손 좌표를 좌우로 뒤집는다(x → 1 - x, z는 그대로). 새 배열을 돌려주고 원본은 건드리지 않는다. */
export function mirrorHands(hands: readonly SyntheticHand[]): SyntheticHand[] {
  return hands.map((hand) => ({
    landmarks: hand.landmarks.map(([x, y, z]) => [flip(x), y, z] as const),
    handedness: mirrorHandedness(hand.handedness),
  }));
}

function flip(x: number): number {
  return Math.round((1 - x) * 1e4) / 1e4;
}

let cachedFacePairs: readonly number[] | null = null;

/**
 * 얼굴 478점의 좌우 짝(거울에 비친 번호) — 합성 얼굴의 기본 자리(synthetic-face.ts baseFace — 겉테두리·눈·입을 좌우 대칭으로 놓고
 * 진짜 얼굴 그물 연결표로 편 것)에서 한 번만 계산한다. 가운데 선의 점(x = 0)은 자기 자신, 나머지는 거울 자리가 가까운 것부터
 * 서로 한 번씩만 짝을 맺는다(가장 가까운 것만 고르면 눈가 몇 쌍이 어긋난다). 결과는 33↔263, 133↔362, 234↔454, 78↔308, 468↔473처럼
 * MediaPipe 얼굴 그물의 알려진 좌우 짝과 같다(tests/unit/mediapipe/mirror.test.ts — 2026-09-25 Phase 5 통합, 구역 b1 요청 8).
 */
export function faceMirrorPairs(): readonly number[] {
  if (cachedFacePairs) {
    return cachedFacePairs;
  }
  const { xy } = baseFace();
  const pair = new Array<number>(xy.length).fill(-1);
  const left: number[] = [];
  const right: number[] = [];
  xy.forEach(([x], index) => {
    if (Math.abs(x) < 1e-6) {
      pair[index] = index;
    } else if (x < 0) {
      left.push(index);
    } else {
      right.push(index);
    }
  });
  const candidates: [number, number, number][] = [];
  for (const i of left) {
    for (const j of right) {
      // i를 거울에 비친 자리(-x, y)와 j 사이의 거리
      candidates.push([Math.hypot(xy[j]![0] + xy[i]![0], xy[j]![1] - xy[i]![1]), i, j]);
    }
  }
  candidates.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (const [, i, j] of candidates) {
    if (pair[i]! < 0 && pair[j]! < 0) {
      pair[i] = j;
      pair[j] = i;
    }
  }
  // 짝을 못 찾은 점(좌우 개수가 다를 때)은 자기 자신으로 둔다
  cachedFacePairs = Object.freeze(pair.map((value, index) => (value < 0 ? index : value)));
  return cachedFacePairs;
}

/**
 * 얼굴 좌표를 좌우로 뒤집는다: x → 1 - x, 그리고 **왼쪽·오른쪽 점 번호를 서로 바꾼다**(33 ↔ 263, 234 ↔ 454 …).
 * 진짜 모델은 뒤집힌 영상에서도 사진 왼쪽 눈을 33번 무리로 부른다(거울 영상도 그럴듯한 얼굴이라 그대로 맞춘다) — 자세의 왼팔·오른팔 이름을
 * 바꾸는 mirrorPoses와 같은 까닭이다. 번호를 바꾸지 않던 때(2026-09-25 전)에는 234번을 가면의 왼쪽 끝으로 쓰는 1-3-3 심화(f039)에서
 * 재생 입력의 가면이 얼굴 옆에 그려졌다.
 */
export function mirrorFaces(faces: readonly SyntheticFace[]): SyntheticFace[] {
  const pair = faceMirrorPairs();
  return faces.map((face) => ({
    ...face,
    landmarks: face.landmarks.map((_point, index) => {
      const source = pair[index] ?? index;
      const [x, y, z] = face.landmarks[source < face.landmarks.length ? source : index]!;
      return [flip(x), y, z] as const;
    }),
    box: { ...face.box, xmin: Math.round((1 - face.box.xmin - face.box.width) * 1e4) / 1e4 },
  }));
}

/**
 * 자세 좌표를 좌우로 뒤집는다: x → 1 - x, 그리고 **왼쪽·오른쪽 관절 번호를 서로 바꾼다**(LEFT_SHOULDER ↔ RIGHT_SHOULDER …).
 * 진짜 모델도 뒤집힌 영상에서는 그 사람의 왼팔을 오른팔로 부르기 때문이다(거울 영상 가정).
 */
export function mirrorPoses(poses: readonly SyntheticPose[]): SyntheticPose[] {
  return poses.map((body) => {
    const flipped = body.landmarks.map(([x, y, z, visibility]) => [flip(x), y, z, visibility] as const);
    const swapped = [...flipped];
    for (const [left, right] of POSE_MIRROR_PAIRS) {
      swapped[left] = flipped[right]!;
      swapped[right] = flipped[left]!;
    }
    return { ...body, landmarks: swapped };
  });
}
