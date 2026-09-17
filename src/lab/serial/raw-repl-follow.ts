/**
 * raw REPL에서 코드를 보낸 뒤 보드가 돌려주는 바이트를 차례로 읽는 순수 상태 기계(P3-07). 네트워크·타이머 없이 조각을 넣으면 사건을 돌려준다.
 *
 * 보드가 보내는 모양(MicroPython v1.29.0 docs/reference/repl.rst, shared/runtime/pyexec.c parse_compile_execute, ports/esp32/main.c)
 *   [코드 실행 출력…] \x04 [잡히지 않은 예외의 트레이스백…] \x04 >
 * - 끝난 뒤 ">"가 오면 raw REPL 프롬프트로 돌아온 것이다.
 * - sys.exit()·machine.soft_reset()(= SystemExit)이면 raw REPL이 끝나(PYEXEC_FORCED_EXIT) 보드가 소프트 리셋된다:
 *   \x04 \x04 뒤에 ">" 대신 "MPY: soft reboot\r\n" + boot.py 출력 + "raw REPL; CTRL-B to exit\r\n>"가 온다(raw 모드라 main.py는 돌지 않음).
 * - machine.reset()·전원 부족(브라운아웃) 같은 하드 리셋은 \x04 없이 ROM 부팅 글("rst:0x…")과 MicroPython 배너·">>> "가 온다.
 *   모의 보드(src/lab/serial/mock/)는 machine.soft_reset()도 \x04 없이 "MPY: soft reboot"만 보내므로 그 모양도 리셋으로 받는다.
 * 출력 바이트는 받은 즉시 stdout 사건으로 내보낸다(콘솔에 흘려보내기). 리셋 글도 먼저 콘솔에 보이고, 끝 모양(프롬프트)이 오면 reset 사건이 온다.
 */
import { CTRL_D, FRIENDLY_PROMPT, RAW_REPL_READY, latin1 } from './control-bytes.ts';
import type { PythonErrorInfo } from '../runtime/protocol.ts';

export type FollowEvent =
  | { readonly type: 'stdout'; readonly bytes: Uint8Array }
  | { readonly type: 'stdout-end' }
  | { readonly type: 'stderr-end'; readonly stderr: string }
  | { readonly type: 'prompt'; readonly softReboot: boolean; readonly preamble: string }
  | { readonly type: 'reset'; readonly kind: 'soft' | 'hard'; readonly text: string };

export type FollowPhase = 'stdout' | 'stderr' | 'prompt' | 'done';

export interface FollowStep {
  readonly events: readonly FollowEvent[];
  /** 끝난 뒤 남은 바이트(다음 명령이 읽도록 통로 버퍼에 되돌린다) */
  readonly rest: Uint8Array;
}

