/**
 * (실험) USB 한 개로 보내기 — 변환기 없이 **보드 REPL 포트**로 데이터를 보내는 길(P4-05, PLAN §7.3 세 번째 줄).
 *
 * PLAN §7.3은 이 길을 "raw REPL과 섞일 때 동작 미확인 → 확인 전에는 기본으로 쓰지 않음"으로 적어 두었다.
 * 그래서 이 파일은 **등록표에 통로를 등록하지 않는다**(channel.ts의 `serial`만 고를 수 있다). 여기 있는 것은
 *   ① 보드에 올릴 템플릿 코드  ② 보낼 한 줄이 안전한지 보는 검사  ③ 모의 시리얼로 실제 확인한 결과(아래)다.
 *
 * ── 확인한 것(2026-09-18, 모의 시리얼 `src/lab/serial/mock/` + 실제 raw REPL 코드 `raw-repl.ts`로 실행. 테스트:
 *    `tests/unit/serial/data-port-single-usb.test.ts`) ──
 * 1. **닿는다.** raw-paste로 코드를 보낸 뒤 프로그램이 `input()`에서 기다리는 동안 포트에 `a\r`를 쓰면 프로그램이 'a'를 받는다.
 *    P3-08이 만든 `MicroPythonRepl.sendInput()`이 그대로 쓰인다(실행 중·stage가 running일 때만 나간다).
 *    프로그램이 아직 `input()`을 부르기 전에 보낸 줄도 보드 stdin 버퍼에 있다가 읽힌다(출력이 `reading\na\ngot a\n`).
 * 2. **되울림이 콘솔에 섞인다.** `input()`은 받은 글자를 그대로 되울린다(readline.c). 사람이 한 줄씩 칠 때는
 *    `InputEchoFilter`(board-input.ts)가 한 번 걸러 주지만, 브릿지가 초당 여러 줄을 보내면 콘솔이 보낸 글로 덮인다.
 * 3. **프로그램이 읽지 않으면 남아 있다가 raw REPL의 입력 칸으로 흘러간다.** 실행이 끝나는 순간 보드가 그 바이트를
 *    REPL 입력으로 읽는다. 글자만 남았을 때는 **실행되지 않고 쌓여 있다가** 사이트가 다음 [실행] 앞에 보내는 Ctrl-C가 지운다
 *    (모의 보드 확인: 다음 실행이 그대로 `ok`). 그래서 **보통은 회복되지만**, 4번처럼 제어 바이트가 섞이면 회복되지 않는다.
 * 4. **제어 바이트는 데이터가 아니다.**
 *    - 0x03(Ctrl-C): 실행 중인 프로그램을 **멈춘다**(ESP32 stdin ISR이 KeyboardInterrupt를 예약).
 *    - 0x04(Ctrl-D): 실행이 끝난 뒤, 그때까지 쌓여 있던 글자가 **보드에서 코드로 실행된다**(모의 보드 확인:
 *      사이트가 보낸 적 없는 `print('sneaky')`가 raw로 실행됨). 이것이 "raw REPL과 섞임"의 정체다.
 *    - 0x02(Ctrl-B): 보드가 raw REPL에서 나가 보통 REPL이 된다(사이트는 다음 실행에서 되찾는다).
 *    그래서 f007처럼 **원시 바이트(0x01~0x04)를 보내는 예제는 이 길로 보낼 수 없다** — 변환기 포트(channel.ts)를 써야 한다.
 * 5. **한글은 사라진다.** `input()`의 readline은 32~126 글자만 줄에 넣는다(0x80 이상은 조용히 버림).
 * 6. 한 줄 길이는 250자까지만 보낸다(보드 링버퍼 260바이트 — board-input.ts와 같은 값).
 *
 * → 판정: **기본 통로로 쓰지 않는다.** 변환기가 없는 학교에서 "한 줄 명령"만 주고받는 보조 길로만 안내하고,
 *   ①연결이 [실제 보드]로 실행 중일 때만 ②글자 메시지만(제어 바이트·원시 바이트 금지) ③한 줄씩 보낸다.
 *   실물 확인은 부록 B-2(운영자 할 일)로 남긴다 — 모의 보드는 MicroPython 소스를 따라 만든 흉내이지 실물의 증거가 아니다.
 *
 * 한 가지 더(실물 확인 필요): `sys.stdin.readline()`을 쓰면 되울림과 32~126 제한이 없다(readline을 거치지 않으므로).
 * 그러나 모의 보드는 `input()`만 흉내 내므로 이 사이트는 확인하지 못했다 — 실물 보드에서 확인한 뒤에 템플릿을 바꾼다.
 */
import { BOARD_INPUT_MAX_CHARS, prepareBoardInputLine, type BoardInputLine } from '../board-input.ts';

