// cv2 카메라·창 흉내 모듈(src/lab/python/apc_cv2.py)을 Node.js의 실제 Pyodide 314.0.7 + opencv-python 4.11.0.86으로 검사한다
// (PLAN §8.2 P2-03, PD-14). JSPI는 --experimental-wasm-jspi로 켜서 따로 띄운다(tests/unit/lab/helpers/pyodide-cv2-run.mjs).
// opencv 휠은 처음 한 번 jsDelivr에서 받아 .cache/pyodide-packages/에 저장한다(약 14MB). 받지 못하면(네트워크 없음) 건너뛴다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'lab', 'helpers', 'pyodide-cv2-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

interface ShowEvent {
  kind: string;
  name: string | null;
  transferred: number;
  width?: number;
  height?: number;
  bytes?: number;
  dataType?: string;
  white?: number;
  transferBytes?: number | null;
}

interface StepRecord {
  ms: number;
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stopped: boolean;
  stdout: string;
  events: ShowEvent[];
  reads?: number;
}

interface RunOutput {
  skipped?: string;
  loadedPackages: string[];
  canRunSync: boolean;
  shimsInstalled: string[];
  shimsInstalledAgain: string[];
  patched: boolean[];
  steps: Record<string, StepRecord>;
  events: ShowEvent[];
  notices: string[];
  reads: number;
  released?: number;
  /** 동기 진입점(runPython)에서 poll·get을 불렀을 때 'ok' 또는 오류 마지막 줄 */
  syncEntrypointPoll: string;
  pendingRequests: number;
}

function runNode(): RunOutput {
  const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', SCRIPT, ROOT], { encoding: 'utf8', timeout: 240_000, cwd: ROOT });
  const lines = result.stdout.trim().split('\n');
  const last = lines[lines.length - 1] ?? '';
  expect(result.status, `${result.stderr.slice(-3000)}\n${result.stdout.slice(-2000)}`).toBe(0);
  return JSON.parse(last) as RunOutput;
}

describe('cv2 흉내 모듈 파일', () => {
  it('덮어쓰는 이름 목록에 CODE_MAPPING §3.1의 필수 API가 모두 있고, 등록표(apc_shims.py)가 cv2를 가리킨다', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src', 'lab', 'python', 'apc_cv2.py'), 'utf8');
    for (const name of ['VideoCapture', 'imshow', 'waitKey', 'namedWindow', 'getWindowProperty', 'destroyAllWindows', 'destroyWindow', 'setWindowProperty']) {
      expect(source, name).toContain(`"${name}",`);
    }
    const shims = fs.readFileSync(path.join(ROOT, 'src', 'lab', 'python', 'apc_shims.py'), 'utf8');
    expect(shims).toContain('"cv2": "apc_cv2"');
  });
});

