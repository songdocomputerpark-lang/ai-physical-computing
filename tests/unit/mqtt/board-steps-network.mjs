// 가상 보드의 와이파이·MQTT 흉내(src/lab/modules/board/ext/network/)를 **실제 Pyodide**로 돌려 보는 단계들 — 구역 D(P4-06).
// tests/unit/mqtt/pyodide-network.test.ts가 공유 도우미(tests/unit/lab/helpers/pyodide-board-run.mjs)로 돌린다.
// 공유 도우미는 고치지 않는다(src/lab/README.md 7.9). 이 도우미의 화면 흉내는 **모든 request를 거절**하므로
// "요청이 실제로 나간다 · 거절이 한국어 오류로 바뀐다"까지 확인하고, 주고받는 흐름은 브라우저 테스트(tests/e2e/mqtt.spec.ts)가 본다.

export default async function networkSteps({ step, bridge }) {
  // ① network.WLAN — 가상 와이파이는 늘 연결에 성공한다(PLAN §6.3).
  await step(
    'network_wlan',
    [
      'import network',
      'wlan = network.WLAN(network.STA_IF)',
      'a = wlan.active(True)',
      'wlan.connect("classroom-wifi", "pw")',
      '[a, wlan.isconnected(), wlan.ifconfig()[0], wlan.status() == network.STAT_GOT_IP, len(wlan.scan()), network.hostname(), wlan.status("rssi") < 0]',
    ].join('\n'),
  );

  // ② active(True)를 빠뜨려도 대신 켜 주고 콘솔로 알린다(실물에서는 꼭 필요하다는 안내).
  await step(
    'network_without_active',
    ['import network', 'wlan = network.WLAN(network.STA_IF)', 'wlan.connect("classroom-wifi", "pw")', '[wlan.active(), wlan.isconnected()]'].join('\n'),
  );

  // ③ umqtt.simple import 두 모양 + 연결 전에 보내면 한국어 오류.
  await step(
    'umqtt_import',
    [
      'from umqtt.simple import MQTTClient',
      'import umqtt',
      'client = MQTTClient("board-01", "broker.emqx.io")',
      'try:',
      '    client.publish(b"led", b"on")',
      '    r = "no-error"',
      'except OSError as error:',
      '    r = str(error)',
      '[r, hasattr(umqtt, "simple"), client.client_id, client.server, hasattr(umqtt.simple, "MQTTException")]',
    ].join('\n'),
  );

  // ④ connect()는 화면에 mqtt.connect 요청을 보낸다. 이 도우미의 화면 흉내는 거절하므로 그 까닭이 OSError로 온다.
  await step(
    'umqtt_connect_request',
    [
      'from umqtt.simple import MQTTClient',
      'client = MQTTClient("board-01", "broker.emqx.io")',
      'try:',
      '    client.connect()',
      '    r = "connected"',
      'except OSError as error:',
      '    r = str(error)',
      'r',
    ].join('\n'),
  );

  // ⑤ 화면이 보낸 메시지를 check_msg·wait_msg가 콜백으로 넘긴다(topic·msg 모두 bytes — umqtt와 같다).
  await step(
    'umqtt_receive',
    [
      'from umqtt.simple import MQTTClient',
      'got = []',
      'client = MQTTClient("board-01", "broker.emqx.io")',
      'client._connected = True  # 화면이 없는 시험이라 연결 단계만 건너뛴다',
      'client.set_callback(lambda topic, msg: got.append((topic, msg)))',
      'first = client.check_msg()',
      'client.wait_msg()',
      '[first is None, got[0][0].decode(), got[0][1].decode(), isinstance(got[0][1], bytes), len(got)]',
    ].join('\n'),
    { during: [[150, () => bridge.pushEvent('mqtt.inbox', { topic: 'led', bytes: [111, 110] })]] },
  );

  // ⑥ 실행이 시작되면 지난 실행에 쌓인 메시지를 버린다(초기화 훅 — 동기 진입점).
  bridge.pushEvent('mqtt.inbox', { topic: 'led', bytes: [111, 110] });
  bridge.pushEvent('mqtt.inbox', { topic: 'led', bytes: [111, 102, 102] });
  await step(
    'umqtt_reset',
    [
      'from umqtt.simple import MQTTClient',
      'got = []',
      'client = MQTTClient("board-01", "broker.emqx.io")',
      'client._connected = True',
      'client.set_callback(lambda topic, msg: got.append((topic, msg)))',
      'client.check_msg()',
      'len(got)',
    ].join('\n'),
  );
}
