// pyautogui 흉내 모듈의 파이썬 쪽(src/lab/modules/desktop/pyautogui.py)을 Node.js의 실제 Pyodide 314.0.7로 검사한다
// (PLAN §8.2 P2-11, CODE_MAPPING §3.4, src/lab/README.md 4.6, PD-14).
// JSPI 켠 판(--experimental-wasm-jspi)과 끈 판(--no-experimental-wasm-jspi, 제한 모드)을 따로 띄워 도우미 스크립트의 JSON 한 줄을 읽는다.
// CI의 Node는 JSPI가 기본 켜짐이라 두 플래그를 모두 명시한다(PROGRESS 미해결 1번).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'pyautogui', 'helpers', 'pyodide-pyautogui-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
// Node 판에 따라 JSPI가 기본으로 켜져 있어 --no-experimental-wasm-jspi로도 끄지 못한다(CI Node 24.20+에서 확인).
// 그때는 "제한 모드" 검사를 건너뛴다 — 켜진 채로 돌리면 기다릴 수 있어서 기대와 다른 결과가 나온다.
const nodeNoJspi = spawnSync(process.execPath, ['--no-experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeCanDisableJspi = nodeNoJspi.status === 0 && nodeNoJspi.stdout === 'undefined';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

interface EventRecord {
  kind: string;
  payload: Record<string, unknown>;
}

interface StepRecord {
  ms: number;
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stdout: string;
  events: EventRecord[];
}

interface Result {
  jspi: boolean;
  pillow: boolean;
  pillowError?: string;
  files: string[];
  duplicate?: string;
  steps: Record<string, StepRecord>;
  events: EventRecord[];
  notices: string[];
  requests: { kind: string; payload: unknown }[];
  syncEntrypointReset: string;
  leftoverPointer: unknown[];
}

function run(flag: '--experimental-wasm-jspi' | '--no-experimental-wasm-jspi'): Result {
  const result = spawnSync(process.execPath, [flag, SCRIPT, ROOT], { encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`도우미 스크립트 실패(${result.status}): ${result.stderr.slice(-2000)}`);
  }
  const lines = result.stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1] ?? '{}') as Result;
}

