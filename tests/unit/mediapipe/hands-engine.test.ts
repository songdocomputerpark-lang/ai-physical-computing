// 손 랜드마크 엔진(src/lab/modules/mediapipe/hands-engine.ts)의 순수 부분: 레거시 인자 → Tasks 옵션, 결과 변환, 상태 설명, 자체 호스팅 경로.
// 실제 추론(WASM·모델)은 브라우저 테스트(tests/e2e/lab-mediapipe-hands.spec.ts)와 운영자 확인 몫이다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HAND_TASK_OPTIONS,
  HAND_MODEL_PATH,
  HandEngine,
  MAX_NUM_HANDS,
  TASKS_VISION_VERSION,
  WASM_BASE_PATH,
  convertHandLandmarkerResult,
  describeEngineState,
  sameTaskOptions,
  taskOptionsFromLegacy,
} from '../../../src/lab/modules/mediapipe/hands-engine.ts';
import { siteConfig } from '../../../src/config/site.ts';

describe('레거시 Hands(...) 인자 → Tasks 옵션', () => {
  it('인자가 없으면 레거시 기본값(손 2개·신뢰도 0.5·영상 모드)을 쓴다 — Tasks 기본 numHands=1과 다르다', () => {
    expect(taskOptionsFromLegacy(null)).toEqual(DEFAULT_HAND_TASK_OPTIONS);
    expect(taskOptionsFromLegacy({})).toMatchObject({ numHands: 2, runningMode: 'VIDEO', minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  });

  it('static_image_mode=True면 IMAGE 모드, 아니면 VIDEO 모드', () => {
    expect(taskOptionsFromLegacy({ staticImageMode: true }).runningMode).toBe('IMAGE');
    expect(taskOptionsFromLegacy({ staticImageMode: false }).runningMode).toBe('VIDEO');
  });

  it('max_num_hands·신뢰도를 그대로 옮기고 model_complexity는 무시한다', () => {
    const options = taskOptionsFromLegacy({ maxNumHands: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.3, modelComplexity: 0 });
    expect(options).toMatchObject({ numHands: 1, minHandDetectionConfidence: 0.7, minTrackingConfidence: 0.3 });
    // Tasks에만 있는 값은 Tasks 기본(0.5) 고정
    expect(options.minHandPresenceConfidence).toBe(0.5);
  });

  it('교안 계단 10의 max_num_hands=3도 그대로, 범위 밖 값은 자른다', () => {
    expect(taskOptionsFromLegacy({ maxNumHands: 3 }).numHands).toBe(3);
    expect(taskOptionsFromLegacy({ maxNumHands: 99 }).numHands).toBe(MAX_NUM_HANDS);
    expect(taskOptionsFromLegacy({ maxNumHands: 0 }).numHands).toBe(1);
    expect(taskOptionsFromLegacy({ minDetectionConfidence: 5 }).minHandDetectionConfidence).toBe(1);
    expect(taskOptionsFromLegacy({ minDetectionConfidence: -1 }).minHandDetectionConfidence).toBe(0);
  });

  it('숫자가 아닌 값은 레거시 기본값으로 되돌린다', () => {
    expect(taskOptionsFromLegacy({ maxNumHands: '두 개', minTrackingConfidence: null })).toMatchObject({ numHands: 2, minTrackingConfidence: 0.5 });
  });

  it('sameTaskOptions는 다섯 값이 모두 같을 때만 참', () => {
    expect(sameTaskOptions(DEFAULT_HAND_TASK_OPTIONS, { ...DEFAULT_HAND_TASK_OPTIONS })).toBe(true);
    expect(sameTaskOptions(DEFAULT_HAND_TASK_OPTIONS, { ...DEFAULT_HAND_TASK_OPTIONS, numHands: 1 })).toBe(false);
    expect(sameTaskOptions(DEFAULT_HAND_TASK_OPTIONS, { ...DEFAULT_HAND_TASK_OPTIONS, runningMode: 'IMAGE' })).toBe(false);
  });
});

describe('Tasks 결과 → 레거시로 옮기기 쉬운 값', () => {
  const point = (x: number, y: number, z: number) => ({ x, y, z });

  it('손마다 landmarks·worldLandmarks·handedness를 짝지어 준다', () => {
    const hands = convertHandLandmarkerResult({
      landmarks: [[point(0.1, 0.2, -0.3)], [point(0.4, 0.5, 0.6)]],
      worldLandmarks: [[point(0.01, 0.02, 0.03)], [point(0.04, 0.05, 0.06)]],
      handedness: [[{ index: 1, score: 0.98, categoryName: 'Right', displayName: 'Right' }], [{ index: 0, score: 0.9, categoryName: 'Left', displayName: 'Left' }]],
    } as never);
    expect(hands).toHaveLength(2);
    expect(hands[0]).toEqual({ landmarks: [[0.1, 0.2, -0.3]], worldLandmarks: [[0.01, 0.02, 0.03]], handedness: { index: 1, score: 0.98, label: 'Right' } });
    expect(hands[1]!.handedness).toEqual({ index: 0, score: 0.9, label: 'Left' });
  });

  it('worldLandmarks·handedness가 없으면 null(파이썬 쪽이 None으로 바꾼다)', () => {
    const hands = convertHandLandmarkerResult({ landmarks: [[point(0, 0, 0)]], worldLandmarks: [], handedness: [] } as never);
    expect(hands[0]!.worldLandmarks).toBeNull();
    expect(hands[0]!.handedness).toBeNull();
  });

  it('손이 없으면 빈 목록', () => {
    expect(convertHandLandmarkerResult({ landmarks: [], worldLandmarks: [], handedness: [] } as never)).toEqual([]);
  });

  it('categoryName이 비어 있으면 displayName을 쓰고 번호는 Left=0·Right=1로 채운다', () => {
    const hands = convertHandLandmarkerResult({
      landmarks: [[point(0, 0, 0)]],
      worldLandmarks: [[]],
      handedness: [[{ index: -1, score: 0.7, categoryName: '', displayName: 'Left' }]],
    } as never);
    expect(hands[0]!.handedness).toEqual({ index: 0, score: 0.7, label: 'Left' });
  });
});

describe('자체 호스팅 경로(PD-02 — 외부 주소를 쓰지 않는다)', () => {
  it('설치된 @mediapipe/tasks-vision 판과 WASM 폴더 이름이 같다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@mediapipe/tasks-vision']).toBe(TASKS_VISION_VERSION);
  });

  it('WASM·모델 주소가 사이트 안(base 포함)이고 끝에 /가 없다', () => {
    expect(WASM_BASE_PATH).toBe(`${siteConfig.base}/vendor/mediapipe/${TASKS_VISION_VERSION}/wasm`);
    expect(WASM_BASE_PATH.endsWith('/')).toBe(false);
    expect(HAND_MODEL_PATH).toBe(`${siteConfig.base}/models/hand_landmarker.task`);
    for (const url of [WASM_BASE_PATH, HAND_MODEL_PATH]) {
      expect(url.startsWith('/')).toBe(true);
      expect(url).not.toMatch(/^https?:/u);
    }
  });

  it('WASM 글루 파일이 실제로 복사돼 있다(predev·prebuild의 scripts/vendor-assets.mjs)', () => {
    const wasmDir = path.join(process.cwd(), 'public', 'vendor', 'mediapipe', TASKS_VISION_VERSION, 'wasm');
    // 아직 npm run dev/build를 한 번도 돌리지 않은 컴퓨터에서는 없을 수 있다.
    if (!fs.existsSync(wasmDir)) {
      return;
    }
    expect(fs.readdirSync(wasmDir)).toEqual(expect.arrayContaining(['vision_wasm_internal.js', 'vision_wasm_internal.wasm']));
  });
});