/** 출력 뒷부분을 이만큼만 보관해 리셋 모양을 찾는다(글자 수) */
const TAIL_LIMIT = 4096;
const HARD_RESET_MARK = /(?:^|\n)rst:0x[0-9a-f]+ \(/u;
const SOFT_RESET_MARK = 'MPY: soft reboot\r\n';

export class RawReplFollower {
  #phase: FollowPhase = 'stdout';
  #stderr: number[] = [];
  #promptText = '';
  #tail = '';

  get phase(): FollowPhase {
    return this.#phase;
  }

  push(chunk: Uint8Array): FollowStep {
    const events: FollowEvent[] = [];
    let index = 0;
    while (index < chunk.length && this.#phase !== 'done') {
      if (this.#phase === 'stdout') {
        const end = chunk.indexOf(CTRL_D, index);
        const stop = end < 0 ? chunk.length : end;
        if (stop > index) {
          const bytes = chunk.slice(index, stop);
          events.push({ type: 'stdout', bytes });
          const reset = this.#watchReset(bytes);
          if (reset) {
            events.push(reset);
            this.#phase = 'done';
            return { events, rest: chunk.slice(stop) };
          }
        }
        if (end < 0) {
          index = chunk.length;
          break;
        }
        events.push({ type: 'stdout-end' });
        this.#phase = 'stderr';
        index = end + 1;
        continue;
      }
      if (this.#phase === 'stderr') {
        const end = chunk.indexOf(CTRL_D, index);
        const stop = end < 0 ? chunk.length : end;
        for (let at = index; at < stop; at += 1) {
          this.#stderr.push(chunk[at]!);
        }
        if (end < 0) {
          index = chunk.length;
          break;
        }
        events.push({ type: 'stderr-end', stderr: new TextDecoder('utf-8').decode(Uint8Array.from(this.#stderr)) });
        this.#stderr = [];
        this.#phase = 'prompt';
        index = end + 1;
        continue;
      }
      // prompt: 바로 ">"면 끝, 아니면 소프트 리셋 뒤의 raw REPL 알림 + ">"까지 모은다
      const byte = chunk[index]!;
      if (this.#promptText === '' && byte === 0x3e) {
        events.push({ type: 'prompt', softReboot: false, preamble: '' });
        this.#phase = 'done';
        return { events, rest: chunk.slice(index + 1) };
      }
      this.#promptText += String.fromCharCode(byte);
      index += 1;
      if (this.#promptText.endsWith(RAW_REPL_READY)) {
        events.push({ type: 'prompt', softReboot: /soft reboot/u.test(this.#promptText), preamble: this.#promptText });
        this.#phase = 'done';
        return { events, rest: chunk.slice(index) };
      }
      if (this.#promptText.length > TAIL_LIMIT) {
        this.#promptText = this.#promptText.slice(-TAIL_LIMIT);
      }
    }
    return { events, rest: this.#phase === 'done' ? chunk.slice(index) : new Uint8Array(0) };
  }

  /** 지금까지 모은 프롬프트 앞 글(소프트 리셋 중 boot.py 출력 등) */
  get pendingPromptText(): string {
    return this.#promptText;
  }

  #watchReset(bytes: Uint8Array): FollowEvent | null {
    this.#tail = (this.#tail + latin1(bytes)).slice(-TAIL_LIMIT);
    const tail = this.#tail;
    const hardAt = tail.search(HARD_RESET_MARK);
    if (hardAt >= 0) {
      const after = tail.slice(hardAt);
      if (after.endsWith(FRIENDLY_PROMPT) || after.endsWith(RAW_REPL_READY)) {
        return { type: 'reset', kind: 'hard', text: after };
      }
      return null;
    }
    const softAt = tail.lastIndexOf(SOFT_RESET_MARK);
    if (softAt >= 0) {
      const after = tail.slice(softAt);
      if (after.endsWith(RAW_REPL_READY) || after.endsWith(FRIENDLY_PROMPT)) {
        return { type: 'reset', kind: 'soft', text: after };
      }
    }
    return null;
  }
}

/**
 * 보드 트레이스백 글(\r\n) → 실습실 오류 정보(PythonErrorInfo — type·마지막 줄·트레이스백 전체). 비어 있으면 null.
 * 보드 모양: 'Traceback (most recent call last):\r\n  File "<stdin>", line 2, in <module>\r\nZeroDivisionError: divide by zero\r\n'.
 * "<stdin>" 프레임은 오류 풀이 카드(src/lab/errors/traceback.ts)가 학생 코드로 읽는다.
 */
export function parseBoardTraceback(stderr: string): PythonErrorInfo | null {
  const traceback = stderr.replace(/\r\n?/gu, '\n').replace(/\s+$/u, '');
  if (traceback.trim() === '') {
    return null;
  }
  const lines = traceback.split('\n').filter((line) => line.trim() !== '');
  // 마지막 줄부터 거슬러 올라가 "종류: 메시지" 또는 "종류" 모양의 줄을 찾는다(여러 줄 메시지 대비)
  let lastLine = lines[lines.length - 1] ?? '';
  let type = '';
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (/^\s/u.test(line) || line.startsWith('Traceback (most recent call last)')) {
      continue;
    }
    const match = /^([A-Za-z_][\w.]*)(?::|$)/u.exec(line);
    if (match) {
      type = match[1]!;
      lastLine = line;
      break;
    }
  }
  return { type: type || 'Error', message: lastLine.replace(/\s+$/u, ''), traceback };
}
