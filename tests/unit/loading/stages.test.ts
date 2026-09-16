// 단계별 진행률 모으기(src/lab/loader/stages.ts) 단위 테스트 — P2-05.
import { describe, expect, it } from 'vitest';
import { PYODIDE_CORE_BYTES, pyodideCdnUrl, pyodideSiteUrl } from '../../../src/lab/loader/pyodide-files.ts';
import { LoadingTracker, knownStageBytes, stageIdForUrl, stageLabel } from '../../../src/lab/loader/stages.ts';
import { SW_MESSAGE, type DownloadMessage } from '../../../src/lab/loader/constants.ts';

const ORIGIN = 'https://songdocomputerpark-lang.github.io';
const NUMPY = 'numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl';
const OPENCV = 'opencv_python-4.11.0.86-cp314-cp314-pyemscripten_2026_0_wasm32.whl';

function download(url: string, state: DownloadMessage['state'], received: number, total: number | null, from: DownloadMessage['from'] = 'cdn'): DownloadMessage {
  return { type: SW_MESSAGE.download, url, state, received, total, from };
}

function tracker(): LoadingTracker {
  let clock = 0;
  return new LoadingTracker({ origin: ORIGIN, now: () => (clock += 100) });
}

describe('stageIdForUrl', () => {
  it('Pyodide 코어 파일은 core', () => {
    expect(stageIdForUrl(pyodideCdnUrl('pyodide.asm.wasm'), ORIGIN)).toBe('core');
    expect(stageIdForUrl(pyodideSiteUrl('python_stdlib.zip', ORIGIN), ORIGIN)).toBe('core');
  });

  it('표에 있는 휠은 패키지 이름', () => {
    expect(stageIdForUrl(pyodideCdnUrl(NUMPY), ORIGIN)).toBe('numpy');
    expect(stageIdForUrl(pyodideSiteUrl(OPENCV, ORIGIN), ORIGIN)).toBe('opencv-python');
  });

  it('표에 없는 휠도 파일 이름에서 패키지를 알아낸다', () => {
    expect(stageIdForUrl(pyodideCdnUrl('scikit_learn-1.7.0-cp314-none-any.whl'), ORIGIN)).toBe('scikit-learn');
  });

  it('같은 사이트 모델·MediaPipe 파일은 models', () => {
    expect(stageIdForUrl(`${ORIGIN}/ai-physical-computing/models/hand_landmarker.task`, ORIGIN)).toBe('models');
    expect(stageIdForUrl(`${ORIGIN}/ai-physical-computing/vendor/mediapipe/0.10.35/wasm/a.wasm`, ORIGIN)).toBe('models');
  });

  it('그 밖의 주소와 검색어가 붙은 살핌 주소는 단계가 없다', () => {
    expect(stageIdForUrl(`${ORIGIN}/ai-physical-computing/index.html`, ORIGIN)).toBeNull();
    expect(stageIdForUrl(`${pyodideCdnUrl('pyodide.mjs')}?probe=1`, ORIGIN)).toBeNull();
  });

  it('이름표와 아는 크기', () => {
    expect(stageLabel('core')).toContain('파이썬 엔진');
    expect(stageLabel('pandas')).toBe('pandas(파이썬 패키지)');
    expect(knownStageBytes('core')).toBe(PYODIDE_CORE_BYTES);
    expect(knownStageBytes('numpy')).toBe(2_960_568);
    expect(knownStageBytes('pandas')).toBeNull();
  });
});

