// 합성 얼굴 좌표(src/lab/modules/mediapipe/synthetic-face.ts)가 교재 예제의 판정을 실제로 바꾸는지 검사한다(PLAN §8.2 P2-09 완료 기준).
//
// 사람 얼굴 데이터가 아니라 코드가 만든 좌표라, "눈을 감으면 158·153이 가까워진다" 같은 성질을 여기서 숫자로 확인해야 한다.
// 픽스처(tests/fixtures/landmarks/face-pose.json)는 scripts/gen-landmarks.mjs가 만든 간추린 기록이고, 어긋나면 스크립트를 다시 돌린다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACE_CONNECTIONS } from '../../../src/lab/modules/mediapipe/face-connections.ts';
import { mirrorFaces } from '../../../src/lab/modules/mediapipe/mirror.ts';
import {
  FACE_KEY_LANDMARKS,
  FACE_LANDMARK_COUNT,
  FACE_MESH_LANDMARK_COUNT,
  FACE_SEQUENCE_IDS,
  SYNTHETIC_FACE_VERSION,
  baseFace,
  eyeClosed,
  faceBox,
  generateFaceSequence,
  generateFaceSequences,
  headDirection,
  mouthAspectRatio,
  walkGroups,
} from '../../../src/lab/modules/mediapipe/synthetic-face.ts';

const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/landmarks/face-pose.json'), 'utf8')) as {
  version: { face: number; pose: number };
  face: { id: string; sum: number; frames: number; samples: { frame: number; points: Record<string, [number, number]> | null }[] }[];
};

const first = (id: (typeof FACE_SEQUENCE_IDS)[number]) => generateFaceSequence(id).frames.map((frame) => frame.faces[0]!);

describe('얼굴 그물 자리 잡기', () => {
  it('점이 478개이고(그물 468 + 눈동자 10) 모두 화면 안에 있다', () => {
    const face = first('face-turn')[0]!;
    expect(face.landmarks).toHaveLength(FACE_LANDMARK_COUNT);
    expect(FACE_LANDMARK_COUNT - FACE_MESH_LANDMARK_COUNT).toBe(10);
    for (const [x, y] of face.landmarks) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(1);
    }
  });

  it('겹치는 점이 없다(그물이 한 점으로 뭉치지 않았다)', () => {
    const face = first('face-turn')[0]!;
    const keys = new Set(face.landmarks.map(([x, y]) => `${x},${y}`));
    expect(keys.size).toBe(FACE_LANDMARK_COUNT);
  });

  it('눈 고리의 위·아래 눈꺼풀 번호가 MediaPipe 표와 같다(교재 예제가 쓰는 158·153·385·380)', () => {
    // 고리 차례: 바깥 끝 → 아래 눈꺼풀 7개 → 안쪽 끝 → 위 눈꺼풀 7개
    const right = walkGroups(FACE_CONNECTIONS.FACEMESH_RIGHT_EYE)[0]!;
    const left = walkGroups(FACE_CONNECTIONS.FACEMESH_LEFT_EYE)[0]!;
    expect(right[0]).toBe(33);
    expect(right[8]).toBe(133);
    expect(right.slice(1, 8)).toEqual([7, 163, 144, 145, 153, 154, 155]);
    expect(right.slice(9)).toEqual([173, 157, 158, 159, 160, 161, 246]);
    expect(left[0]).toBe(263);
    expect(left[8]).toBe(362);
    expect(left.slice(1, 8)).toEqual([249, 390, 373, 374, 380, 381, 382]);
    expect(left.slice(9)).toEqual([398, 384, 385, 386, 387, 388, 466]);
  });

  it('입술 안쪽 고리는 13(위)·14(아래)가 마주 보고, 바깥 고리는 0(위)·17(아래)이다', () => {
    const rings = walkGroups(FACE_CONNECTIONS.FACEMESH_LIPS);
    const inner = rings.find((ring) => ring.includes(13))!;
    const outer = rings.find((ring) => ring.includes(0))!;
    expect(inner).toHaveLength(20);
    expect(outer).toHaveLength(20);
    const face = first('face-yawn')[0]!;
    const [, y13] = face.landmarks[13]!;
    const [, y14] = face.landmarks[14]!;
    const [, y0] = face.landmarks[0]!;
    const [, y17] = face.landmarks[17]!;
    expect(y13).toBeLessThan(y14); // 윗입술이 위
    expect(y0).toBeLessThan(y13);
    expect(y17).toBeGreaterThan(y14);
  });

  it('얼굴 방향이 맞다: 10 이마 · 152 턱 · 234 사진 왼쪽 볼 · 454 오른쪽 볼 · 1 코는 가운데', () => {
    const face = first('face-blink')[0]!;
    const [x10, y10] = face.landmarks[10]!;
    const [, y152] = face.landmarks[152]!;
    const [x234] = face.landmarks[234]!;
    const [x454] = face.landmarks[454]!;
    const [x1, y1] = face.landmarks[1]!;
    expect(y10).toBeLessThan(y152);
    expect(x234).toBeLessThan(x454);
    expect(Math.abs(x1 - x10)).toBeLessThan(0.01);
    expect(y1).toBeGreaterThan(y10);
    expect(y1).toBeLessThan(y152);
    // 두 눈은 좌우로 나뉜다(33 무리가 사진 왼쪽, 263 무리가 오른쪽)
    expect(face.landmarks[33]![0]).toBeLessThan(x1);
    expect(face.landmarks[263]![0]).toBeGreaterThan(x1);
  });

  it('깊이(z)는 코가 가장 앞이다(카메라 쪽이 음수)', () => {
    const face = first('face-blink')[0]!;
    const nose = face.landmarks[4]![2];
    expect(nose).toBeLessThan(face.landmarks[10]![2]);
    expect(nose).toBeLessThan(face.landmarks[234]![2]);
    expect(baseFace().depth[4]!).toBeGreaterThan(baseFace().depth[234]!);
  });

  it('얼굴 상자는 그물을 감싸고 0~1 안에 있다', () => {
    const face = first('face-turn')[10]!;
    const box = faceBox(face.landmarks);
    expect(box).toEqual(face.box);
    expect(box.xmin).toBeGreaterThanOrEqual(0);
    expect(box.ymin).toBeGreaterThanOrEqual(0);
    expect(box.xmin + box.width).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThan(0.1);
    expect(box.height).toBeGreaterThan(0.2);
  });
});

