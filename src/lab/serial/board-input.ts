/**
 * 실제 보드에서 도는 코드의 input()에 한 줄 보내기(P3-08 실제 보드 ② — PLAN §8.3 "실행 중 input() 전달 시험").
 * 순수 함수·상태 기계라 Node 단위 테스트가 글만으로 검사한다(tests/unit/serial/real-board-input.test.ts).
 *
 * 근거(2026-09-18 MicroPython v1.29.0 원문 확인)
 * - py/modbuiltins.c mp_builtin_input: 프롬프트를 찍고 readline()으로 한 줄을 받는다. 받은 글자가 Ctrl-C면 KeyboardInterrupt, 빈 줄의 Ctrl-D면 EOFError.
 * - shared/readline/readline.c readline_process_char: 줄 끝은 '\r'이나 '\n'(process_nl — 이어 온 "\r\n"은 한 번으로 친다),
 *   줄에 넣는 글자는 32~126(영어·숫자·기호)뿐이라 한글 같은 UTF-8 바이트(0x80 이상)는 조용히 버려진다. Tab(9)은 자동 완성, ESC(27)는 화살표 같은
 *   조합으로 읽는다. 넣은 글자는 되울려(echo) 보내고, 줄 끝에서 "\r\n"을 보낸다.
 * - ports/esp32/mphalport.c: 받은 글자는 260바이트 링버퍼(stdin_ringbuf)에 쌓였다가 input()이 읽는다 — input()을 부르기 전에 보낸 줄도 기다렸다 읽힌다.
 *   실행 중 Ctrl-C는 버퍼에 들어가지 않고 KeyboardInterrupt가 된다([정지]).
 * 그래서 보낼 줄은 32~126 글자만 남기고(Tab은 빈칸 하나) 끝에 '\r' 하나를 붙인다('\n'까지 붙이면 프로그램이 끝났을 때 raw REPL 줄에 남는다).
 * 셸은 학생이 적은 줄을 콘솔에 input으로 이미 적으므로(LabRunContext.prompt), 보드가 되울린 "보낸 글 + 줄바꿈"은 출력에서 한 번 걸러 낸다(InputEchoFilter).
 * 실물 ESP32의 raw REPL 실행 중에도 이렇게 전달되는지는 부록 B-2 19번(운영자 할 일 2번)으로 확인한다.
 */

/** 실제 보드 실행 중 셸 입력줄의 이름표 */
export const BOARD_INPUT_LABEL = '보드로 보낼 한 줄(input)';

/** 한 번에 보내는 글자 수 상한 — 보드 링버퍼(260바이트)에 줄 끝까지 들어가게 */
export const BOARD_INPUT_MAX_CHARS = 250;

/** 되울림을 기다리다 포기하는 시간(맞추기 시작하지 않은 기대만 — 되울리지 않는 읽기·끝난 프로그램) */
export const ECHO_EXPIRE_MS = 10_000;

export interface BoardInputLine {
  /** 보드로 보낼 글('\r' 앞 — 32~126 글자만) */
  readonly text: string;
  /** 보낼 바이트(text + '\r') */
  readonly bytes: Uint8Array;
  /** 한글처럼 보드 input()이 받지 못하는 글자를 뺐는지 */
  readonly droppedNonAscii: boolean;
  /** 제어 글자를 뺐는지(Tab은 빈칸으로 바꾸므로 빼지 않음) */
  readonly droppedControl: boolean;
  /** 너무 길어 뒤를 잘랐는지 */
  readonly truncated: boolean;
}

