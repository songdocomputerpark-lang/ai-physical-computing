// 부품 uart(USB-UART 변환기와 컴퓨터 시리얼 창) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.2 "UART2 상대 장치 — 송신 패널"·§8.3 P3-05.
// (구역 C 병렬 제작: 이 파일은 통합 때 tests/unit/board-uart/에서 tests/unit/lab/board-part-uart.test.ts로 옮긴 파일 — board-parts.test.ts가 그 자리를 찾는다. 가져오는 경로는 두 폴더 깊이가 같아 그대로다.)
import { describe, expect, it } from 'vitest';
import { stoppedSnapshot, type PartDeviceState } from '../../../src/lab/modules/board/state.ts';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import uart, { uartShortText, uartVisual } from '../../../src/lab/modules/board/parts/uart/part.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

function device(state: unknown, seq = 1): PartDeviceState {
  return { seq, state };
}

const connected = device({ v: 1, choice: 'auto', baud: 9600, boardBaud: 9600, rxTotal: 11, rxTail: [104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100], txTotal: 1, lastSend: { bytes: 1, reached: 1 }, mismatch: false });

describe('uart 부품 정의', () => {
  it('레지스트리에 있고 교차 결선 기본 핀(변환기 RX ← 보드 TX 17, 변환기 TX → 보드 RX 16)을 쓴다', () => {
    expect(PART_DEFINITIONS.get('uart')).toBe(uart);
    expect(uart.pins).toEqual([
      { role: 'rx', label: 'RX 받기', direction: 'out' },
      { role: 'tx', label: 'TX 보내기', direction: 'in' },
    ]);
    expect(uart.defaultPins).toEqual({ rx: 17, tx: 16 });
    // 실물 변환기는 자기 USB 전원 — GND만 잇고 VCC는 잇지 않는다(P3-11에서 부품 규약에 vcc: false를 더했다)
    expect(uart.power).toEqual({ gnd: { x: 45, y: 70 }, vcc: false });
    expect(typeof uart.controls).toBe('function');
    expect(uart.sound).toBeUndefined();
  });

  it('f001·f007 배선(uart + RGB LED 23·25·26)은 문제 없이 풀린다', () => {
    const resolved = resolveWiring(
      [
        { part: 'uart', pins: { rx: 17, tx: 16 } },
        { part: 'rgb-led', pins: { r: 23, g: 25, b: 26 } },
      ],
      PART_DEFINITIONS,
    );
    expect(resolved.instances.map((instance) => instance.id)).toEqual(expect.arrayContaining(['uart', 'rgb-led']));
    expect(resolved.issues.filter((issue) => issue.level === 'error')).toEqual([]);
  });

  it('MP3 모듈과 같은 보드 RX 핀(16)에 함께 이으면 입력 부품 둘로 알린다', () => {
    const resolved = resolveWiring([{ part: 'uart' }, { part: 'mp3' }], PART_DEFINITIONS);
    expect(resolved.issues.map((issue) => issue.code)).toContain('shared-input');
  });
});

describe('uartVisual — 변환기 흉내 상태 → 모습', () => {
  it('실행 중 이어지면 속도·오간 바이트 수를 보인다', () => {
    const visual = uartVisual(snapshotWith([], 'run'), connected);
    expect(visual).toEqual({ phase: 'run', connected: true, baud: 9600, boardBaud: 9600, rx: 11, tx: 1, mismatch: false, reached: 1 });
    expect(uartShortText(visual)).toBe('9600bps');
  });

  it('보드 UART가 없거나 속도가 다르면 그 모습', () => {
    const waiting = uartVisual(snapshotWith([], 'run'), device({ choice: 'auto', baud: null, boardBaud: null, rxTotal: 0, rxTail: [], txTotal: 0, lastSend: null, mismatch: false }));
    expect(waiting.connected).toBe(false);
    expect(uartShortText(waiting)).toBe('UART 기다림');
    const different = uartVisual(snapshotWith([], 'idle'), device({ choice: 115200, baud: 115200, boardBaud: 9600, rxTotal: 0, rxTail: [], txTotal: 0, lastSend: null, mismatch: false }));
    expect(different.mismatch).toBe(true);
    expect(uartShortText(different)).toBe('속도 다름');
    expect(uartShortText(uartVisual(snapshotWith([], 'run'), device({ boardBaud: 9600, baud: 9600, mismatch: true })))).toBe('속도 다름');
  });

  it('멈추면(stopped) 장치 상태를 읽지 않고 멈춘 모습, 코드가 끝나면(end) 마지막 수를 남긴다', () => {
    const stopped = uartVisual(stoppedSnapshot(snapshotWith([], 'run')), connected);
    expect(stopped).toEqual({ phase: 'stopped', connected: false, baud: 0, boardBaud: 0, rx: 0, tx: 0, mismatch: false, reached: -1 });
    expect(uartShortText(stopped)).toBe('멈춤');
    expect(uartVisual(snapshotWith([], 'end'), connected).rx).toBe(11);
    expect(uartVisual(snapshotWith([], 'run'), undefined).connected).toBe(false);
  });

  it('visual은 배선 id와 상관없는 순수 함수다(부품 정의의 visual과 같다)', () => {
    const snapshot = snapshotWith([], 'run');
    expect(uart.visual({ snapshot, instance: instanceOf('uart', { rx: 17, tx: 16 }), active: false, reducedMotion: false, device: connected })).toEqual(uartVisual(snapshot, connected));
  });
});