describe('엔진 상태', () => {
  it('상태 설명이 모두 한국어 문장이다', () => {
    for (const state of ['idle', 'loading', 'ready', 'missing-model', 'failed'] as const) {
      const text = describeEngineState(state);
      expect(text.length).toBeGreaterThan(5);
      expect(text).toMatch(/[가-힣]/u);
    }
    expect(describeEngineState('ready', 'GPU')).toContain('GPU');
    expect(describeEngineState('missing-model')).toContain('재생 입력');
  });

  it('모델 파일이 없으면(404) missing-model이 되고 예외를 내지 않는다', async () => {
    const engine = new HandEngine({ fetchModel: () => Promise.resolve(new Response('', { status: 404 })) });
    expect(engine.state).toBe('idle');
    await expect(engine.load()).resolves.toBe('missing-model');
    expect(engine.detect({ width: 2, height: 2, data: new Uint8Array(16) }, 0)).toEqual([]);
    expect(engine.modelBytes).toBe(0);
  });

  it('자리 파일(너무 작은 파일)도 모델 없음으로 본다', async () => {
    const engine = new HandEngine({ fetchModel: () => Promise.resolve(new Response(new Uint8Array(10), { status: 200 })) });
    await expect(engine.load()).resolves.toBe('missing-model');
    expect(engine.detail).toContain('너무 작아요');
  });

  it('받기 자체가 실패하면 failed이고 이유가 남는다', async () => {
    const engine = new HandEngine({ fetchModel: () => Promise.reject(new Error('네트워크 끊김')) });
    await expect(engine.load()).resolves.toBe('failed');
    expect(engine.detail).toBe('네트워크 끊김');
  });

  it('상태가 바뀔 때마다 알림이 오고 해제할 수 있다', async () => {
    const engine = new HandEngine({ fetchModel: () => Promise.resolve(new Response('', { status: 404 })) });
    const seen: string[] = [];
    const off = engine.onStateChange((state) => seen.push(state));
    await engine.load();
    off();
    await engine.load();
    expect(seen).toEqual(['loading', 'missing-model']);
  });

  it('준비 전 configure는 기억만 하고 오류를 내지 않는다', async () => {
    const engine = new HandEngine({ fetchModel: () => Promise.resolve(new Response('', { status: 404 })) });
    await expect(engine.configure({ ...DEFAULT_HAND_TASK_OPTIONS, numHands: 1 })).resolves.toBeUndefined();
    expect(engine.options.numHands).toBe(1);
  });
});