describe('교재 예제의 판정이 재생 입력에서 바뀐다', () => {
  it('눈 깜빡이기: 교안 계단 14(f122)의 눈 감김 판정이 켜졌다 꺼진다', () => {
    const closed = first('face-blink').map((face) => eyeClosed(face.landmarks));
    const count = closed.filter(Boolean).length;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThan(closed.length / 2);
    expect(closed[0]).toBe(false);
  });

  it('입 벌리기: 교과서 1-3-2(f037)의 MAR가 0.4를 5장 넘게 넘는다(하품으로 센다)', () => {
    const values = first('face-yawn').map((face) => mouthAspectRatio(face.landmarks));
    const over = values.filter((value) => value > 0.4);
    expect(Math.min(...values)).toBeLessThan(0.35);
    expect(Math.max(...values)).toBeGreaterThan(0.45);
    expect(over.length).toBeGreaterThanOrEqual(5);
    // 이어진 장이어야 CONSECUTIVE_FRAMES 조건이 맞는다
    const firstOver = values.findIndex((value) => value > 0.4);
    expect(values.slice(firstOver, firstOver + 5).every((value) => value > 0.4)).toBe(true);
  });

  it('입 벌리기 중에는 13·14(입술 안쪽)가 벌어지고 14·18이 멀어진다', () => {
    const faces = first('face-yawn');
    const gap = (face: (typeof faces)[number]) => face.landmarks[14]![1] - face.landmarks[13]![1];
    const chin = (face: (typeof faces)[number]) => face.landmarks[18]![1] - face.landmarks[14]![1];
    const closedFrame = faces[0]!;
    const openFrame = faces.reduce((best, face) => (gap(face) > gap(best) ? face : best), faces[0]!);
    expect(gap(openFrame)).toBeGreaterThan(gap(closedFrame) * 3);
    expect(chin(openFrame)).toBeGreaterThan(chin(closedFrame));
  });

  it('고개 돌리기: 교과서 1-3-1 심화(f035)의 방향이 Left·Center·Right를 모두 지난다', () => {
    const directions = first('face-turn').map((face) => headDirection(face.landmarks));
    expect(new Set(directions)).toEqual(new Set(['Left', 'Center', 'Right']));
    // 코(1)가 두 눈 가운데보다 크게 움직인다
    const noseX = first('face-turn').map((face) => face.landmarks[1]![0]);
    expect(Math.max(...noseX) - Math.min(...noseX)).toBeGreaterThan(0.08);
  });

  it('윙크·두 눈 감기: 4단원 얼굴 마우스(f104)의 EAR 0.1 판정이 0.4초 넘게 이어져 더블클릭 → 오른쪽 클릭 차례로 나온다', () => {
    // f104 calculate_ear와 같은 계산(640×480 정수 픽셀). LEFT_EYE_POINTS = 화면 왼쪽 눈(33쪽), RIGHT_EYE_POINTS = 263쪽.
    const LEFT_EYE_POINTS = [33, 160, 158, 133, 153, 144];
    const RIGHT_EYE_POINTS = [362, 385, 387, 263, 373, 380];
    const ear = (landmarks: readonly (readonly number[])[], points: readonly number[]) => {
      const p = points.map((index) => [Math.trunc(landmarks[index]![0]! * 640), Math.trunc(landmarks[index]![1]! * 480)] as const);
      const dist = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      return (dist(p[1]!, p[5]!) + dist(p[2]!, p[4]!)) / (2 * dist(p[0]!, p[3]!));
    };
    const stateOf = (list: readonly { landmarks: readonly (readonly number[])[] }[]) =>
      list.map((face) => {
        const left = ear(face.landmarks, LEFT_EYE_POINTS) <= 0.1;
        const right = ear(face.landmarks, RIGHT_EYE_POINTS) <= 0.1;
        return left && right ? 'both' : left ? 'left' : right ? 'right' : 'open';
      });
    // 이어진 구간(같은 상태가 몇 장 이어지나) — 15fps라 0.4초는 6장
    const closedRunsOf = (state: string[]) => {
      const runs: { state: string; frames: number }[] = [];
      for (const value of state) {
        const last = runs[runs.length - 1];
        if (last && last.state === value) last.frames += 1;
        else runs.push({ state: value, frames: 1 });
      }
      return runs.filter((run) => run.state !== 'open');
    };
    const faces = first('face-wink');
    // 4단원 예제는 cv2.flip(frame, 1) 뒤에 판정한다 — 재생 입력도 뒤집힌 영상이면 mirrorFaces로 번호까지 바꿔 준다(진짜 모델과 같게).
    // 그래서 뒤집은 좌표에서 코드의 LEFT_EYE_POINTS(33쪽, 화면 왼쪽 눈)가 먼저 감겨 더블클릭 → 두 눈으로 오른쪽 클릭이 된다.
    const mirroredState = stateOf(mirrorFaces(faces));
    const closedRuns = closedRunsOf(mirroredState);
    expect(closedRuns.map((run) => run.state)).toEqual(['left', 'both']);
    for (const run of closedRuns) {
      expect(run.frames / 15, run.state).toBeGreaterThan(0.6);
    }
    expect(mirroredState[0]).toBe('open');
    expect(mirroredState[mirroredState.length - 1]).toBe('open');
    // 뒤집지 않은 재생 화면에서는 사진 오른쪽 눈(263쪽)이 감긴다
    expect(closedRunsOf(stateOf(faces)).map((run) => run.state)).toEqual(['right', 'both']);
    // 코가 움직여 마우스도 움직인다
    const noseX = faces.map((face) => face.landmarks[1]![0]);
    expect(Math.max(...noseX) - Math.min(...noseX)).toBeGreaterThan(0.03);
  });

  it('고개를 돌려도 입은 다물고 눈은 뜬 채다(다른 판정이 끼어들지 않는다)', () => {
    const faces = first('face-turn');
    expect(faces.every((face) => mouthAspectRatio(face.landmarks) < 0.4)).toBe(true);
    expect(faces.every((face) => !eyeClosed(face.landmarks))).toBe(true);
  });
});

