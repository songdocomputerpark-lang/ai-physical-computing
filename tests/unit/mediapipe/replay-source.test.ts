// 재생 입력 소스(src/lab/modules/mediapipe/replay-source.ts)와 mediapipe 모듈 규약(manifest·저장 이름·합성 손 → 답 모양)을 검사한다.
// 캔버스가 없는 Node에서는 그리기 호출만 가짜 ctx로 세어 본다(실제 그림은 tests/e2e/lab-mediapipe-hands.spec.ts).
import { describe, expect, it } from 'vitest';
import { storageKey } from '../../../src/lib/storage.ts';
import { validateManifests } from '../../../src/lab/modules/manifests.ts';
import manifest from '../../../src/lab/modules/mediapipe/manifest.ts';
import { detectedFromSynthetic, SEQUENCE_STORAGE_NAME, REQUEST_DETECT, REQUEST_OPEN, SUPPORTED_SOLUTIONS } from '../../../src/lab/modules/mediapipe/index.ts';
import {
  DEFAULT_SEQUENCE_ID,
  REPLAY_SOURCE_ID,
  ReplaySource,
  registerReplaySource,
  replaySource,
} from '../../../src/lab/modules/mediapipe/replay-source.ts';
import { REPLAY_SEQUENCE_IDS } from '../../../src/lab/modules/mediapipe/sequences.ts';
import { findVisionSource, listVisionSources } from '../../../src/lab/vision/sources.ts';
import { generateHandSequence, HAND_SEQUENCE_IDS, SEQUENCE_FPS } from '../../../src/lab/modules/mediapipe/synthetic-hands.ts';
import { ORIENTATION_MARK_COLOR } from '../../../src/lab/modules/mediapipe/mirror.ts';

/** 캔버스 대신 부른 함수 이름만 적어 두는 가짜 ctx */
function fakeContext(): { calls: string[]; ctx: CanvasRenderingContext2D } {
  const calls: string[] = [];
  const noop = (name: string) => (...args: unknown[]) => {
    calls.push(`${name}(${args.length})`);
  };
  const ctx = {
    createRadialGradient: () => ({ addColorStop: noop('addColorStop') }),
    fillRect: noop('fillRect'),
    beginPath: noop('beginPath'),
    moveTo: noop('moveTo'),
    lineTo: noop('lineTo'),
    closePath: noop('closePath'),
    fill: noop('fill'),
    stroke: noop('stroke'),
    arc: noop('arc'),
    fillText: (text: string) => calls.push(`fillText:${text}`),
    set fillStyle(value: unknown) {
      calls.push(`fillStyle:${String(value)}`);
    },
    set strokeStyle(_value: unknown) {},
    set lineWidth(_value: unknown) {},
    set lineCap(_value: unknown) {},
    set lineJoin(_value: unknown) {},
    set font(_value: unknown) {},
    set textAlign(_value: unknown) {},
    set textBaseline(_value: unknown) {},
  } as unknown as CanvasRenderingContext2D;
  return { calls, ctx };
}

describe('mediapipe 모듈 규약', () => {
  it('manifest가 폴더 규약 검사를 통과한다(id·이름 접두·붙박이와 겹침 없음)', () => {
    expect(() => validateManifests({ '../modules/mediapipe/manifest.ts': manifest })).not.toThrow();
    expect(manifest.id).toBe('mediapipe');
    expect(manifest.labs).toEqual(['vision']);
    expect(manifest.shims).toEqual({ mediapipe: 'apc_mediapipe' });
    expect(manifest.requestKinds).toEqual([REQUEST_OPEN, REQUEST_DETECT]);
    for (const kind of manifest.requestKinds ?? []) {
      expect(kind.startsWith('mediapipe.')).toBe(true);
    }
  });

  it('지원하는 solution 네 가지(손·얼굴 그물·얼굴 검출·자세)', () => {
    expect([...SUPPORTED_SOLUTIONS]).toEqual(['hands', 'face_mesh', 'face_detection', 'pose']);
  });

  it('재생 동작 저장 이름이 모듈 저장 이름 규칙(ctx.storageName)과 같다 — [기록 지우기]가 함께 지운다', () => {
    expect(SEQUENCE_STORAGE_NAME).toBe(`module:${manifest.id}:replay-sequence`);
    expect(storageKey(SEQUENCE_STORAGE_NAME)).toBe('ai-physical-computing:module:mediapipe:replay-sequence');
  });
});