/** 한 단계에서 그 종류의 이벤트만 */
function kinds(step: StepRecord | undefined, kind: string): Record<string, unknown>[] {
  return (step?.events ?? []).filter((event) => event.kind === kind).map((event) => event.payload);
}

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('pyautogui 흉내(실제 Pyodide, JSPI)', () => {
  const out = run('--experimental-wasm-jspi');

  it('모듈 파일이 /apc에 들어가고 이름이 겹치지 않는다(import pyautogui가 이 파일을 받는다)', () => {
    expect(out.duplicate).toBeUndefined();
    expect(out.files).toEqual(expect.arrayContaining(['apc_runtime.py', 'pyautogui.py']));
    expect(out.jspi).toBe(true);
  });

  it('size()·position(): 화면이 알려 준 가상 모니터 크기와 커서 위치를 namedtuple로 돌려준다', () => {
    expect(out.steps.size_position?.value).toEqual([
      [1280, 720],
      [640, 360],
      1280,
      640,
    ]);
    // 첫 함수 호출에서 화면에 "열렸다"고 알린다
    expect(kinds(out.steps.size_position, 'desktop.open')).toEqual([{ width: 1280, height: 720, x: 640, y: 360 }]);
  });

  it('좌표: 소수는 잘라 정수로(f021), 화면 밖은 화면 안으로 자른다', () => {
    expect(out.steps.coords?.value).toEqual([
      [100, 200],
      [1279, 0],
      false,
    ]);
  });

  it('duration: 0.1초보다 길면 0.05초 간격 걸음으로 나눠 가고(원본 계산), 0이면 한 번에 간다', () => {
    const steps = kinds(out.steps.move_steps, 'desktop.cursor');
    expect(steps).toHaveLength(11); // int(0.5 / 0.05) = 10걸음 + 마지막 자리
    expect(steps[0]).toEqual({ x: 640, y: 360 });
    expect(steps[steps.length - 1]).toEqual({ x: 300, y: 300 });
    expect(out.steps.move_steps?.ms ?? 0).toBeGreaterThan(400); // 정말 0.5초를 기다린다(JSPI 대기 지점)
    expect(kinds(out.steps.move_instant, 'desktop.cursor')).toEqual([{ x: 50, y: 50 }]);
  });

  it('PAUSE: 함수마다 0.1초 쉬고, 학생이 바꾼 값은 다음 실행에서 기본값으로 돌아온다', () => {
    expect(out.steps.pause_default?.value).toBe(0.1);
    expect(out.steps.pause_default?.ms ?? 0).toBeGreaterThan(250); // 3번 × 0.1초
    expect(out.steps.pause_off?.value).toBe(0);
    expect(out.steps.pause_off?.ms ?? 999).toBeLessThan(100);
    expect(out.steps.pause_reset?.value).toBe(0.1); // 실행마다 초기화(진짜 PC는 실행마다 새 파이썬)
  });

  it('click·doubleClick·rightClick: 누른 번호(count)와 단추 이름을 보낸다(f018)', () => {
    expect(kinds(out.steps.clicks, 'desktop.click')).toEqual([
      { x: 300, y: 300, button: 'left', count: 1, clicks: 1 },
      { x: 300, y: 300, button: 'left', count: 1, clicks: 2 },
      { x: 300, y: 300, button: 'left', count: 2, clicks: 2 },
      { x: 300, y: 300, button: 'right', count: 1, clicks: 1 },
    ]);
  });

  it('dragTo·dragRel: 버튼을 누른 채 옮기고 놓는다(f019·f022 — 그림판에 선이 그려지는 까닭)', () => {
    expect(kinds(out.steps.drag, 'desktop.mouse')).toEqual([
      { type: 'down', x: 640, y: 360, button: 'left' },
      { type: 'move', x: 400, y: 400, button: 'left' },
      { type: 'up', x: 400, y: 400, button: 'left' },
    ]);
    const moves = kinds(out.steps.drag_rel, 'desktop.mouse');
    expect(moves[0]).toMatchObject({ type: 'down', x: 500, y: 500 });
    expect(moves[moves.length - 1]).toMatchObject({ type: 'up', x: 600, y: 500 });
    expect(moves.filter((move) => move.type === 'move')).toHaveLength(11);
  });

  it('typewrite·press·hotkey·keyDown/Up: 키를 하나씩 누르고 뗀다(f020)', () => {
    expect(kinds(out.steps.typewrite, 'desktop.key')).toEqual([
      { type: 'down', key: 'h', text: 'h' },
      { type: 'up', key: 'h', text: 'h' },
      { type: 'down', key: 'i', text: 'i' },
      { type: 'up', key: 'i', text: 'i' },
      { type: 'down', key: '\n', text: '\n' },
      { type: 'up', key: '\n', text: '\n' },
    ]);
    expect(kinds(out.steps.hotkey, 'desktop.key').map((event) => `${String(event.type)}:${String(event.key)}`)).toEqual([
      'down:ctrl',
      'down:s',
      'up:s',
      'up:ctrl',
    ]);
    expect(kinds(out.steps.hotkey, 'desktop.hotkey')).toEqual([{ keys: ['ctrl', 's'] }]);
    expect(kinds(out.steps.press_keys, 'desktop.key')).toHaveLength(6);
    expect(kinds(out.steps.scroll, 'desktop.scroll')).toEqual([{ x: 100, y: 100, clicks: 3, axis: 'vertical' }]);
  });

  it('모르는 키 이름은 진짜처럼 조용히 넘기되 콘솔에 한 번 안내한다', () => {
    expect(kinds(out.steps.unknown_key, 'desktop.key')).toEqual([]);
    expect(out.notices.filter((text) => text.includes('PyAutoGUI 키 이름이 아니어서')).length).toBe(1);
  });

  it('없는 함수 pyautogui.enter(f024 원본 오류)는 AttributeError + 한국어 힌트', () => {
    expect(out.steps.missing_enter?.errorType).toBe('AttributeError');
    expect(out.steps.missing_enter?.errorMessage).toContain("has no attribute 'enter'");
    expect(out.steps.missing_enter?.errorMessage).toContain("pyautogui.press('enter')");
  });

  it('안전장치: 사람이 커서를 (0, 0)으로 옮기면 다음 함수에서 FailSafeException(f091), FAILSAFE=False면 안 난다', () => {
    expect(out.steps.failsafe?.errorType).toBe('FailSafeException');
    expect(out.steps.failsafe?.errorMessage).toContain('왼쪽 위 모서리');
    expect(out.steps.failsafe_off?.value).toEqual([300, 300]);
  });

  it('학생이 가상 모니터를 눌러 옮긴 커서를 position()이 따라간다(desktop.pointer 채널)', () => {
    expect(out.steps.pointer_follows?.value).toEqual([111, 222]);
  });

  it('f091(손가락 커서 조종)의 pyautogui 쪽: size()에 정규화 좌표를 곱한 자리로 가고 화면 밖은 잘린다', () => {
    expect(out.steps.f091_cursor?.value).toEqual([
      1280,
      720,
      [
        [320, 360],
        [960, 180],
        [1279, 0],
      ],
    ]);
  });

  it('screenshot(): 화면이 보낸 RGBA를 Pillow 이미지로 만들어 논리 해상도로 돌려주고 파일로 저장한다(f025·f016)', () => {
    if (!out.pillow) {
      expect(out.pillowError).toBeTypeOf('string'); // 휠을 받지 못한 환경(네트워크 없음)에서는 건너뛴다
      return;
    }
    expect(out.requests.filter((request) => request.kind === 'desktop.screenshot').length).toBeGreaterThanOrEqual(2);
    expect(out.steps.screenshot?.value).toEqual([[1280, 720], 'RGB', [20, 60, 200], [255, 255, 255], [100, 50], true]);
    expect(out.steps.screenshot_file?.value).toBe(true);
  });

  it('webbrowser.open(url)은 가상 브라우저 창을 연다 — 표준 라이브러리 대신 /apc의 흉내 모듈이 쓰인다(f023·f024)', () => {
    expect(out.steps.webbrowser?.value).toEqual([true, 'apc-virtual', '/apc/webbrowser.py']);
    expect(kinds(out.steps.webbrowser, 'desktop.browser')).toEqual([
      { url: 'https://www.naver.com/', new: 0 },
      { url: 'https://www.google.com/', new: 2 },
    ]);
  });

  it("press('space') 연타가 그대로 키 이벤트로 간다(f121 — 입을 벌리는 동안 미니게임을 조작한다)", () => {
    const keys = kinds(out.steps.space_spam, 'desktop.key');
    expect(keys).toHaveLength(10); // 5번 × (누름 + 뗌)
    expect(keys.every((event) => event.key === 'space' && event.text === ' ')).toBe(true);
  });

  it('f095~f097·f127의 pyautogui 쪽: FAILSAFE=False·PAUSE=0.01로 매 프레임 moveTo하고 클릭한다', () => {
    // 커서가 모서리 (0, 0)에 있어도 FAILSAFE=False라 멈추지 않는다(원본이 그렇게 설정한다)
    expect(out.steps.face_mouse?.errorType).toBeUndefined();
    expect(out.steps.face_mouse?.value).toEqual([1280, 720, [691, 331]]);
    expect(kinds(out.steps.face_mouse, 'desktop.cursor').length).toBeGreaterThanOrEqual(3);
    const clicks = kinds(out.steps.face_mouse, 'desktop.click');
    expect(clicks[0]).toMatchObject({ button: 'right', count: 1 });
    expect(clicks[clicks.length - 1]).toMatchObject({ button: 'left', count: 2 }); // doubleClick
  });

  it('저장한 그림은 이름·크기·PNG 바이트로 화면에 알린다(내 파일 미리보기·내려받기)', () => {
    if (!out.pillow) {
      return;
    }
    expect(out.steps.screenshot_announce?.value).toBe('_Screenshot'); // PIL 그림을 상속한 것(다른 것은 PIL과 같다)
    const files = kinds(out.steps.screenshot_announce, 'desktop.file');
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: 'announced.png', width: 1280, height: 720, magic: '137,80,78,71' });
    expect(Number(files[0]!.byteLength)).toBeGreaterThan(100);
  });

  it('같은 이름으로 아주 빠르게 다시 저장하면(f090) 0.5초에 한 번만 저장하고 한 번 안내한다', () => {
    if (!out.pillow) {
      return;
    }
    expect(out.steps.screenshot_rate?.value).toBe(true); // 파일은 만들어졌다
    expect(kinds(out.steps.screenshot_rate, 'desktop.file')).toHaveLength(1); // 8번 불렀지만 한 번만
    expect(out.notices.filter((text) => text.includes('아주 빠르게 다시 저장')).length).toBe(1);
    // 이름이 다르면 빈도 제한에 걸리지 않는다(f016: 2초마다 다른 이름으로 5장)
    expect(out.steps.screenshot_many?.value).toEqual([true, true, true]);
    expect(kinds(out.steps.screenshot_many, 'desktop.file')).toHaveLength(3);
  });

  it('동기 진입점(reset_for_run)에서 양보를 시도하지 않고 이전 실행의 값만 버린다(PROGRESS 미해결 25번)', () => {
    expect(out.syncEntrypointReset).toBe('ok');
    expect(out.leftoverPointer).toEqual([]);
    expect(out.notices.filter((text) => text.includes('초기화 중 오류'))).toEqual([]);
  });
});