describe.runIf(pyodideInstalled && nodeHasJspi)('Node.js의 실제 Pyodide + opencv-python', () => {
  it(
    'cv2의 카메라·창 함수가 사이트 것으로 바뀌고, 첫 실습 예제가 시험 입력으로 돌아 테두리 영상을 화면에 보낸다',
    (context) => {
      const out = runNode();
      if (out.skipped) {
        console.warn(`[pyodide-cv2] 건너뜀: ${out.skipped}`);
        context.skip();
        return;
      }
      expect(out.loadedPackages).toEqual(['numpy', 'opencv-python']);
      expect(out.canRunSync).toBe(true);
      expect(out.shimsInstalled).toEqual(['cv2']);
      expect(out.shimsInstalledAgain).toEqual(['cv2']);
      // [VideoCapture 바뀜, imshow 바뀜, waitKey 바뀜, 원래 imshow는 다른 함수, 오타 이름은 없음]
      expect(out.patched).toEqual([true, true, true, true, false]);

      // 첫 실습 예제: 5장 읽은 뒤 q 키 → 정상 종료, edges 창에 흰 테두리 픽셀이 있다.
      // camera.release 요청은 이 예제의 cap.release()와 아래 cap_props 단계의 cap.release()로 모두 2번 온다.
      const example = out.steps.first_edge_example;
      expect(example.errorType, example.errorMessage).toBeUndefined();
      expect(example.stopped).toBe(false);
      expect(example.reads).toBeGreaterThanOrEqual(5);
      expect(out.released).toBe(2);
      const shows = example.events.filter((event) => event.kind === 'window.show' && event.name === 'edges');
      expect(shows.length).toBeGreaterThanOrEqual(4);
      for (const show of shows) {
        expect(show.width).toBe(64);
        expect(show.height).toBe(48);
        expect(show.bytes).toBe(64 * 48 * 4);
        expect(show.dataType).toBe('Uint8Array');
        expect(show.transferred).toBe(1);
        expect(show.transferBytes).toBe(64 * 48 * 4); // 영상 바이트의 버퍼가 옮기기(transfer) 목록에 들어간다(복사 없이 옮기려고)
        expect(show.white).toBeGreaterThan(0);
        expect(show.white).toBeLessThan((64 * 48) / 2);
      }
      expect(example.events.filter((event) => event.kind === 'window.close').length).toBe(1);

      // 창 속성
      expect(out.steps.window_props.value).toEqual([1, -1]);
      expect(out.steps.window_props.events.map((event) => event.kind)).toContain('window.open');
      expect(out.steps.window_closed.value).toBe(0); // 실행 중에 화면에서 창을 닫으면 0.0
      expect(out.steps.stale_keys_cleared.value).toBe(-1); // 실행 전에 들어온 키는 reset_for_run이 비운다
      // 초기화 함수는 동기 진입점(runPython)에서 양보를 시도하지 않는다 — 시도하면 "Cannot stack switch" 오류가 알림으로 새어 나온다(2026-09-16 실사이트에서 발견).
      expect(out.notices.filter((text) => text.includes('흉내 모듈 초기화 중 오류'))).toEqual([]);
      expect(out.steps.waitkey_queue.value).toEqual([27, 100, -1, -1]);
      expect(out.steps.waitkey_zero_stops.errorType).toBe('KeyboardInterrupt');
      expect(out.steps.waitkey_zero_stops.stopped).toBe(true);
      expect(out.steps.waitkey_zero_stops.ms).toBeLessThan(1000);
      expect(out.steps.destroy_all.value).toBe(-1);
      expect(out.steps.destroy_all.events.map((event) => `${event.kind}:${event.name}`)).toEqual([
        'window.open:a',
        'window.open:b',
        'window.close:a',
        'window.close:null',
      ]);

      // imshow 변환과 빈도 제한
      const kinds = out.steps.imshow_kinds;
      expect(kinds.errorType, kinds.errorMessage).toBeUndefined();
      expect(kinds.value).toEqual(['error:cv2.imshow', 'error:cv2.imshow']);
      const shown = kinds.events.filter((event) => event.kind === 'window.show');
      expect(shown.map((event) => event.name)).toEqual(['gray', 'float', 'bgra']);
      expect(shown[0]?.white).toBe(0); // 200은 200 초과가 아니다
      expect(shown[1]?.white).toBe(24); // float 1.0 → 255, 4×6 픽셀 전부
      expect(out.steps.imshow_rate_limit.events.filter((event) => event.kind === 'window.show')).toHaveLength(1);

      // cap.get/set/release
      expect(out.steps.cap_props.value).toEqual([64, 48, true, 32, 15, true, false, 'APC-BROWSER']);
      expect(out.steps.camera_unavailable.value).toEqual([false, false, true]);
      expect(out.notices.some((text) => text.includes('입력 소스'))).toBe(true);
      expect(out.steps.file_path_delegates.value).toEqual([false, false]);
      expect(out.steps.read_stops.errorType).toBe('KeyboardInterrupt');
      expect(out.steps.read_stops.ms).toBeLessThan(1000);

      // 제한 모드
      expect(out.steps.limited_read.value).toEqual([true, true, [48, 64, 3], 255, 0, -1]);
      expect(out.steps.limited_read.events.some((event) => event.kind === 'window.show' && event.name === 'limited')).toBe(true);
      expect(out.steps.limited_waitkey_zero.errorType).toBe('RuntimeError');
      expect(out.steps.limited_waitkey_zero.errorMessage).toContain('JSPI');
      // 동기 진입점에서 poll·get이 불려도(마지막 양보 뒤 16ms 넘게 지난 뒤) 양보를 시도하지 않는다.
      expect(out.syncEntrypointPoll).toBe('ok');
      expect(out.pendingRequests).toBe(0);
    },
    300_000,
  );
});
