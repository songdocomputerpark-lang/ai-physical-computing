// 합성 자세 좌표(src/lab/modules/mediapipe/synthetic-pose.ts)가 교재 예제의 판정을 실제로 바꾸는지 검사한다(PLAN §8.2 P2-09).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { POSE_CONNECTIONS } from '../../../src/lab/modules/mediapipe/face-connections.ts';
import { mirrorPoses } from '../../../src/lab/modules/mediapipe/mirror.ts';
import {
  POSE_KEY_LANDMARKS,
  POSE_LANDMARK_COUNT,
  POSE_LANDMARK_NAMES,
  POSE_MIRROR_PAIRS,
  POSE_SEQUENCE_IDS,
  SYNTHETIC_POSE_VERSION,
  generatePoseSequence,
  generatePoseSequences,
  leftWristY,
  shoulderDiffPx,
} from '../../../src/lab/modules/mediapipe/synthetic-pose.ts';

const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/landmarks/face-pose.json'), 'utf8')) as {
  version: { face: number; pose: number };
  pose: { id: string; sum: number; frames: number; samples: { frame: number; points: Record<string, [number, number]> | null }[] }[];
};

const bodies = (id: (typeof POSE_SEQUENCE_IDS)[number]) => generatePoseSequence(id).frames.map((frame) => frame.poses[0]!);

describe('자세 33점', () => {
  it('점이 33개이고 이름표도 33개다', () => {
    expect(POSE_LANDMARK_COUNT).toBe(33);
    expect(POSE_LANDMARK_NAMES).toHaveLength(33);
    expect(POSE_LANDMARK_NAMES[0]).toBe('NOSE');
    expect(POSE_LANDMARK_NAMES[11]).toBe('LEFT_SHOULDER');
    expect(POSE_LANDMARK_NAMES[15]).toBe('LEFT_WRIST');
    expect(bodies('pose-raise')[0]!.landmarks).toHaveLength(33);
  });

  it('MediaPipe 연결표와 뼈대가 맞는다(어깨-팔꿈치-손목, 어깨-엉덩이)', () => {
    const has = (a: number, b: number) => POSE_CONNECTIONS.some(([start, end]) => (start === a && end === b) || (start === b && end === a));
    expect(has(11, 13)).toBe(true);
    expect(has(13, 15)).toBe(true);
    expect(has(11, 12)).toBe(true);
    expect(has(11, 23)).toBe(true);
    expect(has(23, 24)).toBe(true);
    // 이어진 두 점은 화면에서도 가깝다(뼈대가 뒤엉키지 않았다)
    const landmarks = bodies('pose-raise')[0]!.landmarks;
    for (const [start, end] of POSE_CONNECTIONS) {
      const [ax, ay] = landmarks[start]!;
      const [bx, by] = landmarks[end]!;
      expect(Math.hypot(ax - bx, ay - by), `${start}-${end}`).toBeLessThan(0.45);
    }
  });

  it('사람의 왼쪽(LEFT_*)은 사진의 오른쪽에 있다(마주 본 모습)', () => {
    const landmarks = bodies('pose-raise')[0]!.landmarks;
    expect(landmarks[11]![0]).toBeGreaterThan(landmarks[12]![0]);
    expect(landmarks[23]![0]).toBeGreaterThan(landmarks[24]![0]);
  });

  it('화면 밖 다리는 visibility가 0.5보다 작다 — draw_landmarks가 건너뛴다', () => {
    const landmarks = bodies('pose-tilt')[0]!.landmarks;
    for (const index of [25, 26, 27, 28, 29, 30, 31, 32]) {
      expect(landmarks[index]![3], POSE_LANDMARK_NAMES[index]).toBeLessThan(0.5);
    }
    for (const index of [0, 11, 12, 13, 14, 15, 16, 23, 24]) {
      expect(landmarks[index]![3], POSE_LANDMARK_NAMES[index]).toBeGreaterThanOrEqual(0.5);
    }
    // 잘 보이는 점은 모두 화면 안(0~1)이라 그려진다
    const visible = landmarks.filter((point) => point[3]! >= 0.5);
    expect(visible.every(([x, y]) => x > 0 && x < 1 && y > 0 && y < 1)).toBe(true);
  });
});