describe.skipIf(!pyodideInstalled || !nodeCanDisableJspi)('pyautogui 흉내(제한 모드 — JSPI 없는 브라우저)', () => {
  const out = run('--no-experimental-wasm-jspi');

  it('제한 모드로 뜬다', () => {
    expect(out.jspi).toBe(false);
  });

  it('기다리지 않고 바로 끝난다(duration·PAUSE는 건너뛴다) — 걸음과 좌표는 같다', () => {
    expect(kinds(out.steps.move_steps, 'desktop.cursor')).toHaveLength(11);
    expect(out.steps.move_steps?.ms ?? 999).toBeLessThan(200);
    expect(out.steps.pause_default?.ms ?? 999).toBeLessThan(200);
    expect(out.steps.clicks?.errorType).toBeUndefined();
  });

  it('화면의 답을 기다리는 screenshot()은 한국어로 왜 안 되는지 알린다', () => {
    if (!out.pillow) {
      return;
    }
    expect(out.steps.screenshot?.errorType).toBe('RuntimeError');
    expect(out.steps.screenshot?.errorMessage).toContain('JSPI');
  });

  it('답을 기다리지 않는 것(webbrowser.open·press)은 제한 모드에서도 그대로 된다', () => {
    expect(out.steps.webbrowser?.errorType).toBeUndefined();
    expect(kinds(out.steps.webbrowser, 'desktop.browser')).toHaveLength(2);
    expect(kinds(out.steps.space_spam, 'desktop.key')).toHaveLength(10);
  });
});
