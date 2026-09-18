// 부품 ble(보드 안 블루투스와 상대 기기 조작 칸) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.2 BLE 행·§8.4 P4-03.
// 순수 논리(상태 읽기·보낼 값 만들기)는 tests/unit/board-ble/ble-state.test.ts, 파이썬 쪽은 tests/unit/board-ble/pyodide-ble.test.ts에 있다.
import { describe, expect, it } from 'vitest';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import ble, { bleVisual } from '../../../src/lab/modules/board/parts/ble/part.ts';
import { stoppedSnapshot, type PartDeviceState } from '../../../src/lab/modules/board/state.ts';
import { snapshotWith } from './helpers/board-snapshot.ts';

function device(state: unknown, seq = 1): PartDeviceState {
  return { seq, state };
}

/** 광고 중(연결 전) 상태 — apc_board_ble.RADIO.state()와 같은 모양 */
const advertising = device({
  v: 1,
  active: true,
  advertising: true,
  connectable: true,
  intervalUs: 100,
  name: 'ESP32',
  mac: 'XX:XX:XX:XX:XX:XX',
  connections: [],
  mtu: 23,
  chars: [
    { handle: 1, write: false, notify: true, max: 20 },
    { handle: 2, write: true, notify: false, max: 20 },
  ],
  rxTotal: 0,
  rxLast: [],
  rxTruncated: 0,
  txTotal: 0,
  txLast: [],
});

const connected = device({
  v: 1,
  active: true,
  advertising: false,
  connectable: true,
  intervalUs: 100,
  name: 'ESP32',
  mac: 'XX:XX:XX:XX:XX:XX',
  connections: [0],
  mtu: 23,
  chars: [],
  rxTotal: 3,
  rxLast: [97],
  rxTruncated: 1,
  txTotal: 2,
  txLast: [111, 107, 10],
});

describe('ble 부품 정의', () => {
  it('레지스트리에 있고, 배선에 적는 핀은 ESP32BLE.py가 쓰는 상태 LED(GPIO12) 하나다', () => {
    expect(PART_DEFINITIONS.get('ble')).toBe(ble);
    expect(ble.pins).toEqual([{ role: 'led', label: '상태 LED', direction: 'out' }]);
    expect(ble.defaultPins).toEqual({ led: 12 });
    expect(ble.onboard).toBeUndefined();
    expect(ble.python).toBe('apc_part_ble');
    expect(typeof ble.controls).toBe('function');
    // 무선이 보드 안에 있다는 것을 설명·안내에 적는다(모듈을 따로 달아야 한다고 읽히지 않게)
    expect(ble.description).toContain('ESP32 보드 안에');
    expect(ble.defaultPinsNotice).toContain('선이 필요 없어요');
  });

  it('핀 하나뿐이라 pin 줄임 표기로 적을 수 있고, GPIO12는 스트래핑 핀이라 주의를 알린다', () => {
    const resolved = resolveWiring([{ part: 'ble', pin: 12 }], PART_DEFINITIONS);
    const instance = resolved.instances.find((item) => item.part === 'ble');
    expect(instance?.pins).toEqual({ led: 12 });
    expect(resolved.issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(resolved.issues.map((issue) => issue.code)).toContain('strapping');
  });

  it('f148처럼 RGB LED 빨강이 같은 GPIO12에 있으면 "한 핀에 출력 부품 여럿"으로 알린다', () => {
    const resolved = resolveWiring(
      [
        { part: 'ble' },
        { part: 'rgb-led', pins: { r: 12, g: 5, b: 4 } },
      ],
      PART_DEFINITIONS,
    );
    expect(resolved.issues.map((issue) => issue.code)).toContain('shared-output');
  });
});

describe('bleVisual — 파이썬 상태 → 모습', () => {
  it('광고 중이면 이름과 광고 상태를 보인다', () => {
    const visual = bleVisual(snapshotWith([{ id: 12, mode: 'out', out: 1, level: 1, driven: true }], 'run'), advertising, 12);
    expect(visual.active).toBe(true);
    expect(visual.advertising).toBe(true);
    expect(visual.connected).toBe(false);
    expect(visual.name).toBe('ESP32');
    expect(visual.summary).toBe('광고 중');
    // 상태 LED는 핀 전압을 그대로 따른다(ESP32BLE.py의 Timer가 100ms마다 뒤집는다)
    expect(visual.lit).toBe(true);
    expect(visual.brightness).toBe(100);
    expect(visual.used).toBe(true);
  });

  it('연결되면 연결됨, 받은·보낸 수가 따라온다', () => {
    const visual = bleVisual(snapshotWith([{ id: 12, mode: 'out', out: 0, level: 0, driven: true }], 'run'), connected, 12);
    expect(visual.connected).toBe(true);
    expect(visual.summary).toBe('연결됨');
    expect(visual.rx).toBe(3);
    expect(visual.tx).toBe(2);
    expect(visual.lit).toBe(false);
  });

  it('[정지] 뒤에는 꺼진 모습이고 상태 LED도 꺼진다', () => {
    const stopped = stoppedSnapshot(snapshotWith([{ id: 12, mode: 'out', out: 1, level: 1, driven: true }], 'run'));
    const visual = bleVisual(stopped, connected, 12);
    expect(visual.summary).toBe('꺼짐');
    expect(visual.lit).toBe(false);
    expect(visual.brightness).toBe(0);
    expect(visual.connected).toBe(false);
  });

  it('코드가 상태 LED 핀을 한 번도 쓰지 않으면 used가 false다(esp32_ble_util를 쓰는 예제)', () => {
    const visual = bleVisual(snapshotWith([{ id: 25, mode: 'out', out: 1, level: 1, driven: true }], 'run'), advertising, 12);
    expect(visual.used).toBe(false);
    expect(visual.lit).toBe(false);
  });
});
