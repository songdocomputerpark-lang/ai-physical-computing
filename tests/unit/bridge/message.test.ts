/**
 * PLAN §7.2 규칙 1·2·3·7·8을 하나씩 확인한다(P4-01).
 * 보기로 쓰는 메시지는 모두 자료에 실제로 있는 것이다(CODE_MAPPING §6.1 U1~U4·B2~B5).
 */
import { describe, expect, it } from 'vitest';
import {
  BRIDGE_MAX_BYTES,
  BRIDGE_TERMINATOR,
  classifyText,
  inspectBytes,
  rawMessage,
  sentLineOf,
  textMessage,
} from '../../../src/lab/bridge/index.ts';
import { bytes, textOf } from './helpers/fake.ts';

describe('§7.2 규칙 1 — 메시지 모양 세 가지', () => {
  it('명령 한 글자(a·b·c)는 command다', () => {
    for (const command of ['a', 'b', 'c']) {
      const found = classifyText(command);
      expect(found.shape).toBe('command');
      expect(found.category).toBe('state');
      // 같은 글자끼리만 합쳐진다(§7.6 ④)
      expect(found.mergeKey).toBe(`command:${command}`);
    }
    expect(classifyText('a').mergeKey).not.toBe(classifyText('b').mergeKey);
  });

  it('값 하나(손가락 개수 3)와 값 목록(355,152)은 values다', () => {
    expect(classifyText('3')).toMatchObject({ shape: 'values', fieldCount: 1, mergeKey: 'values:1' });
    expect(classifyText('355,152')).toMatchObject({ shape: 'values', fieldCount: 2, mergeKey: 'values:2' });
    // 손가락 개수 3 → 4는 같은 자리라 바뀌어 끼워진다
    expect(classifyText('3').mergeKey).toBe(classifyText('4').mergeKey);
  });

  it('머리말 + 필드(DATA,120,80)는 fields이고 머리말·필드 수가 같아야 같은 자리다', () => {
    const three = classifyText('DATA,120,80');
    expect(three).toMatchObject({ shape: 'fields', header: 'DATA', fieldCount: 3, category: 'state' });
    expect(classifyText('DATA,300,200').mergeKey).toBe(three.mergeKey);
    // 필드 수가 다르면 다른 자리(f099의 3필드와 f105의 5필드가 섞이지 않는다)
    expect(classifyText('DATA,1,2,0,0').mergeKey).not.toBe(three.mergeKey);
  });

  it('세 모양 어디에도 안 맞는 글은 other지만 보내기는 된다', () => {
    expect(classifyText('hello world').shape).toBe('other');
  });
});

describe('자료에 있는 메시지가 각각 어떻게 판정되나(CODE_MAPPING §6.1 U1~U5·B1~B6·D1)', () => {
  const cases: Array<[string, string, string, string]> = [
    // [무엇, 보내는 글, 모양, 갈래]
    ['U1·U2·B2 레이저 켜기/끄기(f084·f085·f140)', 'a', 'command', 'state'],
    ['B1 한 글자(f138)', 'c', 'command', 'state'],
    ['U3 색 번호(f001)', '3', 'values', 'state'],
    ['R1 보드 콘솔 입력(f049)', '1', 'values', 'state'],
    ['R1 콘솔에서 끝내기', 'q', 'command', 'state'],
    ['B3 검지 좌표(f089 = f158)', '355,152', 'values', 'state'],
    ['B4 코 좌표(f100)', 'DATA,120,80', 'fields', 'state'],
    ['B5 얼굴 마우스 보통 프레임(f104)', 'DATA,1920,1080,0,0', 'fields', 'state'],
    ['B5 윙크(왼쪽 클릭)', 'DATA,1930,1075,1,0', 'fields', 'event'],
    ['B5 오른쪽 클릭', 'DATA,1920,1080,0,1', 'fields', 'event'],
    ['U5 시작 인사(f001·f007)', 'hello world', 'other', 'state'],
  ];

  it.each(cases)('%s → %s', (_what, text, shape, category) => {
    const found = classifyText(text);
    expect(found.shape).toBe(shape);
    expect(found.category).toBe(category);
  });

  it('이진 프레임은 글이 아니라 바이트로 본다(B6 스마트폰 앱, D1 MP3 명령)', () => {
    expect(rawMessage(Uint8Array.of(0xff, 0x02, 0x01, 0x01)).shape).toBe('bytes'); // 0xFF는 UTF-8이 아니다
    expect(rawMessage(Uint8Array.of(0x7e, 0xff, 0x06, 0x03, 0x00, 0x00, 0x01, 0xef)).shape).toBe('bytes');
    expect(rawMessage(Uint8Array.of(0x01)).shape).toBe('bytes'); // U4 원시 바이트(f007)
  });
});

