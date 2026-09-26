/**
 * 실제 블루투스(Web Bluetooth) 모듈의 manifest(PLAN §8.4 P4-04 — 순수 데이터, src/lab/README.md 4.2).
 * 워커 번들에도 들어가므로 DOM·다른 모듈을 import하지 않는다.
 *
 * 파이썬 쪽 파일이 없다: 이 모듈은 **브라우저와 실제 기기 사이**만 맡는다. 파이썬 코드(`bluetooth.init(...).send(...)`)를
 * 받는 것은 영상처리 실습실의 흉내 모듈(P4-02)이고, 그 모듈이 브릿지 통로로 `ble`(src/lab/ble/channel.ts)를 고르면
 * 여기로 바이트가 온다. 그래서 요청·이벤트·채널 이름도 없다(다른 구역의 이름과 부딪히지 않는다).
 * USB 데이터 포트 모듈(P4-05)과 같은 모양이다.
 *
 * 붙는 실습실
 * - `esp32`: 보드에 올린 블루투스 코드(ESP32BLE)를 실제 기기로 시험할 때. 가상 보드의 블루투스 칸과 같은 값을 보낸다.
 * - `vision`: 교과서 3-1-3·4단원이 **컴퓨터 → 블루투스 → 보드**로 보내는 쪽이다(f089·f100·f104 …).
 * - `dev`: 개발용 시험 페이지(/labs/dev/runtime/)에서 화면 흐름을 시험한다.
 * 패널은 코드가 블루투스를 쓸 때만 열린다(index.ts의 showPanelWhenUsed — README 4.3).
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'web-bluetooth',
  title: '블루투스로 실제 보드 연결(Web Bluetooth)',
  labs: ['esp32', 'vision', 'dev'],
  shims: {},
  packages: [],
  requestKinds: [],
  eventKinds: [],
  channels: [],
  placement: 'panel',
  // 쓸 때만 받는다(Phase 6 P6-02, 미해결 157 — 통신 무리 'comm'). 패널 조건(index.ts BLE_CODE_PATTERN — ESP32BLE·bluetooth·ubluetooth·bluetooth_lib)보다
  // 넓게(ESP32BLE_LIB 등) 받고, 칸을 열어 달라는 창 이벤트(apc:web-bluetooth-show — [보내기] 패널·블루투스 통로가 보냄)가 먼저 와도 받는다.
  // 통로 'ble'을 등록하므로 통로 목록을 그리는 vision-bridge(order 10)보다 먼저 mount한다.
  load: { group: 'comm', code: /\b(?:ESP32BLE\w*|u?bluetooth(?:_lib)?)\b/u, windowEvents: ['apc:web-bluetooth-show'], order: 0 },
};

export default manifest;
