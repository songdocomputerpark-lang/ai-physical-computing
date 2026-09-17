// 복원한 팬 모터 라이브러리 gorillacell_dcmotors.py(PWM판, examples/esp32/lib/third-party/)를 실제 Pyodide로 확인하는 단계들(P3-05 구역 C).
// machine.PWM은 구역 A(P3-03)가 만든다 — 이 단계는 라이브러리 논리만 보려고 duty 호출을 적어 두는 시험용 PWM을 잠깐 등록한다.
// 라이브러리는 화면(보드 모듈 index.ts)이 /board/lib에 넣는 것과 같게 여기서 직접 넣는다.
import fs from 'node:fs';
import path from 'node:path';

const LIBRARY = 'examples/esp32/lib/third-party/gorillacell_dcmotors.py';

// 구역 A의 진짜 PWM이 있어도 시험용으로 바꾼다: machine은 불러올 때 확장 이름을 모듈 속성으로 복사하므로(machine.py 끝) 등록표와 속성을 함께 바꾼다.
const FAKE_PWM = [
  'import apc_board, builtins, machine',
  'PWM_LOG = []',
  'class TestPWM:',
  '    def __init__(self, pin, freq=None, duty=None):',
  '        self.gpio = apc_board.find_pin(pin)',
  "        PWM_LOG.append(('new', self.gpio, freq))",
  '    def duty(self, value=None):',
  "        PWM_LOG.append(('duty', self.gpio, value))",
  "apc_board.register_machine_export('PWM', TestPWM)",
  'machine.PWM = TestPWM',
  'builtins.PWM_LOG = PWM_LOG',
  '"ok"',
].join('\n');

export default async function gorillacellSteps({ step, pyodide, rootDir }) {
  pyodide.FS.mkdirTree('/board/lib');
  pyodide.FS.writeFile('/board/lib/gorillacell_dcmotors.py', fs.readFileSync(path.join(rootDir, LIBRARY), 'utf8'));
  await step('fake_pwm', FAKE_PWM);

  // 1. 원고 169쪽 사이트판(줄 번호를 뺀 f074): cw → ccw → stop, 기본 1000Hz·speed 100 = duty 1023
  await step(
    'f074_site',
    [
      'from gorillacell_dcmotors import GORILLACELL_DCMOTORS',
      'import time',
      '',
      'fan = GORILLACELL_DCMOTORS(25, 26)',
      '',
      "fan.rotate('cw')",
      'time.sleep(2)',
      '',
      "fan.rotate('ccw')",
      'time.sleep(2)',
      '',
      'fan.stop()',
      'time.sleep(2)',
      'list(PWM_LOG)',
    ].join('\n'),
  );

  // 2. 원본 f075 파일 그대로(속도 30·70): 3초 뒤 [정지] — duty는 int(1023 × 0.3) = 306, int(1023 × 0.7) = 716
  const f075 = fs.readFileSync(path.join(rootDir, 'examples/esp32/u2/2-2-3-fan-speed.py'), 'utf8');
  await step('f075_file', ['PWM_LOG.clear()', f075].join('\n'), { stopAfterMs: 5000 });
  await step('f075_log', 'list(PWM_LOG)');

  // 3. 범위 밖 speed는 0~100으로 자르고, 모르는 방향은 아무것도 하지 않는다(스크린숏에 else가 없음). 디지털판처럼 speed 없이도 된다.
  await step(
    'library_rules',
    [
      'from gorillacell_dcmotors import GORILLACELL_DCMOTORS',
      'PWM_LOG.clear()',
      'fan = GORILLACELL_DCMOTORS(25, 26, freq=500)',
      "fan.rotate('cw', 150)",
      "fan.rotate('ccw', -20)",
      "fan.rotate('left', 50)",
      "fan.rotate('cw', speed=40)",
      'list(PWM_LOG)',
    ].join('\n'),
  );
}
