/**
 * 받는 차례(inbox) — 통로에서 온 바이트를 **줄 단위로** 모으고, 받아도 되는 메시지인지 거른다(PLAN §7.2 규칙 2·3, §7.4 PD-29, P4-01).
 *
 * 왜 모아야 하나(§7.7·CODE_MAPPING §6.2)
 * - 실물 UART는 받은 바이트를 링버퍼에 **누적**한다. 두 글자가 한꺼번에 오면 `ab` 한 덩어리가 된다.
 *   그래서 여기서도 오는 대로 이어 붙이고 끝 문자(`\n`)가 나올 때만 한 줄로 꺼낸다. 끝 문자가 없는 꼬리는 다음 바이트를 기다린다.
 * - 가상 보드 안쪽(UART 링버퍼·BLE 한 칸 덮어쓰기)은 이 파일이 아니라 보드 흉내가 한다. 여기는 **브라우저 쪽**에서
 *   받는 길(대시보드·콘솔·bridge.receive())이다.
 *
 * 거르기(PD-29 — 공개 브로커는 누구나 보낼 수 있다)
 * - allow 목록을 주면 목록에 있는 글만 통과시킨다(레이저·모터를 움직이는 명령이 밖에서 들어오지 못하게).
 * - maxBytes(기본 20)를 넘는 줄은 버린다. 거른 줄은 onRejected로 알려 화면·콘솔에 한국어로 보여 준다.
 * - 거르기는 **기본이 꺼져 있지 않다**: allow를 주지 않으면 길이만 보고 모두 통과한다. 실제 보드로 가는 길은 allow를 꼭 준다.
 */
import { BRIDGE_MAX_BYTES, bridgeText, bridgeWarning, byteLengthOf } from './messages.ts';
import type { BridgeWarning } from './types.ts';

const decoder = new TextDecoder('utf-8');

/** 받아도 되는지 정하는 규칙 */
export interface BridgeInboundPolicy {
  /** 이 글만 받는다(빈 목록이나 없음이면 모두 받는다). 앞뒤 공백을 뗀 글과 견준다 */
  readonly allow?: readonly string[];
  /** 이 바이트 수를 넘는 줄은 버린다(기본 20) */
  readonly maxBytes?: number;
}

/** 거른 결과 */
export interface BridgeInboundCheck {
  readonly ok: boolean;
  readonly warning: BridgeWarning | null;
}

/** 줄 하나가 받아도 되는 것인지 본다(순수 함수 — 파이썬 쪽 템플릿과 화면이 같은 규칙을 쓴다). */
export function checkInbound(text: string, policy: BridgeInboundPolicy = {}): BridgeInboundCheck {
  const limit = policy.maxBytes ?? BRIDGE_MAX_BYTES;
  const length = byteLengthOf(text);
  if (length > limit) {
    return { ok: false, warning: bridgeWarning('not-allowed', bridgeText.receivedTooLong(length, limit)) };
  }
  const allow = policy.allow;
  if (allow !== undefined && allow.length > 0 && !allow.includes(text.trim())) {
    return { ok: false, warning: bridgeWarning('not-allowed', bridgeText.notAllowed(text, allow)) };
  }
  return { ok: true, warning: null };
}

export interface BridgeInboxOptions extends BridgeInboundPolicy {
  /** 한 줄이 완성됐다 */
  readonly onLine?: (line: string) => void;
  /** 거른 줄이 있다 */
  readonly onRejected?: (line: string, warning: BridgeWarning) => void;
  /** 모아 둘 수 있는 줄 수(넘으면 오래된 줄부터 버린다, 기본 200) */
  readonly maxLines?: number;
  /** 끝 문자를 기다리지 않고 온 바이트를 그대로 한 덩어리로 준다(원시 바이트 모드, §7.2 규칙 7) */
  readonly raw?: boolean;
}

/**
 * 받은 바이트를 줄로 모으는 곳.
 *
 *   const inbox = new BridgeInbox({ allow: ['a', 'b'] });
 *   channel.on('message', (envelope) => inbox.push(envelope.bytes));
 *   inbox.take();   // 'a' 또는 없으면 null  ← bridge.receive()가 이것을 쓴다
 */
export class BridgeInbox {
  private readonly options: BridgeInboxOptions;
  private readonly lines: string[] = [];
  private tail = '';

  constructor(options: BridgeInboxOptions = {}) {
    this.options = options;
  }

  /** 아직 꺼내지 않은 줄 수 */
  get length(): number {
    return this.lines.length;
  }

  /** 끝 문자를 기다리는 꼬리(실물 링버퍼에 남은 부분) */
  get pendingTail(): string {
    return this.tail;
  }

  /** 통로에서 온 바이트를 넣는다. 끝 문자가 나오면 줄이 된다. */
  push(bytes: Uint8Array | string): void {
    const text = typeof bytes === 'string' ? bytes : decoder.decode(bytes, { stream: true });
    if (this.options.raw === true) {
      this.accept(text);
      return;
    }
    this.tail += text;
    let index = this.tail.indexOf('\n');
    while (index >= 0) {
      const line = this.tail.slice(0, index).replace(/\r$/u, '');
      this.tail = this.tail.slice(index + 1);
      this.accept(line);
      index = this.tail.indexOf('\n');
    }
  }

  private accept(line: string): void {
    const check = checkInbound(line, this.options);
    if (!check.ok) {
      if (check.warning !== null) {
        this.options.onRejected?.(line, check.warning);
      }
      return;
    }
    this.lines.push(line);
    const max = this.options.maxLines ?? 200;
    while (this.lines.length > max) {
      this.lines.shift();
    }
    this.options.onLine?.(line);
  }

  /** 가장 먼저 온 줄을 꺼낸다. 없으면 null(파이썬 `bridge.receive()`가 None으로 바꾼다). */
  take(): string | null {
    return this.lines.shift() ?? null;
  }

  /** 모아 둔 줄을 모두 꺼낸다 */
  takeAll(): string[] {
    const all = this.lines.slice();
    this.lines.length = 0;
    return all;
  }

  /** 꺼내지 않고 들여다본다 */
  peek(): string | null {
    return this.lines[0] ?? null;
  }

  /** 모아 둔 것과 꼬리를 모두 버린다(실행을 새로 시작할 때) */
  clear(): void {
    this.lines.length = 0;
    this.tail = '';
  }
}
