/**
 * 컴퓨터 쪽 블루투스(자료의 `bluetooth`·`bluetooth_lib` 대체) 모듈의 manifest — 순수 데이터(src/lab/README.md 4.2).
 * PLAN §8.4 P4-02의 "PC용 bluetooth·bluetooth_lib 대체 모듈" 자리이고, P4-09(4단원 통합 화면)가 이것 없이는 돌지 않아 함께 만들었다.
 * 워커 번들에도 들어가므로 DOM·다른 모듈을 import하지 않는다.
 *
 * shims가 비어 있는 이유: 자료의 `bluetooth.py`·`bluetooth_lib.py`는 **PyPI 패키지가 아니라 교안이 함께 나눠 준 파일**이고
 * 그 안에서 쓰는 bleak는 Pyodide에 없다. 그래서 "받아 둔 진짜 패키지를 덮어쓰는" shims 대신 같은 폴더의 `bluetooth.py`를
 * 워커가 /apc(sys.path 맨 앞)에 넣어 학생 코드의 `import bluetooth`가 바로 이 파일을 불러오게 한다
 * (serial-pc의 serial.py·speech의 speech_recognition.py와 같은 방식 — src/lab/python/modules.ts 머리말).
 *
 * 이름
 * - 요청(파이썬 → 화면, 답을 기다림): ble-pc.open   블루투스 잇기(자료의 init(주소)). 상대가 없으면 한국어 까닭을 답한다.
 *                                    ble-pc.close  끊기(자료의 disconnect())
 * - 이벤트(파이썬 → 화면, 답 없음):   ble-pc.tx     보낼 글·바이트 {text} 또는 {bytes}
 * - 채널(화면 → 파이썬):              ble-pc.info   이어졌는지·상대 이름(최신 값, peek로 읽어 양보하지 않는다)
 *                                    ble-pc.rx     보드가 알림으로 보낸 바이트(쌓이는 값)
 *
 * 통로: 같은 화면(문서)에 있는 가상 보드에는 창 이벤트 `apc:ble-write`로 넣고 `apc:ble-notify`로 받는다(P4-03 구역 B가 연 자리).
 * 보내는 차례(초당 10회·상태 병합·클릭 이벤트 보존)는 P4-01의 Bridge가 맡는다 — 이 모듈은 통로 하나를 끼울 뿐이다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'ble-pc',
  title: '컴퓨터 쪽 블루투스(bluetooth 흉내)',
  labs: ['vision'],
  shims: {},
  packages: [],
  requestKinds: ['ble-pc.open', 'ble-pc.close'],
  eventKinds: ['ble-pc.tx'],
  channels: ['ble-pc.info', 'ble-pc.rx'],
  // 쓸 때만 받는다(Phase 6 P6-02, 미해결 157 — 통신 무리 'comm'은 함께 받는다, types.ts LabModuleLoadRule).
  // 학생 코드의 import bluetooth·bluetooth_lib(이 폴더의 bluetooth.py·bluetooth_lib.py)가 보이면.
  load: { group: 'comm', code: /\bbluetooth(?:_lib)?\b/u },
};

export default manifest;