describe('합성 손 → 파이썬에 주는 답', () => {
  it('손 개수 상한(max_num_hands)을 지키고 worldLandmarks는 null이다', () => {
    const frame = generateHandSequence('two-hands').frames[0]!;
    expect(detectedFromSynthetic(frame.hands, 2)).toHaveLength(2);
    const one = detectedFromSynthetic(frame.hands, 1);
    expect(one).toHaveLength(1);
    expect(one[0]!.landmarks).toHaveLength(21);
    expect(one[0]!.worldLandmarks).toBeNull();
    expect(one[0]!.handedness).toMatchObject({ label: 'Right', index: 1 });
  });

  it('상한이 0이나 음수여도 한 손은 준다', () => {
    const frame = generateHandSequence('count').frames[0]!;
    expect(detectedFromSynthetic(frame.hands, 0)).toHaveLength(1);
  });

  it('손이 없는 장은 빈 목록(파이썬 쪽에서 None이 된다)', () => {
    expect(detectedFromSynthetic([], 2)).toEqual([]);
  });

  it('좌표는 그대로 복사된다(읽기 전용 배열을 바꾸지 않는다)', () => {
    const frame = generateHandSequence('count').frames[10]!;
    const copy = detectedFromSynthetic(frame.hands, 1);
    expect(copy[0]!.landmarks[8]).toEqual([...frame.hands[0]!.landmarks[8]!]);
    copy[0]!.landmarks[8]![0] = 9;
    expect(frame.hands[0]!.landmarks[8]![0]).not.toBe(9);
  });
});