describe('§7.2 규칙 2 — 끝 문자 \\n 한 개', () => {
  it('보낼 때 \\n을 한 개 붙인다', () => {
    expect(textOf(textMessage('a').bytes)).toBe('a\n');
    expect(BRIDGE_TERMINATOR).toBe('\n');
  });

  it('이미 \\n이 있으면 더 붙이지 않는다', () => {
    expect(textOf(textMessage('355,152\n').bytes)).toBe('355,152\n');
  });

  it('끝 문자를 없애고 보낼 수도 있다(원본 코드와 같은 모양)', () => {
    expect(textOf(textMessage('a', { terminator: '' }).bytes)).toBe('a');
  });
});

describe('§7.2 규칙 3 — 끝 문자까지 20바이트', () => {
  it('한도는 20바이트다(MicroPython GATT 기본 버퍼)', () => {
    expect(BRIDGE_MAX_BYTES).toBe(20);
  });

  it('자료에서 가장 긴 메시지(DATA,3839,2159,1,1)는 한도 안이다', () => {
    const message = textMessage('DATA,3839,2159,1,1');
    expect(message.bytes.length).toBe(19);
    expect(message.warnings).toHaveLength(0);
  });

  it('20바이트를 넘으면 한국어로 경고한다(보내기를 막지는 않는다 — 실물처럼 잘리는 것을 보여 준다)', () => {
    const message = textMessage('DATA,123456,123456,1,1');
    expect(message.bytes.length).toBeGreaterThan(BRIDGE_MAX_BYTES);
    const warning = message.warnings.find((item) => item.code === 'too-long');
    expect(warning).toBeDefined();
    expect(warning?.text).toContain('20바이트');
    expect(warning?.text).toContain('잘려요');
  });

  it('한글은 한 글자가 3바이트라 일곱 글자에서 걸린다', () => {
    expect(textMessage('가나다나다라가').warnings.some((item) => item.code === 'too-long')).toBe(true);
  });

  it('가운데 줄바꿈과 빈 메시지도 알린다', () => {
    expect(textMessage('a\nb').warnings.some((item) => item.code === 'newline-inside')).toBe(true);
    expect(inspectBytes(new Uint8Array(0), '')[0]?.code).toBe('empty');
  });
});

describe('§7.2 규칙 5 — 상태와 이벤트', () => {
  it('좌표·개수는 상태라 같은 자리가 있다', () => {
    expect(textMessage('355,152').category).toBe('state');
    expect(textMessage('355,152').mergeKey).not.toBeNull();
  });

  it('DATA 5필드에서 클릭 표시가 1이면 이벤트라 절대 바뀌지 않는다(§7.6 ③)', () => {
    const click = textMessage('DATA,1930,1075,1,0');
    expect(click.category).toBe('event');
    expect(click.mergeKey).toBeNull();
    const rightClick = textMessage('DATA,1930,1075,0,1');
    expect(rightClick.category).toBe('event');
    // 클릭이 아닌 프레임은 상태다
    expect(textMessage('DATA,1920,1080,0,0').category).toBe('state');
  });

  it('bridge.event처럼 갈래를 못 박으면 모양과 상관없이 이벤트다', () => {
    const forced = textMessage('3', { category: 'event' });
    expect(forced.category).toBe('event');
    expect(forced.mergeKey).toBeNull();
  });
});

describe('§7.2 규칙 7·8 — 원시 바이트와 원본 코드', () => {
  it('원시 바이트는 끝 문자를 붙이지 않고 그대로 나간다(f007의 0x03)', () => {
    const message = rawMessage(Uint8Array.of(3));
    expect(Array.from(message.bytes)).toEqual([3]);
    expect(message.shape).toBe('bytes');
    expect(message.mergeKey).toBeNull();
    expect(message.text).toBeNull();
  });

  it('원본 코드가 보낸 글자 바이트도 한 바이트도 더하지 않는다(f084의 b"a")', () => {
    const message = rawMessage(bytes('a'));
    expect(textOf(message.bytes)).toBe('a');
    expect(message.text).toBe('a');
    // 모양은 알아보므로 병합 규칙(§7.6 ④)이 그대로 걸린다
    expect(message.shape).toBe('command');
    expect(message.mergeKey).toBe('command:a');
  });

  it('원본 코드가 끝 문자를 붙였으면 그 바이트를 그대로 두고 모양만 끝 문자 없이 본다', () => {
    const message = rawMessage(bytes('355,152\n'));
    expect(textOf(message.bytes)).toBe('355,152\n');
    expect(message.text).toBe('355,152');
    expect(message.shape).toBe('values');
  });

  it('넘겨준 배열을 나중에 고쳐도 메시지는 바뀌지 않는다', () => {
    const source = bytes('a');
    const message = rawMessage(source);
    source[0] = 98;
    expect(textOf(message.bytes)).toBe('a');
  });
});

describe('§7.6 규칙 ⑤ — 콘솔에 Sent: …', () => {
  it('글자 메시지는 끝 문자 없이 보여 준다', () => {
    expect(sentLineOf(textMessage('355,152'))).toBe('Sent: 355,152');
  });

  it('원시 바이트는 16진수로 보여 준다', () => {
    expect(sentLineOf(rawMessage(Uint8Array.of(0x7e, 0xff)))).toBe('Sent: 7E FF');
  });
});