describe('교재 예제의 판정이 재생 입력에서 바뀐다', () => {
  it('손 들기: 교과서 1-4-1 심화(f041)의 왼손 y가 0.3 아래로 내려간다(Success!)', () => {
    const values = bodies('pose-raise').map((body) => leftWristY(body.landmarks));
    expect(values[0]).toBeGreaterThan(0.6);
    expect(Math.min(...values)).toBeLessThan(0.3);
    expect(values.filter((value) => value < 0.3).length).toBeGreaterThanOrEqual(5);
  });

  it('손 들기에서는 어깨가 거의 수평이라 자세 경고가 뜨지 않는다', () => {
    expect(Math.max(...bodies('pose-raise').map((body) => shoulderDiffPx(body.landmarks)))).toBeLessThan(40);
  });

  it('어깨 기울이기: 교과서 1-4-2(f042·f043)의 어깨 차이가 40픽셀을 넘었다 돌아온다', () => {
    const values = bodies('pose-tilt').map((body) => shoulderDiffPx(body.landmarks));
    expect(Math.min(...values)).toBeLessThan(10);
    expect(Math.max(...values)).toBeGreaterThan(40);
    expect(values.filter((value) => value > 40).length).toBeGreaterThanOrEqual(5);
  });

  it('어깨 기울이기에서는 손을 들지 않는다', () => {
    expect(Math.min(...bodies('pose-tilt').map((body) => leftWristY(body.landmarks)))).toBeGreaterThan(0.3);
  });
});

describe('좌우 뒤집기', () => {
  it('영상을 뒤집으면 좌표가 뒤집히고 왼쪽·오른쪽 관절 번호도 바뀐다', () => {
    const body = bodies('pose-raise')[20]!;
    const [flipped] = mirrorPoses([body]);
    expect(flipped!.landmarks[11]![0]).toBeCloseTo(1 - body.landmarks[12]![0], 4);
    expect(flipped!.landmarks[15]![1]).toBeCloseTo(body.landmarks[16]![1], 4);
    // 왼손을 든 사람을 뒤집어 보면 '오른손을 든 사람'으로 보인다
    expect(flipped!.landmarks[16]![1]).toBeLessThan(flipped!.landmarks[15]![1]);
    expect(POSE_MIRROR_PAIRS.length).toBe(16);
  });
});

describe('되풀이 가능·픽스처와 같음', () => {
  it('같은 동작을 다시 만들면 좌표가 똑같다', () => {
    expect(generatePoseSequence('pose-tilt').frames[9]).toEqual(generatePoseSequence('pose-tilt').frames[9]);
  });

  it('픽스처(scripts/gen-landmarks.mjs)와 같다 — 다르면 스크립트를 다시 돌린다', () => {
    expect(fixture.version.pose).toBe(SYNTHETIC_POSE_VERSION);
    for (const sequence of generatePoseSequences()) {
      const saved = fixture.pose.find((item) => item.id === sequence.id);
      expect(saved, `${sequence.id} 기록이 픽스처에 없어요 — node scripts/gen-landmarks.mjs`).toBeDefined();
      expect(saved!.frames).toBe(sequence.frames.length);
      const sum =
        Math.round(
          sequence.frames.reduce(
            (total, frame) => total + frame.poses.reduce((one, body) => one + body.landmarks.reduce((value, [x, y, z]) => value + x + y + z, 0), 0),
            0,
          ) * 1e4,
        ) / 1e4;
      expect(sum, `${sequence.id} 좌표 합계가 달라요 — node scripts/gen-landmarks.mjs`).toBeCloseTo(saved!.sum, 3);
      for (const sample of saved!.samples) {
        const body = sequence.frames[sample.frame]!.poses[0]!;
        for (const key of POSE_KEY_LANDMARKS) {
          expect([body.landmarks[key]![0], body.landmarks[key]![1]], `${sequence.id} ${sample.frame}장 ${key}번`).toEqual(sample.points![String(key)]);
        }
      }
    }
  });
});
