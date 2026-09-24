// 실제 블루투스 연결(Web Bluetooth) — src/lab/ble/connection.ts.
// PLAN §7.3(선택 창·응답 있는 쓰기·알림), §7.7(20바이트는 실물이 자른다), §8.4 P4-04.
// 가짜 navigator.bluetooth(src/lab/ble/mock/)로 돌린다 — 실물 기기의 증거는 아니다(운영자 확인, 부록 B).
import { describe, expect, it } from 'vitest';
import { BleConnection, chooserOptions, NUS_SERVICE_UUID } from '../../../src/lab/ble/index.ts';
import { createMockBluetooth, type MockBluetooth } from '../../../src/lab/ble/mock/index.ts';

function setup(config: Parameters<typeof createMockBluetooth>[0] = {}): { bluetooth: MockBluetooth; connection: BleConnection } {
  const bluetooth = createMockBluetooth(config);
  const connection = new BleConnection({ bluetooth: bluetooth as unknown as Bluetooth });
  return { bluetooth, connection };
}

const encoder = new TextEncoder();

describe('선택 창 설정(chooserOptions)', () => {
  it('이름 앞부분으로 거르고 NUS를 optionalServices에 적는다', () => {
    const options = chooserOptions({ namePrefix: 'ESP32' });
    expect(options.filters).toEqual([{ namePrefix: 'ESP32' }]);
    expect(options.optionalServices).toEqual([NUS_SERVICE_UUID]);
    expect(options.acceptAllDevices).toBeUndefined();
  });

  it('이름을 모를 때는 모두 보기 — filters와 acceptAllDevices를 함께 주지 않는다(MDN: 함께 주면 TypeError)', () => {
    const options = chooserOptions({ namePrefix: 'ESP32', acceptAll: true });
    expect(options.acceptAllDevices).toBe(true);
    expect(options.filters).toBeUndefined();
    expect(options.optionalServices).toEqual([NUS_SERVICE_UUID]);
  });

  it('이름 앞부분이 비어 있으면 모두 보기', () => {
    expect(chooserOptions({ namePrefix: '   ' }).acceptAllDevices).toBe(true);
  });
});

describe('연결 흐름', () => {
  it('이름 앞부분으로 고른 보드에 이어져 상태가 open이 된다', async () => {
    const { bluetooth, connection } = setup({ devices: [{ name: 'ESP32-07' }] });
    connection.setNamePrefix('ESP32');
    await connection.connect();
    expect(connection.snapshot.state).toBe('open');
    expect(connection.snapshot.deviceName).toBe('ESP32-07');
    expect(connection.isOpen).toBe(true);
    expect(bluetooth.calls[0]?.options.filters).toEqual([{ namePrefix: 'ESP32' }]);
    expect(bluetooth.first.notifying).toBe(true);
  });

  it('선택 창을 닫으면 한국어 안내가 남고 연결되지 않는다', async () => {
    const { connection } = setup({ chooser: 'cancel' });
    await connection.connect();
    const snapshot = connection.snapshot;
    expect(snapshot.state).toBe('error');
    expect(snapshot.problem?.code).toBe('no-device');
    expect(snapshot.problem?.text).toContain('고르지 않았');
    expect(snapshot.problem?.advice).toContain('전원');
  });

  it('이름이 맞는 기기가 없으면 같은 안내가 난다(선택 창을 닫은 것과 브라우저가 같은 오류를 준다)', async () => {
    const { connection } = setup({ devices: [{ name: '무선이어폰' }] });
    connection.setNamePrefix('ESP32');
    await connection.connect();
    expect(connection.snapshot.problem?.code).toBe('no-device');
  });

  it('블루투스 UART 서비스가 없는 기기를 고르면 "코드를 실행했는지" 안내가 난다', async () => {
    const { connection } = setup({ devices: [{ name: 'ESP32-07', services: [] }] });
    await connection.connect();
    const snapshot = connection.snapshot;
    expect(snapshot.problem?.code).toBe('no-service');
    expect(snapshot.problem?.advice).toContain('ESP32BLE');
    expect(snapshot.state).toBe('error');
  });

  it('연결 자체가 안 되면 "한 번에 한 곳과만 이어져요" 안내가 난다', async () => {
    const { connection } = setup({ devices: [{ name: 'ESP32-07', connectFails: true }] });
    await connection.connect();
    expect(connection.snapshot.problem?.code).toBe('connect-failed');
    expect(connection.snapshot.problem?.advice).toContain('한 번에 한 곳');
  });

  it('알림을 켜지 못해도 연결은 열려 있고 안내만 남는다', async () => {
    const { connection } = setup({ devices: [{ name: 'ESP32-07', notifyFails: true }] });
    await connection.connect();
    expect(connection.snapshot.state).toBe('open');
    expect(connection.snapshot.notifying).toBe(false);
    expect(connection.snapshot.lines.join('\n')).toContain('알림');
  });

  it('Web Bluetooth가 없는 브라우저에서는 unsupported로 시작하고 연결을 시도하지 않는다', async () => {
    const connection = new BleConnection({ bluetooth: null });
    expect(connection.supported).toBe(false);
    expect(connection.snapshot.state).toBe('unsupported');
    await connection.connect();
    expect(connection.snapshot.problem?.code).toBe('unsupported');
  });
});

