// 러너 공통 모듈의 파이썬 쪽(src/lab/modules/runtime-extras/apc_files.py)을 Node.js의 실제 Pyodide 314.0.7로 검사한다(P2-10, src/lab/README.md 4.6).
// 화면 쪽 순수 논리는 files/console-fold/shadow/assets.test.ts, 사람이 보는 화면은 tests/e2e/lab-runner.spec.ts가 본다.
// JSPI는 --experimental-wasm-jspi로 켠다(도우미 tests/unit/runtime-extras/helpers/pyodide-runtime-extras-run.mjs).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findTestFontFile } from './helpers/font-fixture.ts';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'runtime-extras', 'helpers', 'pyodide-runtime-extras-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));
const fontFixture = findTestFontFile(ROOT);

interface StepRecord {
  ms: number;
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stdout: string;
  events: number;
  notices: string[];
  newRequests?: number;
}

interface EventRecord {
  kind: string;
  transferred: number;
  name?: string;
  size?: number;
  dataLength?: number;
  isPng?: boolean;
  text?: string | null;
  transferBytes?: number | null;
  phase?: string;
  names?: string[];
}

interface Result {
  jspi: boolean;
  files: string[];
  duplicate?: string;
  fontFixture: boolean;
  shimTable: string;
  manifest: { id: string; labs: unknown; shims: Record<string, string>; requestKinds: string[]; eventKinds: string[] };
  pythonConstants: Record<string, string>;
  steps: Record<string, StepRecord>;
  events: EventRecord[];
  notices: string[];
  requests: { kind: string; payload: { requested?: string; file?: string } }[];
  syncEntrypoint: string;
}

