// 데이터 포트(P4-05)의 순수 논리: 속도 목록·이름표·받은 바이트 보여 주기.
// 브라우저·포트 없이 값만으로 확인한다(포트를 실제로 여는 것은 data-port-connection.test.ts).
import { describe, expect, it } from 'vitest';
import {
  DATA_PORT_BAUD_RATES,
  DATA_PORT_LABEL_MAX,
  DEFAULT_DATA_PORT_BAUD,
  ByteLog,
  PortLabelStore,
  baudLabel,
  baudMismatchNotice,
  decodeUtf8,
  defaultLabel,
  identifyPort,
  isListedBaud,
  looksLikeBoardRepl,
  normalizeBaud,
  portLabelText,
  sanitizeLabel,
  toHex,
  visibleText,
  dataPortText,
} from '../../../src/lab/serial/data-port/index.ts';
import { USB_IDS } from '../../../src/lab/serial/mock/mock-port.ts';

describe('통신 속도 고르기', () => {
  it('교과서 3-1-2가 쓰는 115200이 기본이고 목록에 있다', () => {
    expect(DEFAULT_DATA_PORT_BAUD).toBe(115200);
    expect(isListedBaud(115200)).toBe(true);
    expect(DATA_PORT_BAUD_RATES.find((item) => item.rate === 115200)?.note).toContain('3-1-2');
  });

  it('HW 예제·MP3가 쓰는 9600도 목록에 있다', () => {
    expect(isListedBaud(9600)).toBe(true);
    expect(baudLabel(9600)).toBe('9600 bps');
  });

  it('목록에 없는 값도 글로 만들 수 있다', () => {
    expect(baudLabel(31250)).toBe('31250 bps');
  });

  it('저장 공간이 깨졌거나 터무니없는 값이면 기본값으로 되돌린다', () => {
    expect(normalizeBaud('115200')).toBe(115200);
    expect(normalizeBaud(0)).toBe(DEFAULT_DATA_PORT_BAUD);
    expect(normalizeBaud(-1)).toBe(DEFAULT_DATA_PORT_BAUD);
    expect(normalizeBaud(9_000_000)).toBe(DEFAULT_DATA_PORT_BAUD);
    expect(normalizeBaud('빠르게')).toBe(DEFAULT_DATA_PORT_BAUD);
    expect(normalizeBaud(null)).toBe(DEFAULT_DATA_PORT_BAUD);
    expect(normalizeBaud(115200.5)).toBe(DEFAULT_DATA_PORT_BAUD);
  });

  it('보드 코드와 속도가 다르면 한국어로 알린다', () => {
    expect(baudMismatchNotice(9600, 115200)).toContain('글자가 깨져서');
    expect(baudMismatchNotice(115200, 115200)).toBeNull();
    expect(baudMismatchNotice(115200, null)).toBeNull();
  });
});

describe('포트 이름표', () => {
  it('USB VID·PID로 열쇠와 칩 이름을 만든다(CH340)', () => {
    const identity = identifyPort({ ...USB_IDS.ch340 });
    expect(identity.key).toBe('usb:1a86:7523');
    expect(identity.text).toContain('CH340');
    expect(defaultLabel(identity)).toBe('데이터 포트(CH340)');
  });

  it('정보를 모르는 포트도 열쇠가 있다', () => {
    expect(identifyPort(null).key).toBe('unknown');
    expect(defaultLabel(identifyPort(null))).toBe('데이터 포트');
    expect(defaultLabel(null)).toBe('데이터 포트');
  });

  it('이름표는 제어 글자를 지우고 20자로 자른다', () => {
    expect(sanitizeLabel('  변환기\n1  ')).toBe('변환기 1');
    expect(sanitizeLabel('가'.repeat(30))).toHaveLength(DATA_PORT_LABEL_MAX);
    expect(sanitizeLabel('')).toBe('');
  });

  it('이름표가 없으면 기본 이름이 보인다', () => {
    const identity = identifyPort({ ...USB_IDS.cp2102 });
    expect(portLabelText('', identity)).toBe('데이터 포트(CP210x)');
    expect(portLabelText('왼쪽 USB', identity)).toBe('왼쪽 USB');
  });

  it('저장한 이름표를 열쇠로 읽고 쓴다(빈 글이면 지운다)', () => {
    let saved: string | null = null;
    const store = new PortLabelStore({ read: () => saved, write: (value) => (saved = value) });
    store.set('usb:1a86:7523', ' 변환기 ');
    expect(store.get('usb:1a86:7523')).toBe('변환기');
    expect(JSON.parse(saved ?? '{}')).toEqual({ 'usb:1a86:7523': '변환기' });
    store.set('usb:1a86:7523', '');
    expect(store.get('usb:1a86:7523')).toBe('');
  });

  it('저장 공간이 막혀 있거나 값이 깨져도 오류를 내지 않는다', () => {
    const broken = new PortLabelStore({
      read: () => {
        throw new Error('저장 공간이 막혔어요');
      },
      write: () => {
        throw new Error('저장 공간이 막혔어요');
      },
    });
    expect(broken.all()).toEqual({});
    expect(() => broken.set('usb:1a86:7523', '변환기')).not.toThrow();
    const junk = new PortLabelStore({ read: () => '[1,2,3]' });
    expect(junk.all()).toEqual({});
    const partly = new PortLabelStore({ read: () => '{"usb:1a86:7523": 7, "usb:10c4:ea60": "  "}' });
    expect(partly.all()).toEqual({});
  });

  it('보드 REPL 포트를 고르면 받은 글에 MicroPython 자국이 보인다', () => {
    expect(looksLikeBoardRepl('MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32\r\n')).toBe(true);
    expect(looksLikeBoardRepl('raw REPL; CTRL-B to exit\r\n>')).toBe(true);
    expect(looksLikeBoardRepl('\r\n>>> ')).toBe(true);
    expect(looksLikeBoardRepl('a\nb\n355,152\n')).toBe(false);
  });
});

