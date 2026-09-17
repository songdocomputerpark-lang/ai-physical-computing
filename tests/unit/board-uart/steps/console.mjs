// 보드 콘솔 input()(src/lab/modules/board-console/apc_board_console.py)을 실제 Pyodide로 확인하는 단계들(P3-05 구역 C).
// 화면 흉내: board-console.ready를 켜고, 파이썬이 보낸 board-console.prompt 이벤트마다 정해 둔 답을 board-console.line으로 쌓는다.
// (공유 도우미는 파이썬의 request('input')을 거절하므로 러너 공통 input()은 여기서 시험하지 않는다 — 브라우저 테스트가 본다.)
import fs from 'node:fs';
import path from 'node:path';

/** 이 함수를 부른 뒤에 파이썬이 입력줄을 열 때마다 answers의 다음 답을 delayMs 뒤에 보낸다(답이 떨어지면 null). 끝낼 때 부르는 함수를 돌려준다. */
function answerPrompts(out, bridge, answers, delayMs = 150) {
  let next = out.events.length;
  const queue = [...answers];
  const pending = [];
  const timer = setInterval(() => {
    for (; next < out.events.length; next += 1) {
      const event = out.events[next];
      if (event.kind !== 'board-console.prompt' || !event.payload) {
        continue;
      }
      const answer = queue.length > 0 ? queue.shift() : null;
      const id = event.payload.id;
      // 화면 index.ts lineMessage와 같은 모양: 글자면 {id, value}, 입력줄이 닫혔으면 {id, cancelled: true}
      const message = typeof answer === 'string' ? { id, value: answer } : { id, cancelled: true };
      pending.push(setTimeout(() => bridge.pushEvent('board-console.line', message), delayMs));
    }
  }, 10);
  return () => {
    clearInterval(timer);
    pending.forEach((handle) => clearTimeout(handle));
  };
}

// 구역 A의 진짜 PWM(ext/pwm/apc_board_pwm.py)이 있어도 duty 호출을 적어 두는 시험용 PWM으로 바꾼다:
// machine은 불러올 때 확장 이름을 모듈 속성으로 복사하므로(machine.py 끝) 등록표와 속성을 함께 바꾼다.
const FAKE_PWM = [
  'import apc_board, builtins, machine',
  'builtins.PWM_LOG = []',
  'class TestPWM:',
  '    def __init__(self, pin, freq=None, duty=None):',
  '        self.gpio = apc_board.find_pin(pin)',
  '    def duty(self, value=None):',
  '        builtins.PWM_LOG.append((self.gpio, value))',
  "apc_board.register_machine_export('PWM', TestPWM)",
  'machine.PWM = TestPWM',
  '"ok"',
].join('\n');

export default async function consoleSteps({ step, bridge, out, pyodide, rootDir }) {
  // 1. 화면이 보드 콘솔을 지원하지 않으면(ready 없음) 러너 공통 input을 쓴다 — 인자 규칙은 실물과 같게
  await step(
    'console_argument_rules',
    [
      'r = []',
      'for call in [lambda: input("a", "b"), lambda: input(prompt="x")]:',
      '    try:',
      '        call()',
      '        r.append("no error")',
      '    except Exception as e:',
      '        r.append(type(e).__name__ + ": " + str(e))',
      'import apc_board_console',
      'r.append([input is apc_board_console.board_input, apc_board_console._console_ready()])',
      'r',
    ].join('\n'),
  );

  // 2. 보드 콘솔: input()이 기다리는 동안에도 Timer 콜백이 돌고(실물 MICROPY_EVENT_POLL_HOOK), 안내글은 콘솔에, 답은 줄바꿈 없는 글자
  bridge.setValue('board-console.ready', true);
  let stop = answerPrompts(out, bridge, ['안녕', '42'], 900);
  await step(
    'console_timer_keeps_running',
    [
      'from machine import Pin, Timer',
      'ticks = []',
      'led = Pin(2, Pin.OUT)',
      'Timer(0).init(period=50, callback=lambda t: ticks.append(led.toggle()))',
      'first = input("이름: ")',
      'during_first = len(ticks)',
      'second = input(123)',
      '[first, second, during_first]',
    ].join('\n'),
  );
  stop();

  // 3. [정지]: 기다리는 중에 멈추면 KeyboardInterrupt(오류 풀이는 정지 안내)
  stop = answerPrompts(out, bridge, [], 5000);
  await step('console_stop_while_waiting', ['x = input("기다려요> ")', 'x'].join('\n'), { stopAfterMs: 400 });
  stop();

  // 4. 화면이 입력줄을 닫으면(null) EOFError
  stop = answerPrompts(out, bridge, [null], 50);
  await step('console_cancelled', ['try:', '    input()', '    r = "no error"', 'except EOFError as e:', '    r = "EOFError: " + str(e)', 'r'].join('\n'));
  stop();

  // 5. 원본 f076(키보드로 팬 켜고 끄기)을 파일 그대로: 1 → cw 100, 0 → 정지, q → 끝. 팬 라이브러리는 /board/lib, PWM은 시험용(구역 A 전).
  pyodide.FS.mkdirTree('/board/lib');
  pyodide.FS.writeFile('/board/lib/gorillacell_dcmotors.py', fs.readFileSync(path.join(rootDir, 'examples/esp32/lib/third-party/gorillacell_dcmotors.py'), 'utf8'));
  await step('fake_pwm', FAKE_PWM);
  stop = answerPrompts(out, bridge, ['1', '0', 'x', 'q'], 100);
  const f076 = fs.readFileSync(path.join(rootDir, 'examples/esp32/u2/2-2-3-fan-keyboard.py'), 'utf8');
  await step('f076_file', ['PWM_LOG.clear()', f076, 'list(PWM_LOG)'].join('\n'));
  stop();
  bridge.setValue('board-console.ready', false);
}