function run(): Result {
  const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', SCRIPT, ROOT, fontFixture ?? ''], {
    encoding: 'utf8',
    timeout: 420_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`도우미 스크립트 실패(${result.status}): ${result.stderr.slice(-2000)}`);
  }
  const lines = result.stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1] ?? '{}') as Result;
}

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('러너 공통 모듈의 파이썬 쪽(실제 Pyodide, JSPI)', () => {
  const out = run();
  const savedEvents = () => out.events.filter((event) => event.kind === 'runtime-extras.file_saved');

  it('모듈 .py가 /apc에 들어가고 흉내 표에 등록된다(늘 있는 builtins를 열쇠로 매 실행 install)', () => {
    expect(out.jspi).toBe(true);
    expect(out.duplicate).toBeUndefined();
    expect(out.files).toEqual(expect.arrayContaining(['apc_runtime.py', 'apc_shims.py', 'apc_files.py']));
    expect(JSON.parse(out.shimTable)).toMatchObject({ cv2: 'apc_cv2', builtins: 'apc_files' });
    expect(out.manifest.shims).toEqual({ builtins: 'apc_files' });
  });

  it('manifest.ts에 적은 이름과 파이썬 쪽 상수가 같다', () => {
    expect(out.pythonConstants.work).toBe('/home/pyodide');
    expect(out.pythonConstants.request).toBe('runtime-extras.font');
    expect(out.manifest.requestKinds).toContain(out.pythonConstants.request);
    expect(out.manifest.eventKinds).toEqual(expect.arrayContaining([out.pythonConstants.saved, out.pythonConstants.files, out.pythonConstants.shadow]));
    expect(out.pythonConstants.fontPath.endsWith(out.pythonConstants.fontFile)).toBe(true);
  });

  it('exit()·quit()·sys.exit()는 SystemExit으로 끝나고 __name__은 __main__이다(러너가 따로 넣을 것이 없다)', () => {
    expect(out.steps.exit_builtin).toMatchObject({ errorType: 'SystemExit' });
    expect(out.steps.exit_builtin.stdout).toBe('전\n');
    expect(out.steps.quit_builtin).toMatchObject({ errorType: 'SystemExit' });
    expect(out.steps.sys_exit).toMatchObject({ errorType: 'SystemExit', errorMessage: 'SystemExit: 3' });
    expect(out.steps.main_guard.stdout).toBe('주\n__main__\n');
  });

  it('input()은 안내글을 콘솔에 쓰고 화면이 보낸 값을 돌려준다', () => {
    expect(out.steps.input_value).toMatchObject({ value: '민수' });
    expect(out.steps.input_value.stdout).toBe('이름? 안녕 민수\n');
    expect(out.requests.some((request) => request.kind === 'input')).toBe(true);
  });

  it('화면이 넣어 준 가상 파일(mask.png)을 cv2.imread가 투명도까지 읽는다', () => {
    expect(out.steps.mask_read).toMatchObject({ value: [500, 400, 4, 255] });
  });

  it('코드가 마지막 줄에서 저장한 파일도 실행 끝 훅이 화면에 보낸다(그림·글자 파일, 버퍼는 옮김)', () => {
    const png = savedEvents().find((event) => event.name === '결과.png');
    const memo = savedEvents().find((event) => event.name === '메모.txt');
    expect(png).toMatchObject({ isPng: true, transferred: 1 });
    expect(png?.size).toBe(png?.dataLength);
    expect(png?.transferBytes).toBe(png?.dataLength);
    expect(memo).toMatchObject({ text: '안녕' });
    // 실행 시작·끝의 목록 알림
    const listings = out.events.filter((event) => event.kind === 'runtime-extras.files');
    expect(listings.some((event) => event.phase === 'start')).toBe(true);
    expect(listings.some((event) => event.phase === 'done' && event.names?.includes('결과.png'))).toBe(true);
  });

  it('반복문 안에서 저장하면 실행이 끝나기 전에도 화면에 간다(틱 훅, 같은 파일은 0.5초 간격)', () => {
    const loop = out.steps.save_in_loop;
    expect(loop).toMatchObject({ value: '끝' });
    const repeats = savedEvents().filter((event) => event.name === '반복.png');
    expect(repeats.length).toBeGreaterThanOrEqual(2);
    expect(repeats.length).toBeLessThanOrEqual(6);
  });

  it('작업 폴더의 파일이 라이브러리 이름을 가리면 실행 시작 때 한국어로 경고한다(내 이름 파일은 조용히)', () => {
    const warnings = out.steps.shadow_warn.notices.filter((text) => text.includes('라이브러리 이름'));
    expect(warnings.length).toBe(2);
    expect(warnings.some((text) => text.includes("'cv2.py'") && text.includes('my_cv2.py'))).toBe(true);
    expect(warnings.some((text) => text.includes("'numpy.py'"))).toBe(true);
    const shadowEvents = out.events.filter((event) => event.kind === 'runtime-extras.shadow');
    expect(shadowEvents.map((event) => event.name).sort()).toEqual(['cv2', 'numpy']);
  });

  it('동기 진입점(reset_for_run·unbind_run_globals)에서 양보를 시도하지 않는다(PROGRESS 미해결 25번)', () => {
    expect(out.syncEntrypoint).toBe('ok');
    expect(out.notices.filter((text) => text.includes('초기화 중 오류'))).toEqual([]);
    expect(out.notices.filter((text) => text.includes('Cannot stack switch'))).toEqual([]);
  });

  it('사이트판 f039의 벡터 합성이 알파를 반영하고 한 프레임이 50ms 안이다(원본의 파이썬 3중 반복은 484ms)', () => {
    const value = out.steps.vector_overlay.value as [number, number, number];
    expect(value[0]).toBe(100); // 알파 128/255 × 색 200 ≈ 100
    expect(value[1]).toBe(0); // 가면 밖은 그대로
    // 첫 장은 numpy가 준비하는 시간(약 70ms)이 섞여 두 번째 장을 잰다 — 영상 반복에서 실제로 걸리는 시간이다.
    expect(value[2]).toBeLessThan(50);
  });

  it.skipIf(!fontFixture)('없는 PC 글꼴 경로를 사이트 글꼴 파일로 연결하고 한국어로 알린다', () => {
    expect(out.fontFixture).toBe(true);
    expect(out.steps.font_site.value).toEqual(['FreeTypeFont', 30]);
    const asked = out.requests.filter((request) => request.kind === 'runtime-extras.font');
    expect(asked[0]?.payload.requested).toBe('C:/Windows/Fonts/malgun.ttf');
    expect(out.steps.font_site.notices.some((text) => text.includes('맑은 고딕') && text.includes('Pretendard'))).toBe(true);
    // 학생이 넣은 글꼴 파일은 그대로(부탁하지 않음)
    expect(out.steps.font_uploaded.value).toEqual(['FreeTypeFont', 20]);
    expect(out.steps.font_uploaded.notices).toEqual([]);
  });

  it.skipIf(!fontFixture)('제한 모드에서는 화면이 미리 넣어 둔 글꼴 파일을 기다리지 않고 쓴다', () => {
    expect(out.steps.font_limited.value).toEqual(['FreeTypeFont', 18]);
    expect(out.steps.font_limited.newRequests).toBe(0);
  });

  it('사이트 글꼴이 아직 없으면 멈추지 않고 Pillow 기본 글꼴로 그리며 한국어로 알린다', () => {
    expect(out.steps.font_missing.errorType).toBeUndefined();
    expect(out.steps.font_missing.value).toEqual(['FreeTypeFont', 1]);
    expect(out.steps.font_missing.notices.some((text) => text.includes('한글은 빈칸'))).toBe(true);
  });
});
