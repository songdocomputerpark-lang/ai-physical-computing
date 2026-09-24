// 가상 블루투스(BLE) 부품의 순수 논리 — src/lab/modules/board/parts/ble/ble-state.ts.
// PLAN §7.2 PD-06(메시지 모양·끝 문자·20바이트), §7.5(자료의 실제 메시지), CODE_MAPPING §6.1, §8.4 P4-03.
import { describe, expect, it } from 'vitest';
import {
  BLE_MAX_VALUE_BYTES,
  bleCountsText,
  bleLastReceivedText,
  bleStatusText,
  bytesText,
  coordinateMessage,
  COORDINATE_RANGES,
  COORDINATE_SHAPES,
  encodeText,
  hexText,
  isConnected,
  logLine,
  parseBleState,
  phoneAppFrame,
  previewOf,
  rangeById,
} from '../../../src/lab/modules/board/parts/ble/ble-state.ts';

const raw = {
  v: 1,
  active: true,
  advertising: true,
  connectable: true,
  intervalUs: 100,
  name: 'ESP32',
  mac: 'XX:XX:XX:XX:XX:XX',
  connections: [0],
  mtu: 23,
  chars: [{ handle: 2, write: true, notify: false, max: 20 }],
  rxTotal: 2,
  rxLast: [68, 65, 84, 65],
  rxTruncated: 1,
  txTotal: 1,
  txLast: [111, 107],
};

describe('parseBleState — 파이썬이 보낸 상태 읽기', () => {
  it('모양이 맞으면 그대로 읽는다', () => {
    const state = parseBleState(raw);
    expect(state).not.toBeNull();
    expect(state?.name).toBe('ESP32');
    expect(state?.connections).toEqual([0]);
    expect(state?.chars).toEqual([{ handle: 2, write: true, notify: false, max: 20 }]);
    expect(state?.rxLast).toEqual([68, 65, 84, 65]);
    expect(isConnected(state)).toBe(true);
  });

  it('모양이 아니거나 판이 다르면 null(화면이 깨지지 않게 그 메시지만 버린다)', () => {
    expect(parseBleState(null)).toBeNull();
    expect(parseBleState('BLE')).toBeNull();
    expect(parseBleState([])).toBeNull();
    expect(parseBleState({ ...raw, v: 2 })).toBeNull();
  });

  it('빠진 칸은 안전한 기본값으로 채운다', () => {
    const state = parseBleState({ v: 1 });
    expect(state?.active).toBe(false);
    expect(state?.name).toBeNull();
    expect(state?.rxLast).toEqual([]);
    expect(state?.mtu).toBe(23);
    expect(isConnected(state)).toBe(false);
  });
});

