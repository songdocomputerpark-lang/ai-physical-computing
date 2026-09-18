/**
 * MQTT 흉내 모듈의 manifest(순수 데이터, src/lab/README.md 4.2 · PLAN §8.4 P4-06).
 *
 * 파이썬 쪽은 가상 보드 확장 폴더에 있다(`src/lab/modules/board/ext/network/apc_board_network.py`·`apc_board_umqtt.py`) —
 * 보드의 import 훅으로 `import network`·`from umqtt.simple import MQTTClient`가 되어야 하기 때문이다(ext/network/README.md).
 * 이 폴더는 **화면 쪽**(요청 처리·패널·브릿지 통로 등록)만 맡는다.
 *
 * 이름(모두 "mqtt."로 시작)
 * - 요청(파이썬 → 화면, 답을 기다림): mqtt.connect · mqtt.publish · mqtt.subscribe · mqtt.disconnect
 * - 이벤트(파이썬 → 화면, 기다리지 않음): mqtt.wifi(가상 와이파이가 붙었다 — 패널의 와이파이 표시)
 * - 채널(화면 → 파이썬, 쌓이는 값): mqtt.inbox(받은 메시지 {topic, bytes})
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'mqtt',
  title: 'MQTT 통신(network·umqtt.simple 흉내)',
  labs: ['esp32'],
  shims: {},
  packages: [],
  requestKinds: ['mqtt.connect', 'mqtt.publish', 'mqtt.subscribe', 'mqtt.disconnect'],
  eventKinds: ['mqtt.wifi'],
  channels: ['mqtt.inbox'],
  placement: 'wide',
};

export default manifest;
