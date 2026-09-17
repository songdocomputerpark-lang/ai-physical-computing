// 블록 모드(P3-06)가 만든 코드를 Node의 실제 Pyodide 314.0.7 + 가상 보드(src/lab/modules/board/)로 돌려 보는 단계 파일.
// tests/unit/blocks/pyodide-blocks-compat.test.ts가 블록 → 코드를 만들어 JSON 파일에 적고(환경 변수 APC_BLOCKS_PROGRAMS),
// 공유 도우미 tests/unit/lab/helpers/pyodide-board-run.mjs를 `--steps=이 파일`로 두 번 띄운다(src/lab/README.md 7.7).
//   --limited 없이(JSPI): 화면 코드(code)가 실물과 같은 코드 그대로 돈다
//   --limited(JSPI 없는 브라우저 흉내 — 블록 전용 호환 모드 PD-27): 실행판(execCode)이 최상위 await로 기다리며 입력·[정지]를 받는다
// 입력은 시간(during)으로 넣는다 — 실행판의 반복문은 16ms마다 스스로 양보하므로 넣은 값이 곧바로 반영된다.
import fs from 'node:fs';

const LED = 2;

export default async function blocksCompatSteps({ step, bridge, pyodide, out }) {
  const programs = JSON.parse(fs.readFileSync(process.env.APC_BLOCKS_PROGRAMS ?? '', 'utf8'));
  const limited = process.argv.includes('--limited');
  const pick = (program) => (limited ? program.execCode : program.code);
  const touchWiring = {
    parts: [{ part: 'touch-digital', id: 'touch-digital', label: '터치 센서', pins: { sig: 17 }, directions: { sig: 'in' }, known: true }],
  };

  // 제한 모드인지(기다리기 불가) 먼저 기록한다
  await step('mode', 'import apc_runtime\napc_runtime.can_wait()');

  // 1. 시작 예시(LED 깜빡이기): 0.5초마다 켜고 끈다 → [정지]
  await step('blink', pick(programs.blink), { stopAfterMs: 1300 });

  // 2. 시나리오 B(터치 센서를 누르면 LED): 기다리는 블록이 없는 반복문도 입력을 받는다
  await step('touch_led', pick(programs.touch), {
    inputs: { pins: { 17: 0 } },
    wiring: touchWiring,
    during: [
      [250, () => bridge.pushEvent('board.input', { pin: 17, drive: 1 })],
      [600, () => bridge.pushEvent('board.input', { pin: 17, drive: 0 })],
    ],
    stopAfterMs: 950,
  });

  // 3. BOOT 버튼판(거꾸로 동작하는 버튼): 누르면 0 → LED 켜짐
  await step('boot_led', pick(programs.boot), {
    inputs: { pins: { 0: 'pullup' } },
    during: [
      [250, () => bridge.pushEvent('board.input', { pin: 0, drive: 0 })],
      [600, () => bridge.pushEvent('board.input', { pin: 0, drive: 'pullup' })],
    ],
    stopAfterMs: 950,
  });

  // 4. 반복 횟수 블록(async for)과 기다리기 계산(sleep_ms)·끝나면 스스로 끝남
  await step('repeat_done', pick(programs.repeat));

  // 5. 오류 줄 번호: 실행판과 화면 코드의 줄 번호가 같은지(트레이스백 전체를 적는다 — step은 마지막 줄만 남기므로 직접 돌린다)
  out.errorTraceback = await runForTraceback(pyodide, bridge, pick(programs.error));

  // 6. 끝에 빈 줄만 남은 코드(빈 작업판)도 오류 없이 끝난다
  await step('empty', pick(programs.empty));
}

async function runForTraceback(pyodide, bridge, code) {
  const globals = pyodide.toPy({ __name__: '__main__', __file__: 'main.py' });
  bridge.beginRun();
  try {
    pyodide.runPython('import apc_shims\napc_shims.install_available()');
    pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
    await pyodide.runPythonAsync(code, { globals, filename: 'main.py' });
    return '';
  } catch (error) {
    return String(error && error.message ? error.message : error);
  } finally {
    globals.destroy();
    bridge.endRun();
  }
}

export { LED };