describe('받은 바이트 보여 주기', () => {
  it('글자와 16진수를 함께 보여 준다', () => {
    const log = new ByteLog();
    log.push(new TextEncoder().encode('355,152\n'));
    const view = log.view();
    expect(view.total).toBe(8);
    expect(view.lines).toEqual(['355,152']);
    expect(view.partial).toBe('');
    expect(view.hex.endsWith('0a')).toBe(true);
  });

  it('줄바꿈이 오지 않은 꼬리는 따로 보여 준다(실물처럼 누적)', () => {
    const log = new ByteLog();
    log.push(new TextEncoder().encode('a'));
    log.push(new TextEncoder().encode('b'));
    expect(log.view().lines).toEqual([]);
    expect(log.view().partial).toBe('ab');
    log.push(new TextEncoder().encode('\n'));
    expect(log.view().lines).toEqual(['ab']);
  });

  it('보드가 보내는 \\r\\n도 한 줄로 본다', () => {
    const log = new ByteLog();
    log.push(new TextEncoder().encode('hello world\r\n'));
    expect(log.view().lines).toEqual(['hello world']);
  });

  it('속도가 달라 깨진 바이트는 글자 칸에서 �가 되고 16진수에는 남는다', () => {
    const log = new ByteLog();
    log.push(Uint8Array.of(0xff, 0xfe, 0x61));
    const view = log.view();
    expect(view.text).toContain('�');
    expect(view.hex).toBe('ff fe 61');
  });

  it('오래된 바이트는 버리지만 전체 수는 센다', () => {
    const log = new ByteLog(16);
    log.push(new TextEncoder().encode('0123456789'));
    log.push(new TextEncoder().encode('abcdefghij'));
    expect(log.total).toBe(20);
    expect(log.bytes()).toHaveLength(16);
    expect(log.view().text.endsWith('abcdefghij')).toBe(true);
  });

  it('원시 바이트 명령(MP3 프레임)은 16진수로 읽을 수 있다', () => {
    expect(toHex(Uint8Array.of(0x7e, 0xff, 0x06, 0x03, 0x00, 0x00, 0x01, 0xef))).toBe('7e ff 06 03 00 00 01 ef');
    expect(decodeUtf8(new TextEncoder().encode('안녕'))).toBe('안녕');
  });

  it('콘솔 한 줄에는 보이지 않는 글자를 눈에 보이게 적는다', () => {
    expect(visibleText('a\n')).toBe('a⏎');
    expect(visibleText('a\r\n')).toBe('a␍⏎');
    expect(visibleText('\x03')).toBe('\\x03');
  });
});

describe('화면에 보이는 한국어 문장', () => {
  it('이름표에 맞는 조사를 붙인다(학생이 적는 글이라 받침이 제각각이다)', () => {
    expect(dataPortText.state('open', '변환기', 115200)).toBe('변환기가 115200 bps로 열려 있어요.');
    // "1"은 "일"로 읽어 ㄹ 받침이라 "이"가 붙는다
    expect(dataPortText.state('open', '자리 1', 9600)).toBe('자리 1이 9600 bps로 열려 있어요.');
    expect(dataPortText.state('open', '왼쪽 USB', 115200)).toContain('왼쪽 USB');
  });

  it('상태마다 무엇을 하면 되는지 한 문장으로 알린다', () => {
    expect(dataPortText.state('idle', '데이터 포트', 115200)).toContain('[데이터 포트 연결]');
    expect(dataPortText.state('unsupported', '데이터 포트', 115200)).toContain('열 수 없어요');
    // 상태 이름이 늘면 빈 글이 나오지 않게(스위치에 빠진 가지가 없는지)
    for (const state of ['unsupported', 'idle', 'choosing', 'opening', 'open', 'closing', 'error'] as const) {
      expect(dataPortText.state(state, '변환기', 115200).length).toBeGreaterThan(5);
    }
  });
});