/** 데이터로 보내면 안 되는 제어 바이트와 까닭 */
export const UNSAFE_CONTROL_BYTES: Readonly<Record<number, string>> = Object.freeze({
  0x01: '보드를 raw REPL로 바꾸는 신호(Ctrl-A)예요.',
  0x02: '보드를 보통 REPL로 되돌리는 신호(Ctrl-B)예요.',
  0x03: '프로그램을 멈추는 신호(Ctrl-C)예요 — 데이터로 보내면 보드가 멈춰요.',
  0x04: '입력이 끝났다는 신호(Ctrl-D)예요 — input()이 EOFError로 끝나요.',
  0x05: '붙여넣기 모드로 바꾸는 신호(Ctrl-E)예요.',
});

export type SingleUsbWarningCode = 'control' | 'non-ascii' | 'too-long' | 'newline-inside' | 'empty';

export interface SingleUsbWarning {
  readonly code: SingleUsbWarningCode;
  readonly text: string;
}

export interface SingleUsbCheck {
  /** 그대로 보내도 되는가(제어 바이트가 없고 비어 있지 않음) */
  readonly safe: boolean;
  /** 실제로 보드로 나갈 한 줄(board-input.ts 규칙 그대로) */
  readonly line: BoardInputLine;
  readonly warnings: readonly SingleUsbWarning[];
}

/**
 * 보드 REPL 포트로 보낼 한 줄을 검사한다.
 * 막지는 않고(실물과 같게 보여 주려고) 무엇이 사라지고 무엇이 위험한지 한국어로 알린다 — 다만 제어 바이트가 있으면 safe가 거짓이다.
 */
export function checkSingleUsbLine(value: string): SingleUsbCheck {
  const warnings: SingleUsbWarning[] = [];
  let hasControl = false;
  for (const char of String(value ?? '')) {
    const code = char.codePointAt(0) ?? 0;
    const reason = UNSAFE_CONTROL_BYTES[code];
    if (reason !== undefined) {
      hasControl = true;
      warnings.push({ code: 'control', text: `0x${code.toString(16).padStart(2, '0')} 글자가 들어 있어요. ${reason}` });
    }
  }
  const line = prepareBoardInputLine(value);
  if (/[\r\n]/u.test(String(value ?? '').slice(0, -1))) {
    warnings.push({ code: 'newline-inside', text: '줄바꿈이 가운데에 있어요. 보드는 한 줄씩 읽으니 한 줄로 만들어 보내요.' });
  }
  if (line.droppedNonAscii) {
    warnings.push({ code: 'non-ascii', text: '한글처럼 영어·숫자·기호가 아닌 글자는 보드가 받지 못해 빼고 보내요(실물 보드도 같아요).' });
  }
  if (line.truncated) {
    warnings.push({ code: 'too-long', text: `한 번에 ${BOARD_INPUT_MAX_CHARS}자까지만 보낼 수 있어서 뒤를 잘랐어요.` });
  }
  const blank = line.text.trim() === '';
  if (blank) {
    warnings.push({ code: 'empty', text: '보낼 글자가 없어요(빈 줄만 나가요).' });
  }
  return Object.freeze({ safe: !hasControl && !blank, line, warnings: Object.freeze(warnings) });
}

/**
 * 보드에 올려 두고 쓰는 템플릿(변환기가 없을 때). 3-1-2 예제(f082)와 같은 일을 하지만
 * UART2 대신 **컴퓨터와 이어진 USB(REPL 포트)로 온 한 줄**을 읽는다.
 * 줄 수·모양은 실습실 [실행]에 그대로 넣을 수 있게 짧게 두었다. `examples/esp32/comm/`에 넣는 일은 구역 F(P4-10)가 한다.
 */
export const SINGLE_USB_TEMPLATE = `# USB 한 개로 보내기(실험) — 변환기 없이 컴퓨터가 보낸 한 줄을 보드가 읽어요.
# 컴퓨터 쪽: 실습실 입력줄이나 [보내기] 패널에서 a·b를 보내요.
from machine import Pin

laser = Pin(21, Pin.OUT)
print('명령을 기다려요: a(켜기) b(끄기)')

while True:
    cmd = input().strip()       # 컴퓨터가 보낸 한 줄(끝의 줄바꿈은 떼요)
    if cmd == 'a':
        laser.value(1)
        print('laser on')
    elif cmd == 'b':
        laser.value(0)
        print('laser off')
    else:
        print('모르는 명령: ' + cmd)
`;

/** 화면·문서에 그대로 쓰는 한 줄 요약(왜 기본이 아닌지) */
export const SINGLE_USB_SUMMARY =
  'USB 선 하나로도 한 줄 명령을 보낼 수 있지만, 보드가 읽지 않는 동안 보낸 글자는 실행이 끝난 뒤 REPL에 섞이고 ' +
  'Ctrl-C(0x03) 같은 제어 바이트는 프로그램을 멈춰요. 그래서 기본은 USB-UART 변환기 포트예요.';
