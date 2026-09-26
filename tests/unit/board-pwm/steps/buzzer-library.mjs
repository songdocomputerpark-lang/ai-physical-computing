// 버저 라이브러리 buzzer.py 사이트판(examples/esp32/lib/third-party/buzzer.py — PROGRESS 미해결 175)을 실제 Pyodide로 확인하는 단계들.
// tests/unit/board-pwm/buzzer-library.test.ts가 공유 도우미(tests/unit/lab/helpers/pyodide-board-run.mjs --steps=이 파일)로 돌린다.
// 화면(보드 모듈 index.ts)이 하듯 보드 라이브러리를 워커의 /board/lib/에 써 넣고, 교과서 156~157쪽 흐름(from buzzer import * → BUZZER(15) → play(jingle, 100))을 돌린다.
import fs from 'node:fs';
import path from 'node:path';

const LIBRARY = 'examples/esp32/lib/third-party/buzzer.py';
const TEXTBOOK_EXAMPLE = 'examples/esp32/u2/2-2-1-buzzer-library.py';

/** 배선: 수동 버저(GPIO15 — 원고 2-2-1) */
export const BUZZER_WIRING = {
  parts: [{ part: 'buzzer', id: 'buzzer', label: '버저', pins: { sig: 15 }, directions: { sig: 'out' }, known: true }],
};

export default async function buzzerLibrarySteps({ step, pyodide, rootDir }) {
  pyodide.FS.mkdirTree('/board/lib');
  pyodide.FS.writeFile('/board/lib/buzzer.py', fs.readFileSync(path.join(rootDir, LIBRARY), 'utf8'));

  // 1. 라이브러리가 내보내는 이름: 음 이름 상수·jingle·twinkle·BUZZER는 있고, 게임 음악 선율 목록(mario)은 없다
  await step(
    'library_names',
    [
      'import buzzer',
      'names = [name for name in dir(buzzer) if not name.startswith("_")]',
      '[buzzer.C4, buzzer.E7, buzzer.G7, buzzer.C6, buzzer.DS8, len(buzzer.jingle), len(buzzer.twinkle), "mario" in names, "BUZZER" in names, buzzer.jingle[:4], buzzer.twinkle[:8]]',
    ].join('\n'),
  );

  // 2. 교과서 156~157쪽 흐름을 끝이 있게: from buzzer import * → BUZZER(15) → play(징글벨 앞 여섯 음, 100) → tone(C4, 200).
  //    PWM 주파수가 음마다 바뀌고(쉼표 0에서는 앞 음 그대로 — 원본 동작), 연주가 끝나면 duty 0(무음)이다.
  await step(
    'textbook_flow',
    [
      'from buzzer import *',
      'from time import sleep_ms',
      'import apc_board',
      'seen = []',
      'bu = BUZZER(15)',
      'real_freq = bu.pwm.freq',
      'def spy(value=None):',
      '    if value is not None:',
      '        seen.append(value)',
      '        return real_freq(value)',
      '    return real_freq()',
      'bu.pwm.freq = spy',
      'bu.play(jingle[:6], 100)',
      'after_play = bu.pwm.duty_u16()',
      'bu.tone(C4, 200)',
      '[seen, after_play, bu.pwm.duty_u16(), apc_board.BOARD.pwm_of(15) is not None]',
    ].join('\n'),
    { wiring: BUZZER_WIRING },
  );

  // 3. 교과서 157쪽 화면의 코드 파일 그대로(끝없이 징글벨): 1.5초 뒤 [정지] — ImportError 없이 15번 핀 PWM이 징글벨 주파수로 울린다
  const example = fs.readFileSync(path.join(rootDir, TEXTBOOK_EXAMPLE), 'utf8');
  await step('textbook_file', example, { wiring: BUZZER_WIRING, stopAfterMs: 1500 });

  // 4. 이름을 틀리게 적으면(buzer) 가상 보드에서도 ModuleNotFoundError — 2-2-1 오류 상자의 문장
  await step('typo_import', 'from buzer import *', { wiring: BUZZER_WIRING });
}
