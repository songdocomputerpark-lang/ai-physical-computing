// 도우미 스크립트(tests/unit/<분야>/helpers/pyodide-*-run.mjs)가 결과 JSON 한 줄을 내보내고 끝내는 공통 함수.
//
// 왜 따로 두는가: 이 스크립트들은 `spawnSync`로 떠서 stdout이 **파이프**다. 파이프로 보내는 글이 파이프 버퍼(리눅스 64KB)를
// 넘으면 Node의 `process.stdout.write`는 비동기로 나가므로, 곧바로 `process.exit(0)`을 부르면 뒤가 잘린다.
// 2026-09-18 CI(우분투)에서 이 때문에 검사 세 개가 한꺼번에 실패했다(결과 JSON이 140KB 안팎):
//   SyntaxError: Unterminated string in JSON at position 139515  ← tests/unit/lab/pyodide-board-pwm-adc.test.ts
//   SyntaxError: Expected double-quoted property name in JSON at position 145411  ← tests/unit/board-i2c/pyodide-i2c-bus-lcd.test.ts
// 윈도(운영자 PC)에서는 같은 검사가 통과해 로컬에서는 보이지 않았다. 그래서 **다 나갔다는 알림을 받은 뒤에** 끝낸다.
//
// 쓰는 법: `import { finishJson } from '../../helpers/finish-json.mjs';` 뒤에 `finishJson(out)`.
// 결과가 커져도 안전하니 새 도우미 스크립트도 이 함수를 쓴다(`process.stdout.write` + `process.exit`를 직접 쓰지 않는다).

/** 마지막 줄에 JSON을 쓰고, 그 글이 모두 나간 뒤에 프로세스를 끝낸다. */
export function finishJson(value, code = 0) {
  const text = `\n${JSON.stringify(value)}\n`;
  let ended = false;
  const quit = () => {
    if (ended) {
      return;
    }
    ended = true;
    process.exit(code);
  };
  // 알림이 오지 않는 일이 생겨도 멈춰 있지 않게 10초 뒤에는 그냥 끝낸다(할 일이 이것뿐이면 기다리지 않고 저절로 끝난다).
  const guard = setTimeout(quit, 10_000);
  guard.unref?.();
  process.stdout.write(text, () => {
    clearTimeout(guard);
    quit();
  });
}
