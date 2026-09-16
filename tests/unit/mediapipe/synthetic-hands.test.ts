// 합성 손 좌표 생성기(src/lab/modules/mediapipe/synthetic-hands.ts)와 픽스처(tests/fixtures/landmarks/hands.json)를 검사한다.
// PD-30: 사람 손을 찍은 데이터가 아니라 코드가 계산한 좌표라서 그대로 커밋할 수 있고, 브라우저·Node·Pyodide 테스트가 같은 값을 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLandmarksFixture, stringifyFixture, DEFAULT_OUTPUT } from '../../../scripts/gen-landmarks.mjs';
import {
  FINGER_JOINTS,
  FRAME_ASPECT,
  HAND_CONNECTIONS,
  HAND_SEQUENCE_IDS,
  HAND_SEQUENCE_INFO,
  SEQUENCE_FPS,
  SYNTHETIC_HANDS_VERSION,
  countExtendedFingers,
  extendedFingers,
  generateHandSequence,
  generateHandSequences,
  handLandmarks,
  isHandSequenceId,
  smoothstep,
} from '../../../src/lab/modules/mediapipe/synthetic-hands.ts';

const FIXTURE_PATH = path.join(process.cwd(), DEFAULT_OUTPUT);

describe('합성 손 좌표 생성기', () => {
  it('손 하나는 21개 점이고 x·y가 0~1 안에 있다', () => {
    const points = handLandmarks({ cx: 0.5, cy: 0.75, size: 0.36, angle: 0, label: 'Right', curls: [0, 0, 0, 0, 0] });
    expect(points).toHaveLength(21);
    for (const [x, y, z] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
      expect(Number.isFinite(z)).toBe(true);
    }
    // 손목(0)이 가장 아래, 중지 끝(12)이 가장 위 — 위로 편 손
    expect(points[0]![1]).toBeGreaterThan(points[12]![1]);
  });

  it('왼손은 오른손을 좌우로 뒤집은 모양이다(거울 셀카 기준)', () => {
    const pose = { cx: 0.5, cy: 0.8, size: 0.34, angle: 0, curls: [0, 0, 0, 0, 0] } as const;
    const right = handLandmarks({ ...pose, label: 'Right' });
    const left = handLandmarks({ ...pose, label: 'Left' });
    for (const index of [4, 8, 20]) {
      expect(left[index]![0]).toBeCloseTo(2 * 0.5 - right[index]![0], 3);
      expect(left[index]![1]).toBeCloseTo(right[index]![1], 6);
    }
  });

  it('주먹은 펴진 손가락 0개, 편 손은 5개(교안 f136과 같은 판별식)', () => {
    const fist = handLandmarks({ cx: 0.5, cy: 0.78, size: 0.36, angle: 0, label: 'Right', curls: [1, 1, 1, 1, 1] });
    const open = handLandmarks({ cx: 0.5, cy: 0.78, size: 0.36, angle: 0, label: 'Right', curls: [0, 0, 0, 0, 0] });
    expect(countExtendedFingers(fist)).toBe(0);
    expect(countExtendedFingers(open)).toBe(5);
    expect(extendedFingers(open)).toEqual([true, true, true, true, true]);
  });

  it('smoothstep은 0~1로 자르고 양 끝이 0·1이다', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(4)).toBe(1);
  });

  it('연결표는 21쌍이고 모든 번호가 0~20이며 손가락 관절 표와 어긋나지 않는다', () => {
    expect(HAND_CONNECTIONS).toHaveLength(21);
    for (const [from, to] of HAND_CONNECTIONS) {
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeLessThanOrEqual(20);
      expect(from).not.toBe(to);
    }
    expect(FINGER_JOINTS.flat()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(FRAME_ASPECT).toBeCloseTo(4 / 3, 6);
  });

  it('시퀀스 4개가 목록 순서대로 있고 장 수가 초×15와 같다', () => {
    const sequences = generateHandSequences();
    expect(sequences.map((sequence) => sequence.id)).toEqual([...HAND_SEQUENCE_IDS]);
    for (const sequence of sequences) {
      expect(sequence.fps).toBe(SEQUENCE_FPS);
      expect(sequence.frames).toHaveLength(Math.round(HAND_SEQUENCE_INFO[sequence.id].seconds * SEQUENCE_FPS));
      expect(sequence.label).toBe(HAND_SEQUENCE_INFO[sequence.id].label);
      for (const frame of sequence.frames) {
        for (const hand of frame.hands) {
          expect(hand.landmarks).toHaveLength(21);
          expect(hand.handedness.index).toBe(hand.handedness.label === 'Left' ? 0 : 1);
          expect(hand.handedness.score).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it('count 시퀀스는 펴진 손가락이 0개에서 5개까지 모두 나온다', () => {
    const counts = new Set(generateHandSequence('count').frames.map((frame) => countExtendedFingers(frame.hands[0]!.landmarks)));
    expect([...counts].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('pinch 시퀀스는 엄지 끝(4)과 검지 끝(8)의 거리가 크게 줄었다 늘어난다', () => {
    const distances = generateHandSequence('pinch').frames.map((frame) => {
      const [tx, ty] = frame.hands[0]!.landmarks[4]!;
      const [ix, iy] = frame.hands[0]!.landmarks[8]!;
      return Math.hypot(tx - ix, ty - iy);
    });
    const min = Math.min(...distances);
    const max = Math.max(...distances);
    expect(min).toBeLessThan(0.03);
    expect(max).toBeGreaterThan(0.1);
  });

  it('draw 시퀀스는 처음 0.4초가 손 없음이고(선 끊김) 그 뒤 검지 끝이 움직인다', () => {
    const frames = generateHandSequence('draw').frames;
    const empty = frames.filter((frame) => frame.hands.length === 0).length;
    expect(empty).toBe(Math.round(0.4 * SEQUENCE_FPS));
    expect(frames[0]!.hands).toEqual([]);
    const tips = frames.filter((frame) => frame.hands.length > 0).map((frame) => frame.hands[0]!.landmarks[8]!);
    const xs = tips.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3);
    // 검지만 펴져 있다
    expect(extendedFingers(tips.length > 0 ? frames.find((f) => f.hands.length > 0)!.hands[0]!.landmarks : [])[1]).toBe(true);
  });

  it('two-hands 시퀀스는 모든 장에 Left·Right가 한 개씩 있다', () => {
    for (const frame of generateHandSequence('two-hands').frames) {
      expect(frame.hands.map((hand) => hand.handedness.label).sort()).toEqual(['Left', 'Right']);
      // 거울 셀카 기준: 화면 오른쪽(x가 큰 쪽)이 'Right'
      const right = frame.hands.find((hand) => hand.handedness.label === 'Right')!;
      const left = frame.hands.find((hand) => hand.handedness.label === 'Left')!;
      expect(right.landmarks[0]![0]).toBeGreaterThan(left.landmarks[0]![0]);
    }
  });

  it('같은 값이 늘 나온다(난수 없음)', () => {
    expect(generateHandSequence('count')).toEqual(generateHandSequence('count'));
  });

  it('isHandSequenceId는 목록에 있는 id만 참', () => {
    expect(isHandSequenceId('count')).toBe(true);
    expect(isHandSequenceId('없는-것')).toBe(false);
    expect(isHandSequenceId(7)).toBe(false);
  });
});

describe('픽스처 tests/fixtures/landmarks/hands.json', () => {
  it('파일이 있고 판·fps·연결표가 생성기와 같다', () => {
    expect(fs.existsSync(FIXTURE_PATH)).toBe(true);
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as ReturnType<typeof buildLandmarksFixture>;
    expect(fixture.version).toBe(SYNTHETIC_HANDS_VERSION);
    expect(fixture.fps).toBe(SEQUENCE_FPS);
    expect(fixture.connections).toEqual(HAND_CONNECTIONS.map(([a, b]) => [a, b]));
    expect(fixture.sequences.map((sequence) => sequence.id)).toEqual([...HAND_SEQUENCE_IDS]);
  });

  it('픽스처 내용이 지금 생성기와 같다(다르면 node scripts/gen-landmarks.mjs 를 다시 돌린다)', () => {
    const current = stringifyFixture(buildLandmarksFixture());
    expect(fs.readFileSync(FIXTURE_PATH, 'utf8')).toBe(current);
  });

  it('사람 손 데이터가 아님을 파일에 적어 둔다(PD-30)', () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as { note: string; generator: string };
    expect(fixture.generator).toBe('scripts/gen-landmarks.mjs');
    expect(fixture.note).toContain('사람 손 촬영 데이터 아님');
  });
});
