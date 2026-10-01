// 가상 블루투스(BLE) — 상대 기기가 보드가 처리하는 것보다 빨리 쓸 때(판 1.1.1 최종 점검, fix-plan R-CT10).
// tests/unit/board-ble/pyodide-ble-irq-overflow.test.ts가 공유 도우미(pyodide-board-run.mjs --steps=이 파일)로 돌린다(src/lab/README.md 7.9).
// 확인하는 것: 콜백 대기열(8칸 — micropython.schedule과 같은 자리)이 차면 버려지는 것은 IRQ 알림(콜백 부름)뿐이고, 값은 한 칸에 덮어써져
// 나중에 읽으면 가장 새 값이 나온다 — 콘솔·보드 칸에 나오는 한국어 알림이 이 사실과 맞는지.
// 받는 도구: step(이름, 코드, { … }), bridge.

/** 배선: 블루투스 칸 하나(상태 LED는 ESP32BLE.py가 쓰는 GPIO12 — steps/ble.mjs와 같다) */
const WIRING = { parts: [{ part: 'ble', id: 'ble', label: '블루투스(BLE)', pins: { led: 12 }, directions: { led: 'out' }, known: true }] };

/** 한 번에 몰아 쓰는 값 개수 — 대기열 8칸보다 넉넉히 많게(테스트 파일의 기대값과 같게) */
const FLOOD_COUNT = 12;

export default async function bleIrqOverflowSteps({ step, bridge }) {
  const write = (text) => bridge.pushEvent('board.device.input', { id: 'ble', data: { kind: 'write', bytes: [...Buffer.from(text, 'utf8')] } });

  // 보드가 한 번 쉬는 사이(입력 확인 지점 한 번)에 값 12개가 몰려온다 — 콜백은 그다음에 대기열 차례대로 돈다.
  await step(
    'ble_irq_overflow',
    [
      'import bluetooth, time, apc_runtime',
      'calls = []',
      'ble = bluetooth.BLE()',
      'ble.active(True)',
      'def irq(event, data):',
      '    if event == 3:',
      '        calls.append(ble.gatts_read(data[1]).decode())',
      'ble.irq(irq)',
      'NUS = bluetooth.UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")',
      'RX = (bluetooth.UUID("6E400002-B5A3-F393-E0A9-E50E24DCCA9E"), bluetooth.FLAG_WRITE)',
      '((rx,),) = ble.gatts_register_services(((NUS, (RX,)),))',
      "apc_runtime.emit('board.device', {'mark': 'flood'})",
      'time.sleep_ms(60)',
      'time.sleep_ms(60)',
      '[calls, ble.gatts_read(rx).decode()]',
    ].join('\n'),
    {
      wiring: WIRING,
      onMark: () => {
        for (let index = 1; index <= FLOOD_COUNT; index += 1) {
          write(`v${index}`);
        }
      },
    },
  );
}