describe('LoadingTracker', () => {
  it('아무 일도 없으면 idle', () => {
    const snapshot = tracker().snapshot();
    expect(snapshot.phase).toBe('idle');
    expect(snapshot.stages[0]?.id).toBe('core');
    expect(snapshot.text).toBe('');
  });

  it('실행기 상태만으로도 단계가 시작·끝난다(첫 방문, 바이트 모름)', () => {
    const track = tracker();
    track.runtimeState('loading');
    let snapshot = track.snapshot();
    expect(snapshot.phase).toBe('loading');
    expect(snapshot.stages[0]?.state).toBe('active');
    // 표에서 아는 크기로 "약 13.5MB"를 보여 준다(estimated).
    expect(snapshot.stages[0]?.estimated).toBe(true);
    expect(snapshot.stages[0]?.total).toBe(PYODIDE_CORE_BYTES);
    track.runtimeState('idle');
    snapshot = track.snapshot();
    expect(snapshot.stages[0]?.state).toBe('done');
    expect(snapshot.phase).toBe('ready');
  });

  it('서비스 워커 메시지로 받은 양과 진행률이 채워진다', () => {
    const track = tracker();
    track.runtimeState('loading');
    track.download(download(pyodideCdnUrl('pyodide.asm.wasm'), 'start', 0, 9_598_218));
    track.download(download(pyodideCdnUrl('pyodide.asm.wasm'), 'progress', 4_799_109, 9_598_218));
    const snapshot = track.snapshot();
    const core = snapshot.stages.find((stage) => stage.id === 'core');
    expect(core?.received).toBe(4_799_109);
    expect(core?.total).toBe(PYODIDE_CORE_BYTES);
    expect(core?.estimated).toBe(false);
    expect(snapshot.percent).toBe(Math.round((4_799_109 / PYODIDE_CORE_BYTES) * 100));
    expect(snapshot.source).toBe('cdn');
    expect(snapshot.text).toContain('파이썬 엔진');
  });

  it('패키지 단계는 실행기 progress로 시작·끝난다', () => {
    const track = tracker();
    track.runtimeState('loading');
    track.runtimeState('idle');
    track.runtimeProgress({ stage: 'package', phase: 'start', names: ['numpy', 'opencv-python'] });
    let snapshot = track.snapshot();
    expect(snapshot.stages.map((stage) => stage.id)).toEqual(['core', 'numpy', 'opencv-python']);
    expect(snapshot.stages[1]?.state).toBe('active');
    expect(snapshot.stages[2]?.total).toBe(10_675_764);
    track.runtimeProgress({ stage: 'package', phase: 'done', names: ['numpy', 'opencv-python'] });
    snapshot = track.snapshot();
    expect(snapshot.stages.every((stage) => stage.state === 'done')).toBe(true);
    expect(snapshot.percent).toBe(100);
    expect(snapshot.phase).toBe('ready');
    expect(snapshot.text).toContain('준비 끝');
  });

  it('캐시에서 읽으면 source가 cache가 된다', () => {
    const track = tracker();
    track.runtimeState('loading');
    track.download(download(pyodideCdnUrl('pyodide.mjs'), 'cache', 17_931, 17_931, 'cache'));
    expect(track.snapshot().source).toBe('cache');
  });

  it('예비 경로로 바뀌면 그 단계의 위치가 site가 된다', () => {
    const track = tracker();
    track.runtimeState('loading');
    track.download(download(pyodideCdnUrl('pyodide.asm.wasm'), 'fallback', 0, 9_598_218, 'site'));
    const core = track.snapshot().stages.find((stage) => stage.id === 'core');
    expect(core?.from).toBe('site');
    expect(track.snapshot().source).toBe('site');
  });

  it('실행기가 알려 준 위치로도 어디서 받았는지 안다', () => {
    const track = tracker();
    track.runtimeState('loading');
    track.runtimeReady({ indexUrl: `${ORIGIN}/ai-physical-computing/vendor/pyodide/314.0.7/` });
    expect(track.snapshot().source).toBe('site');
  });

  it('다른 모듈이 알린 단계가 표에 더해진다', () => {
    const track = tracker();
    track.runtimeState('loading');
    track.stageEvent({ id: 'models', label: '손 인식 모델', state: 'active', received: 1_000_000, total: 7_819_105 });
    let snapshot = track.snapshot();
    const models = snapshot.stages.find((stage) => stage.id === 'models');
    expect(models?.label).toBe('손 인식 모델');
    expect(models?.percent).toBe(13);
    track.stageEvent({ id: 'models', label: '손 인식 모델', state: 'done' });
    snapshot = track.snapshot();
    expect(snapshot.stages.find((stage) => stage.id === 'models')?.state).toBe('done');
  });

  it('실행기가 실패하면 failed', () => {
    const track = tracker();
    track.runtimeState('loading');
    track.runtimeState('failed');
    const snapshot = track.snapshot();
    expect(snapshot.phase).toBe('failed');
    expect(snapshot.stages[0]?.state).toBe('failed');
    expect(snapshot.text).toContain('받지 못했어요');
  });

  it('단계가 아닌 주소는 무시한다', () => {
    const track = tracker();
    track.runtimeState('loading');
    track.download(download(`${ORIGIN}/ai-physical-computing/_astro/x.js`, 'done', 100, 100));
    expect(track.snapshot().stages).toHaveLength(1);
  });

  it('바이트를 셀 수 없는 방문은 백분율을 말하지 않는다(0%로 보이면 멈춘 줄 안다)', () => {
    const track = tracker();
    track.runtimeState('loading');
    const snapshot = track.snapshot();
    expect(snapshot.stages[0]?.estimated).toBe(true);
    expect(snapshot.percent).toBeNull(); // 막대는 "받는 중" 줄무늬
    expect(snapshot.text).toBe('파이썬 엔진(Pyodide) 받는 중… (약 12.9MB)');
  });

  it('바이트가 한 번이라도 오면 그때부터 백분율을 말한다', () => {
    const track = tracker();
    track.runtimeState('loading');
    track.download(download(pyodideCdnUrl('pyodide.asm.wasm'), 'progress', 1_000_000, 9_598_218));
    const snapshot = track.snapshot();
    expect(snapshot.stages[0]?.estimated).toBe(false);
    expect(snapshot.percent).toBe(Math.round((1_000_000 / PYODIDE_CORE_BYTES) * 100));
    expect(snapshot.text).toContain(' / ');
  });

  it('로딩 모듈이 늦게 붙어도(청크를 받는 동안) ready로 맞춘다', () => {
    const track = tracker();
    // loading 상태를 한 번도 못 보고 ready만 받은 경우
    track.runtimeState('idle');
    track.runtimeReady({ indexUrl: `${ORIGIN}/ai-physical-computing/vendor/pyodide/314.0.7/` });
    const snapshot = track.snapshot();
    expect(snapshot.phase).toBe('ready');
    expect(snapshot.stages[0]?.state).toBe('done');
    expect(snapshot.source).toBe('site');
  });
});