describe('재생 입력 소스', () => {
  it('입력 소스 등록표에 kind replay로 한 번만 들어간다', () => {
    registerReplaySource();
    registerReplaySource();
    const found = listVisionSources().filter((source) => source.id === REPLAY_SOURCE_ID);
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe('replay');
    expect(findVisionSource(REPLAY_SOURCE_ID)).toBe(replaySource);
    expect(replaySource.isAvailable()).toBe(true);
    expect(replaySource.description).toContain('사람 영상 없음');
  });

  it('동작 목록이 손·얼굴·자세 전부이고 기본은 count', () => {
    const source = new ReplaySource();
    expect(source.sequenceId).toBe(DEFAULT_SEQUENCE_ID);
    expect(source.listSequences().map((item) => item.id)).toEqual([...REPLAY_SEQUENCE_IDS]);
    expect(source.listSequences()[0]!.frames).toBe(generateHandSequence('count').frames.length);
    expect(source.listSequences().map((item) => item.kind)).toEqual([
      'hands', 'hands', 'hands', 'hands', 'face', 'face', 'face', 'pose', 'pose',
    ]);
    expect(source.sequenceKind).toBe('hands');
  });

  it('파이썬이 얼굴·자세를 열면 그 종류의 동작으로 바꾼다(ensureKind)', () => {
    const source = new ReplaySource();
    expect(source.ensureKind('hands')).toBeNull();
    expect(source.ensureKind('face')).toBe('face-turn');
    expect(source.sequenceKind).toBe('face');
    expect(source.ensureKind('face')).toBeNull();
    expect(source.ensureKind('pose')).toBe('pose-raise');
    expect(source.currentPoses(0)).toHaveLength(1);
    expect(source.currentFaces(0)).toHaveLength(0);
  });

  it('동작을 바꾸면 처음부터 다시 재생하고, 모르는 id는 false', () => {
    const source = new ReplaySource();
    expect(source.setSequence('pinch')).toBe(true);
    expect(source.sequenceId).toBe('pinch');
    expect(source.setSequence('없는것')).toBe(false);
    expect(source.sequenceId).toBe('pinch');
    expect(source.lastFrameIndex).toBe(-1);
  });

  it('첫 grab 시각부터 15fps로 장이 넘어가고 끝나면 처음으로 돌아온다', () => {
    const source = new ReplaySource();
    const total = generateHandSequence('count').frames.length;
    expect(source.frameAt(1000).index).toBe(0);
    expect(source.frameAt(1000 + 1000 / SEQUENCE_FPS).index).toBe(1);
    expect(source.frameAt(1000 + (total * 1000) / SEQUENCE_FPS).index).toBe(0);
  });

  it('open → grab이 뼈대를 그리고 그 장의 손이 process()의 답이 된다', async () => {
    const source = new ReplaySource();
    const opened = await source.open({ width: 640, height: 480 });
    expect(opened.kind).toBe('replay');
    expect([opened.width, opened.height]).toEqual([640, 480]);
    expect(opened.fps).toBe(SEQUENCE_FPS);
    expect(source.isOpen).toBe(true);

    const { calls, ctx } = fakeContext();
    expect(opened.grab(ctx, 640, 480, 5000)).toBe(true);
    expect(source.lastFrameIndex).toBe(0);
    expect(calls.filter((call) => call.startsWith('arc'))).toHaveLength(21);
    expect(calls.some((call) => call.startsWith('fillText:재생 입력 · 손가락'))).toBe(true);
    expect(source.currentHands(5000)).toEqual(generateHandSequence('count').frames[0]!.hands);

    // 뒤의 장을 그리면 답도 그 장으로 바뀐다(화면 뼈대와 학생 코드가 겹친다)
    opened.grab(ctx, 640, 480, 5000 + 1000);
    expect(source.lastFrameIndex).toBe(SEQUENCE_FPS);
    expect(source.currentHands(0)).toEqual(generateHandSequence('count').frames[SEQUENCE_FPS]!.hands);

    expect(await opened.resize(320, 240)).toEqual({ width: 320, height: 240 });
    opened.close();
    expect(source.isOpen).toBe(false);
    expect(source.lastFrameIndex).toBe(-1);
  });

  it('아무것도 없는 장에는 안내 글에 "아무것도 없음"을 적는다(draw 시퀀스 앞부분)', async () => {
    const source = new ReplaySource();
    source.setSequence('draw');
    const opened = await source.open();
    const { calls, ctx } = fakeContext();
    opened.grab(ctx, 320, 240, 0);
    expect(calls.filter((call) => call.startsWith('arc'))).toHaveLength(0);
    expect(calls.some((call) => call.includes('아무것도 없음'))).toBe(true);
  });

  it('장마다 왼쪽 위에 방향 표시(분홍 세모)를 그린다 — cv2.flip을 알아채는 데 쓴다', async () => {
    const source = new ReplaySource();
    const opened = await source.open();
    for (const sequence of HAND_SEQUENCE_IDS) {
      source.setSequence(sequence);
      const { calls, ctx } = fakeContext();
      opened.grab(ctx, 640, 480, 0);
      expect(calls.filter((call) => call === `fillStyle:${ORIENTATION_MARK_COLOR}`), sequence).toHaveLength(1);
      // 손이 없는 장(draw 앞부분)에도 그린다 — 뒤집힘 판단이 끊기지 않게
      expect(calls[calls.length - 1], sequence).toBe('fill(0)');
    }
  });

  it('소스를 열지 않아도 handsAt으로 같은 시각의 좌표를 빌려 쓸 수 있다(샘플 입력 위에서)', () => {
    const source = new ReplaySource();
    expect(source.handsAt(0)).toEqual(generateHandSequence('count').frames[0]!.hands);
  });
});