describe('되풀이 가능·픽스처와 같음', () => {
  it('같은 동작을 다시 만들면 좌표가 똑같다(난수 없음)', () => {
    const a = generateFaceSequence('face-yawn').frames[7]!.faces[0]!.landmarks;
    const b = generateFaceSequence('face-yawn').frames[7]!.faces[0]!.landmarks;
    expect(a).toEqual(b);
  });

  it('동작 4개가 15fps로 이어진다', () => {
    const sequences = generateFaceSequences();
    expect(sequences.map((sequence) => sequence.id)).toEqual([...FACE_SEQUENCE_IDS]);
    for (const sequence of sequences) {
      expect(sequence.fps).toBe(15);
      expect(sequence.frames.length).toBeGreaterThan(30);
      expect(sequence.frames.every((frame) => frame.faces.length === 1)).toBe(true);
    }
  });

  it('픽스처(scripts/gen-landmarks.mjs)와 같다 — 다르면 스크립트를 다시 돌린다', () => {
    expect(fixture.version.face).toBe(SYNTHETIC_FACE_VERSION);
    for (const sequence of generateFaceSequences()) {
      const saved = fixture.face.find((item) => item.id === sequence.id);
      expect(saved, `${sequence.id} 기록이 픽스처에 없어요 — node scripts/gen-landmarks.mjs`).toBeDefined();
      expect(saved!.frames).toBe(sequence.frames.length);
      const sum =
        Math.round(
          sequence.frames.reduce(
            (total, frame) => total + frame.faces.reduce((one, face) => one + face.landmarks.reduce((value, [x, y, z]) => value + x + y + z, 0), 0),
            0,
          ) * 1e4,
        ) / 1e4;
      expect(sum, `${sequence.id} 좌표 합계가 달라요 — node scripts/gen-landmarks.mjs`).toBeCloseTo(saved!.sum, 3);
      for (const sample of saved!.samples) {
        const face = sequence.frames[sample.frame]!.faces[0]!;
        for (const key of FACE_KEY_LANDMARKS) {
          expect([face.landmarks[key]![0], face.landmarks[key]![1]], `${sequence.id} ${sample.frame}장 ${key}번`).toEqual(sample.points![String(key)]);
        }
      }
    }
  });
});
