// 가상 블루투스(BLE) 파이썬 쪽 단계 — tests/unit/board-ble/pyodide-ble.test.ts가 실제 Pyodide로 돌린다(src/lab/README.md 7.7·7.9).
// 확인하는 것: 저수준 bluetooth/ubluetooth 흉내(공식 MicroPython v1.29 문서 기준), IRQ 1·3·2 차례와 값 모양,
// 특성 20바이트 경계와 한 칸 덮어쓰기, 보드 라이브러리 ESP32BLE.py **원본**이 그대로 도는 것(상태 LED 깜빡임까지),
// 사이트판 esp32_ble_util.py로 스마트폰 앱 프레임(f002)을 받는 것.
import fs from 'node:fs';
import path from 'node:path';

/** 배선: 블루투스 칸 하나(상태 LED는 ESP32BLE.py가 쓰는 GPIO12) */
const WIRING = { parts: [{ part: 'ble', id: 'ble', label: '블루투스(BLE)', pins: { led: 12 }, directions: { led: 'out' }, known: true }] };

export default async function bleSteps({ step, bridge, pyodide, rootDir }) {
  // 화면(보드 모듈 index.ts)이 실행 사이에 넣어 주는 보드 라이브러리를 같은 자리(/board/lib)에 넣는다.
  pyodide.FS.mkdirTree('/board/lib');
  for (const name of ['ESP32BLE.py', 'esp32_ble_util.py']) {
    pyodide.FS.writeFile(`/board/lib/${name}`, fs.readFileSync(path.join(rootDir, 'examples', 'esp32', 'lib', 'third-party', name), 'utf8'));
  }

  const write = (text) => bridge.pushEvent('board.device.input', { id: 'ble', data: { kind: 'write', bytes: [...Buffer.from(text, 'utf8')] } });
  const writeBytes = (bytes) => bridge.pushEvent('board.device.input', { id: 'ble', data: { kind: 'write', bytes } });
  const connect = () => bridge.pushEvent('board.device.input', { id: 'ble', data: { kind: 'connect' } });
  const disconnect = () => bridge.pushEvent('board.device.input', { id: 'ble', data: { kind: 'disconnect' } });

  // ① 저수준 API: UUID·플래그·서비스 등록 결과 모양·값 읽고 쓰기·버퍼 늘리기·기기 주소 모양·광고 이름.
  await step(
    'ble_core',
    [
      'import bluetooth, ubluetooth',
      'ble = bluetooth.BLE()',
      'same = ble is ubluetooth.BLE()',
      'before = ble.active()',
      'ble.active(True)',
      'NUS = bluetooth.UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")',
      'TX = (bluetooth.UUID("6E400003-B5A3-F393-E0A9-E50E24DCCA9E"), bluetooth.FLAG_NOTIFY)',
      'RX = (bluetooth.UUID("6E400002-B5A3-F393-E0A9-E50E24DCCA9E"), bluetooth.FLAG_WRITE)',
      'handles = ble.gatts_register_services(((NUS, (TX, RX)),))',
      '((tx, rx),) = handles',
      'ble.gatts_write(tx, "hello")',
      'read_back = ble.gatts_read(tx).decode()',
      'ble.gatts_set_buffer(rx, 40)',
      'addr_type, addr = ble.config("mac")',
      'name = bytes("ESP32-07", "utf-8")',
      "adv = bytearray(b'\\x02\\x01\\x02') + bytearray((len(name) + 1, 0x09)) + name",
      'ble.gap_advertise(100, adv)',
      'flags = [bluetooth.FLAG_READ, bluetooth.FLAG_WRITE_NO_RESPONSE, bluetooth.FLAG_WRITE, bluetooth.FLAG_NOTIFY, bluetooth.FLAG_INDICATE]',
      'uuid16 = bytes(bluetooth.UUID(0x2908))',
      'errors = []',
      'for bad in [lambda: ble.gatts_read(99), lambda: bluetooth.UUID("짧아요"), lambda: bluetooth.UUID(0x1FFFF), lambda: ble.gatts_notify(0, tx, "x")]:',
      '    try:',
      '        bad()',
      '        errors.append("ok")',
      '    except Exception as e:',
      '        errors.append(type(e).__name__ + ": " + str(e))',
      '[same, before, ble.active(), list(handles), [tx, rx], read_back, addr_type, len(addr), flags, list(uuid16), str(NUS), errors]',
    ].join('\n'),
    { wiring: WIRING },
  );

  // ② IRQ 차례와 값 모양: 연결(1) → 쓰기(3) → 끊김(2). 쓰기 이벤트의 data는 (conn_handle, attr_handle).
  await step(
    'ble_events',
    [
      'import bluetooth, time, apc_runtime',
      'log = []',
      'ble = bluetooth.BLE()',
      'ble.active(True)',
      'def irq(event, data):',
      '    if event == 3:',
      '        log.append((event, tuple(data), ble.gatts_read(data[1]).decode()))',
      '    else:',
      '        log.append((event, data[0], len(data[2])))',
      'ble.irq(irq)',
      'NUS = bluetooth.UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")',
      'TX = (bluetooth.UUID("6E400003-B5A3-F393-E0A9-E50E24DCCA9E"), bluetooth.FLAG_NOTIFY)',
      'RX = (bluetooth.UUID("6E400002-B5A3-F393-E0A9-E50E24DCCA9E"), bluetooth.FLAG_WRITE)',
      '((tx, rx),) = ble.gatts_register_services(((NUS, (TX, RX)),))',
      "ble.gap_advertise(100, b'\\x02\\x01\\x02')",
      "apc_runtime.emit('board.device', {'mark': 'connect'})",
      'time.sleep_ms(40)',
      "apc_runtime.emit('board.device', {'mark': 'write'})",
      'time.sleep_ms(40)',
      'sent = []',
      'try:',
      "    ble.gatts_notify(0, tx, 'ok\\n')",
      "    sent.append('sent')",
      'except Exception as e:',
      '    sent.append(type(e).__name__)',
      "apc_runtime.emit('board.device', {'mark': 'disconnect'})",
      'time.sleep_ms(40)',
      'after = []',
      'try:',
      "    ble.gatts_notify(0, tx, 'ok')",
      "    after.append('sent')",
      'except OSError as e:',
      '    after.append(e.args[0])',
      '[[list(item) if isinstance(item, tuple) else item for item in log], rx, sent, after]',
    ].join('\n'),
    {
      wiring: WIRING,
      onMark: (mark) => {
        if (mark === 'connect') connect();
        else if (mark === 'write') write('a');
        else if (mark === 'disconnect') disconnect();
      },
    },
  );

  // ③ 특성 한 칸은 기본 20바이트 — 넘치면 실물처럼 앞 20바이트만 남고 콘솔에 한국어로 알린다. 늘리면 그대로 들어간다.
  await step(
    'ble_truncate',
    [
      'import bluetooth, time, apc_runtime',
      'got = []',
      'ble = bluetooth.BLE()',
      'ble.active(True)',
      'def irq(event, data):',
      '    if event == 3:',
      '        got.append(ble.gatts_read(data[1]))',
      'ble.irq(irq)',
      'NUS = bluetooth.UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")',
      'RX = (bluetooth.UUID("6E400002-B5A3-F393-E0A9-E50E24DCCA9E"), bluetooth.FLAG_WRITE)',
      '((rx,),) = ble.gatts_register_services(((NUS, (RX,)),))',
      "apc_runtime.emit('board.device', {'mark': 'long'})",
      'time.sleep_ms(40)',
      'ble.gatts_set_buffer(rx, 40)',
      "apc_runtime.emit('board.device', {'mark': 'long'})",
      'time.sleep_ms(40)',
      '[[len(item) for item in got], got[0].decode(), got[1].decode()]',
    ].join('\n'),
    { wiring: WIRING, onMark: () => write('DATA,1920,1080,1,0,extra') },
  );

  // ④ 보드 라이브러리 ESP32BLE.py **원본**이 고치지 않고 돈다: 주소 출력, 상태 LED(GPIO12) 깜빡임 → 연결되면 계속 켜짐 → 끊기면 다시 깜빡임,
  //    read()는 한 칸이라 두 번째 읽기는 None, 바쁜 동안 두 번 오면 마지막 값만 남는다(PLAN §7.7 "한 칸 덮어쓰기").
  await step(
    'esp32ble_original',
    [
      'import ESP32BLE, time, apc_runtime',
      'from machine import Pin',
      'ble = ESP32BLE.init("ESP32-07")',
      'blink = []',
      'for _ in range(10):',
      '    time.sleep_ms(50)',
      '    blink.append(Pin(12).value())',
      "apc_runtime.emit('board.device', {'mark': 'connect'})",
      'time.sleep_ms(60)',
      'on_connect = [Pin(12).value()]',
      'time.sleep_ms(150)',
      'on_connect.append(Pin(12).value())',
      "apc_runtime.emit('board.device', {'mark': 'write'})",
      'time.sleep_ms(60)',
      'first = ble.read()',
      'second = ble.read()',
      "apc_runtime.emit('board.device', {'mark': 'busy'})",
      'time.sleep_ms(60)',
      'overwritten = ble.read()',
      "apc_runtime.emit('board.device', {'mark': 'disconnect'})",
      'time.sleep_ms(60)',
      'after = []',
      'for _ in range(8):',
      '    time.sleep_ms(50)',
      '    after.append(Pin(12).value())',
      '[sorted(set(blink)), on_connect, first, second, overwritten, sorted(set(after))]',
    ].join('\n'),
    {
      wiring: WIRING,
      onMark: (mark) => {
        if (mark === 'connect') connect();
        else if (mark === 'write') write('355,152');
        else if (mark === 'busy') {
          write('DATA,1,2');
          write('DATA,3,4');
        } else if (mark === 'disconnect') disconnect();
      },
    },
  );

  // ⑤ 사이트판 esp32_ble_util.py(공식 예제판): 이름을 글자로 넘겨도 광고 데이터가 만들어지고(bytes + str 고침),
  //    스마트폰 앱 프레임(FF 02 01 01 …)이 on_write 콜백으로 온다(f002).
  await step(
    'esp32_ble_util_site',
    [
      'from esp32_ble_util import BLESimplePeripheral, advertising_payload, decode_name',
      'from bluetooth import BLE',
      'import time, apc_runtime',
      'ble = BLESimplePeripheral(ble=BLE(), name="esp32ble")',
      'got = []',
      'ble.on_write(got.append)',
      'before = ble.is_connected()',
      "apc_runtime.emit('board.device', {'mark': 'frame'})",
      'time.sleep_ms(60)',
      'payload = advertising_payload(name="esp32ble")',
      'msg = got[0] if got else b""',
      "buf = msg[5:-1].decode('UTF-8') if msg else ''",
      '[before, ble.is_connected(), [list(item) for item in got], buf, decode_name(payload)]',
    ].join('\n'),
    {
      wiring: WIRING,
      onMark: () => {
        connect();
        writeBytes([0xff, 0x02, 0x01, 0x01, 0x01, 0x32, 0x00]);
      },
    },
  );

  // ⑥ 코드가 끝나도 블루투스가 켜져 있으면 [정지]까지 이어 돈다(f098처럼 한 줄로 끝나는 예제).
  //    끊김 IRQ가 원본의 advertiser()를 다시 불러 주소를 한 번 더 찍는 것으로 "코드가 끝난 뒤에도 콜백이 돈다"를 본다.
  await step('ble_idle_after_code', ['import ESP32BLE', 'ble = ESP32BLE.init("ESP32-07")'].join('\n'), {
    wiring: WIRING,
    idle: true,
    during: [
      [150, connect],
      [350, disconnect],
    ],
    stopAfterMs: 700,
  });

  // ⑦ 배선에 블루투스 칸이 없으면 콘솔로 알린다(그래도 코드는 돈다 — 실물도 무선은 보드 안에 있다).
  await step(
    'ble_without_part',
    ['import bluetooth', 'ble = bluetooth.BLE()', 'ble.active(True)', 'ble.active()'].join('\n'),
    { wiring: { parts: [] } },
  );
}