/** 셸 입력줄에 적은 글 → 보드 input()으로 보낼 한 줄 */
export function prepareBoardInputLine(value: string): BoardInputLine {
  let text = '';
  let droppedNonAscii = false;
  let droppedControl = false;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09) {
      text += ' ';
    } else if (code >= 0x20 && code <= 0x7e) {
      text += char;
    } else if (code < 0x20 || code === 0x7f) {
      droppedControl = true;
    } else {
      droppedNonAscii = true;
    }
  }
  const truncated = text.length > BOARD_INPUT_MAX_CHARS;
  if (truncated) {
    text = text.slice(0, BOARD_INPUT_MAX_CHARS);
  }
  const bytes = new Uint8Array(text.length + 1);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  bytes[text.length] = 0x0d;
  return Object.freeze({ text, bytes, droppedNonAscii, droppedControl, truncated });
}

interface EchoExpectation {
  /** 되울림 모양(보낸 글 + "\n" — 보드의 "\r\n"은 BoardTextDecoder가 "\n"으로 바꾼다) */
  readonly text: string;
  readonly sentAt: number;
}

/**
 * 보드 출력에서 보낸 줄의 되울림을 한 번씩 걸러 낸다.
 * - 보낸 차례대로 기다린다. 출력 글자가 기다리는 되울림과 이어서 맞으면 붙잡아 두고(holding), 끝까지 맞으면 버린다.
 * - 중간에 어긋나면 붙잡아 둔 글을 그대로 내보낸다(프로그램 출력). 기다림은 남겨 둔다(미리 보낸 줄은 input()이 늦게 읽을 수 있다).
 * - 붙잡은 글은 release()로 내보낸다(부른 쪽이 잠깐 뒤·실행이 끝날 때 부른다 — 출력이 멈춰 보이지 않게).
 * - 맞추기 시작하지 않은 채 expireMs가 지난 기다림은 버린다(되울리지 않는 읽기).
 */
export class InputEchoFilter {
  readonly #queue: EchoExpectation[] = [];
  readonly #expireMs: number;
  readonly #now: () => number;
  #held = '';
  #matched = 0;

  constructor(options: { readonly expireMs?: number; readonly now?: () => number } = {}) {
    this.#expireMs = options.expireMs ?? ECHO_EXPIRE_MS;
    this.#now = options.now ?? (() => Date.now());
  }

  /** 보낸 줄(prepareBoardInputLine의 text)의 되울림을 기다린다 */
  expect(text: string): void {
    this.#queue.push({ text: `${text}\n`, sentAt: this.#now() });
  }

  /** 되울림인지 아직 모르는 글을 붙잡고 있는지 */
  get holding(): boolean {
    return this.#held !== '';
  }

  /** 기다리는 되울림 수 */
  get pending(): number {
    return this.#queue.length;
  }

  /** 보드 출력(줄 끝 \n) → 콘솔에 쓸 글 */
  push(text: string): string {
    let out = '';
    for (const char of text) {
      this.#expire();
      const head = this.#queue[0];
      if (!head) {
        out += this.#held + char;
        this.#held = '';
        this.#matched = 0;
        continue;
      }
      if (char === head.text[this.#matched]) {
        this.#held += char;
        this.#matched += 1;
        if (this.#matched === head.text.length) {
          this.#queue.shift();
          this.#held = '';
          this.#matched = 0;
        }
        continue;
      }
      // 어긋남: 붙잡은 글은 프로그램 출력이었다. 이 글자로 다시 맞춰 본다
      out += this.#held;
      this.#held = '';
      this.#matched = 0;
      if (char === head.text[0]) {
        if (head.text.length === 1) {
          this.#queue.shift();
        } else {
          this.#held = char;
          this.#matched = 1;
        }
      } else {
        out += char;
      }
    }
    return out;
  }

  /** 붙잡아 둔 글을 내보낸다(기다림은 남긴다) */
  release(): string {
    const held = this.#held;
    this.#held = '';
    this.#matched = 0;
    return held;
  }

  #expire(): void {
    if (this.#matched !== 0) {
      return;
    }
    const now = this.#now();
    while (this.#queue.length > 0 && now - this.#queue[0]!.sentAt > this.#expireMs) {
      this.#queue.shift();
    }
  }
}