describe('상태 글(색만으로 알리지 않게 글로도 적는다)', () => {
  it('실행 전·꺼짐·광고 중·연결됨을 가른다', () => {
    expect(bleStatusText(null, false)).toContain('멈춤');
    expect(bleStatusText(parseBleState({ v: 1 }), true)).toContain('꺼짐');
    expect(bleStatusText(parseBleState({ ...raw, connections: [] }), true)).toContain('광고 중');
    expect(bleStatusText(parseBleState(raw), true)).toContain('연결됨');
  });

  it('주고받은 수와 잘린 수를 한 줄로 적는다', () => {
    expect(bleCountsText(parseBleState(raw))).toBe('보드가 받은 값 2개 · 보드가 보낸 값 1개 · 20바이트가 넘어 잘린 값 1개');
    expect(bleCountsText(parseBleState({ ...raw, rxTruncated: 0 }))).toBe('보드가 받은 값 2개 · 보드가 보낸 값 1개');
  });

  it('보드가 받아 둔 값을 따로 보인다 — 20바이트에서 잘린 값이 그대로 보여야 한다(§7.7)', () => {
    expect(bleLastReceivedText(parseBleState(raw))).toBe('보드가 받아 둔 값: DATA');
    // 아직 아무것도 받지 않았으면 빈 줄(자리만 차지하지 않게)
    expect(bleLastReceivedText(parseBleState({ ...raw, rxTotal: 0, rxLast: [] }))).toBe('');
    expect(bleLastReceivedText(null)).toBe('');
    // 26글자를 보내도 보드에는 앞 20글자만 남는다 — 그 차이를 학생이 이 줄에서 본다
    const truncated = parseBleState({ ...raw, rxLast: [...encodeText('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'none').slice(0, BLE_MAX_VALUE_BYTES)] });
    expect(bleLastReceivedText(truncated)).toBe('보드가 받아 둔 값: ABCDEFGHIJKLMNOPQRST');
  });
});

describe('바이트를 글로', () => {
  it('읽을 수 있는 글자는 그대로, 줄바꿈과 그 밖의 바이트는 알아볼 수 있게', () => {
    expect(bytesText([97, 10])).toBe('a\\n');
    expect(bytesText([0xff, 0x02])).toBe('\\xff\\x02');
    expect(bytesText([])).toBe('');
    expect(hexText([0xff, 0x02, 0x01])).toBe('ff 02 01');
  });

  it('기록 한 줄에 방향을 적는다', () => {
    expect(logLine('send', [97, 10])).toBe('→ 보냄  a\\n');
    expect(logLine('receive', [111, 107])).toBe('← 보드가 보냄  ok');
  });
});

describe('보낼 값 만들기(PLAN §7.2)', () => {
  it('규칙 2 — 끝 문자는 \\n 한 개, 이미 있으면 더 붙이지 않는다', () => {
    expect(encodeText('a', 'lf')).toEqual([97, 10]);
    expect(encodeText('a\n', 'lf')).toEqual([97, 10]);
    expect(encodeText('a', 'none')).toEqual([97]);
  });

  it('한글도 UTF-8로 보낸다', () => {
    expect(encodeText('가', 'none')).toEqual([0xea, 0xb0, 0x80]);
  });

  it('규칙 1 — 자료의 좌표 모양 세 가지를 만든다', () => {
    expect(coordinateMessage('plain', 355, 152)).toBe('355,152');
    expect(coordinateMessage('data3', 120, 80)).toBe('DATA,120,80');
    expect(coordinateMessage('data5', 1920, 1080)).toBe('DATA,1920,1080,0,0');
    // 클릭(윙크)은 4번째 칸이 1 — 브릿지가 이벤트로 보존하는 모양(§7.6-③)
    expect(coordinateMessage('data5', 1930, 1075, 1)).toBe('DATA,1930,1075,1,0');
    expect(coordinateMessage('plain', 10.4, 20.6)).toBe('10,21');
  });

  it('보내는 모양·좌표 범위 목록', () => {
    expect(COORDINATE_SHAPES.map(([id]) => id)).toEqual(['plain', 'data3', 'data5']);
    expect(COORDINATE_RANGES.map((range) => range.id)).toEqual(['camera', 'screen']);
    expect(rangeById('screen')).toEqual({ id: 'screen', label: '화면 좌표(3840×2160)', width: 3840, height: 2160 });
    expect(rangeById('없는 값').id).toBe('camera');
  });

  it('규칙 3 — 20바이트를 넘으면 경고하지만 보내는 것을 막지 않는다(§7.7 실물처럼 잘리는 것을 보여 준다)', () => {
    const short = previewOf(encodeText('DATA,1920,1080,0,0', 'lf'));
    expect(short.bytes.length).toBe(19);
    expect(short.warning).toBeNull();
    const long = previewOf(encodeText('DATA,1920,1080,1,1234', 'lf'));
    expect(long.bytes.length).toBeGreaterThan(BLE_MAX_VALUE_BYTES);
    expect(long.warning).toContain('20바이트');
    expect(long.text).toContain('DATA,1920,1080,1,1234');
  });
});

describe('가상 스마트폰 앱 프레임(CODE_MAPPING §6.1 B6 — f002)', () => {
  it('앞 네 바이트가 FF 02 01 01이고 [5:-1]이 눌린 숫자다', () => {
    const frame = phoneAppFrame('2');
    expect(frame.slice(0, 4)).toEqual([0xff, 0x02, 0x01, 0x01]);
    expect(String.fromCharCode(...frame.slice(5, frame.length - 1))).toBe('2');
    expect(frame.length).toBeLessThanOrEqual(BLE_MAX_VALUE_BYTES);
  });

  it('버튼 1·2·3이 서로 다르다', () => {
    expect(phoneAppFrame('1')).not.toEqual(phoneAppFrame('3'));
  });
});
