/**
 * 받는 차례 — 줄 모으기(§7.7·CODE_MAPPING §6.2 누적 링버퍼)와 거르기(PD-29 허용 목록·길이)를 확인한다(P4-01).
 */
import { describe, expect, it } from 'vitest';
import { BridgeInbox, checkInbound, type BridgeWarning } from '../../../src/lab/bridge/index.ts';
import { bytes } from './helpers/fake.ts';

describe('줄 모으기 — 실물 UART처럼 누적한다', () => {
  it('끝 문자가 올 때까지 기다렸다가 한 줄로 준다', () => {
    const inbox = new BridgeInbox();
    inbox.push(bytes('35'));
    expect(inbox.take()).toBeNull();
    inbox.push(bytes('5,152'));
    expect(inbox.take()).toBeNull();
    inbox.push(bytes('\n'));
    expect(inbox.take()).toBe('355,152');
  });

  it('한꺼번에 온 여러 줄을 차례대로 준다', () => {
    const inbox = new BridgeInbox();
    inbox.push(bytes('a\nb\nc\n'));
    expect([inbox.take(), inbox.take(), inbox.take(), inbox.take()]).toEqual(['a', 'b', 'c', null]);
  });

  it('\\r\\n으로 끝나도 \\r을 뗀다(원본 코드의 strip과 같은 결과)', () => {
    const inbox = new BridgeInbox();
    inbox.push(bytes('a\r\n'));
    expect(inbox.take()).toBe('a');
  });

  it('끝 문자가 없는 꼬리는 다음 바이트를 기다린다', () => {
    const inbox = new BridgeInbox();
    inbox.push(bytes('ab'));
    expect(inbox.pendingTail).toBe('ab');
    expect(inbox.length).toBe(0);
  });

  it('원시 바이트 모드는 끝 문자를 기다리지 않는다(§7.2 규칙 7)', () => {
    const inbox = new BridgeInbox({ raw: true });
    inbox.push(bytes('ab'));
    expect(inbox.take()).toBe('ab');
  });

  it('여러 글자 UTF-8이 두 번에 나뉘어 와도 깨지지 않는다', () => {
    const inbox = new BridgeInbox();
    const source = bytes('가나\n');
    inbox.push(source.slice(0, 4));
    inbox.push(source.slice(4));
    expect(inbox.take()).toBe('가나');
  });

  it('너무 많이 쌓이면 오래된 줄부터 버린다', () => {
    const inbox = new BridgeInbox({ maxLines: 2 });
    inbox.push(bytes('1\n2\n3\n'));
    expect([inbox.take(), inbox.take(), inbox.take()]).toEqual(['2', '3', null]);
  });
});

describe('PD-29 거르기 — 허용 목록과 길이', () => {
  it('허용 목록에 있는 것만 받는다', () => {
    const rejected: Array<{ line: string; warning: BridgeWarning }> = [];
    const inbox = new BridgeInbox({ allow: ['a', 'b'], onRejected: (line, warning) => rejected.push({ line, warning }) });
    inbox.push(bytes('a\nx\nb\n'));
    expect([inbox.take(), inbox.take(), inbox.take()]).toEqual(['a', 'b', null]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.warning.code).toBe('not-allowed');
    expect(rejected[0]?.warning.text).toContain('허용한 명령');
  });

  it('허용 목록을 주지 않으면 모두 받는다', () => {
    const inbox = new BridgeInbox();
    inbox.push(bytes('무엇이든\n'));
    expect(inbox.take()).toBe('무엇이든');
  });

  it('20바이트를 넘는 줄은 버리고 한국어로 알린다', () => {
    const rejected: BridgeWarning[] = [];
    const inbox = new BridgeInbox({ onRejected: (_line, warning) => rejected.push(warning) });
    inbox.push(bytes('DATA,1234567,1234567,1\n'));
    expect(inbox.take()).toBeNull();
    expect(rejected[0]?.text).toContain('20바이트');
  });

  it('checkInbound는 화면·템플릿이 같이 쓰는 순수 함수다', () => {
    expect(checkInbound('a', { allow: ['a'] }).ok).toBe(true);
    expect(checkInbound(' a ', { allow: ['a'] }).ok).toBe(true); // 앞뒤 공백은 뗀다(strip과 같게)
    expect(checkInbound('rm -rf', { allow: ['a'] }).ok).toBe(false);
    expect(checkInbound('가'.repeat(7)).ok).toBe(false);
  });
});

describe('꺼내기·비우기', () => {
  it('takeAll은 모아 둔 줄을 모두 준다', () => {
    const inbox = new BridgeInbox();
    inbox.push(bytes('1\n2\n'));
    expect(inbox.takeAll()).toEqual(['1', '2']);
    expect(inbox.length).toBe(0);
  });

  it('peek은 꺼내지 않는다', () => {
    const inbox = new BridgeInbox();
    inbox.push(bytes('1\n'));
    expect(inbox.peek()).toBe('1');
    expect(inbox.length).toBe(1);
  });

  it('clear는 꼬리까지 버린다(실행을 새로 시작할 때)', () => {
    const inbox = new BridgeInbox();
    inbox.push(bytes('1\n2'));
    inbox.clear();
    expect(inbox.length).toBe(0);
    expect(inbox.pendingTail).toBe('');
  });
});