describe('보내기와 받기', () => {
  it('보낸 바이트가 그대로 보드에 닿고 기록·센 값이 늘어난다', async () => {
    const { bluetooth, connection } = setup({ devices: [{ name: 'ESP32-07' }] });
    await connection.connect();
    await connection.write(encoder.encode('a\n'));
    expect(bluetooth.first.written).toEqual([[97, 10]]);
    expect(connection.snapshot.sent).toBe(2);
    expect(connection.snapshot.lines.at(-1)).toContain('보냄');
  });

  it('20바이트가 넘어도 막지 않고 그대로 보낸다 — 자르는 쪽은 실물 보드다(§7.7)', async () => {
    const { bluetooth, connection } = setup({ devices: [{ name: 'ESP32-07' }] });
    await connection.connect();
    await connection.write(encoder.encode('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
    expect(bluetooth.first.written[0]).toHaveLength(26);
    // 보드는 앞 20바이트만 받아 둔다(MicroPython 특성 버퍼)
    expect(new TextDecoder().decode(Uint8Array.from(bluetooth.first.received[0] ?? []))).toBe('ABCDEFGHIJKLMNOPQRST');
  });

  it('보드가 보낸 알림이 onData와 기록에 온다', async () => {
    const { bluetooth, connection } = setup({ devices: [{ name: 'ESP32-07' }] });
    const got: string[] = [];
    connection.onData((bytes) => {
      got.push(new TextDecoder().decode(bytes));
    });
    await connection.connect();
    bluetooth.first.notifyText('COUNT,3\n');
    expect(got).toEqual(['COUNT,3\n']);
    expect(connection.snapshot.received).toBe(8);
    expect(connection.snapshot.lines.at(-1)).toContain('COUNT,3');
  });

  it('echo 보드에 보내면 받은 값이 그대로 돌아온다(보내기 → 알림 한 바퀴)', async () => {
    const { connection } = setup({ devices: [{ name: 'ESP32-07', echo: true }] });
    await connection.connect();
    await connection.write(encoder.encode('b'));
    expect(connection.snapshot.received).toBeGreaterThan(0);
    // 기록은 보낸 줄이 먼저, 보드가 답한 줄이 나중이다(차례에서 나가는 순간에 적는다)
    expect(connection.snapshot.lines).toEqual([expect.stringContaining('→ 보냄'), expect.stringContaining('← 보드가 보냄')]);
  });

  it('이어져 있지 않으면 보내기가 한국어 오류로 멈춘다', async () => {
    const { connection } = setup();
    await expect(connection.write(encoder.encode('a'))).rejects.toThrow('블루투스 보드와 이어져 있지 않아요');
  });
});

describe('끊김과 다시 연결', () => {
  it('보드가 꺼지면 상태가 error가 되고 다시 연결 안내가 난다', async () => {
    const { bluetooth, connection } = setup({ devices: [{ name: 'ESP32-07' }] });
    await connection.connect();
    bluetooth.first.drop();
    const snapshot = connection.snapshot;
    expect(snapshot.state).toBe('error');
    expect(snapshot.problem?.code).toBe('disconnected');
    expect(snapshot.hasDevice).toBe(true);
    expect(connection.isOpen).toBe(false);
  });

  it('[다시 연결]은 선택 창을 열지 않고 같은 기기에 잇는다', async () => {
    const { bluetooth, connection } = setup({ devices: [{ name: 'ESP32-07' }] });
    await connection.connect();
    bluetooth.first.drop();
    await connection.reconnect();
    expect(connection.snapshot.state).toBe('open');
    expect(bluetooth.calls).toHaveLength(1); // 선택 창은 한 번만
    expect(bluetooth.first.connectCount).toBe(2);
  });

  it('한 번도 고른 적이 없으면 [다시 연결]이 선택 창을 연다', async () => {
    const { bluetooth, connection } = setup({ devices: [{ name: 'ESP32-07' }] });
    await connection.reconnect();
    expect(bluetooth.calls).toHaveLength(1);
    expect(connection.snapshot.state).toBe('open');
  });

  it('[연결 끊기]를 누르면 idle로 돌아가고 알림이 꺼진다', async () => {
    const { bluetooth, connection } = setup({ devices: [{ name: 'ESP32-07' }] });
    await connection.connect();
    await connection.disconnect();
    expect(connection.snapshot.state).toBe('idle');
    expect(bluetooth.first.gatt.connected).toBe(false);
    expect(bluetooth.first.notifying).toBe(false);
  });
});

describe('개인정보(PLAN §10)', () => {
  it('기록·상태 어디에도 기기 주소 모양이 나오지 않는다', async () => {
    const { bluetooth, connection } = setup({ devices: [{ name: 'ESP32-07', echo: true }] });
    await connection.connect();
    await connection.write(encoder.encode('a'));
    bluetooth.first.notifyText('ok\n');
    const text = JSON.stringify(connection.snapshot);
    expect(text).not.toMatch(/(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/iu);
  });
});
