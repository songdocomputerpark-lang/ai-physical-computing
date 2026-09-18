/**
 * Nordic UART Service(NUS)의 UUID와 선택 창 설정 — PLAN §7.3 "블루투스(Web Bluetooth)", §8.4 P4-04.
 *
 * 공식 문서로 확인한 것(2026-09-18, Nordic Semiconductor nRF Connect SDK "Nordic UART Service (NUS)"
 * https://docs.nordicsemi.com/bundle/ncs-latest/page/nrf/libraries/bluetooth/services/nus.html):
 *   서비스 UUID 6E400001-B5A3-F393-E0A9-E50E24DCCA9E, RX 특성은 **쓰는 쪽**(데이터를 보내면 UART로 나간다),
 *   TX 특성은 **알림을 켜는 쪽**(기기가 보낸 데이터가 알림으로 온다). 특성 UUID는 서비스 UUID의 0x0002·0x0003 자리다.
 * 자료 쪽 근거: 보드 라이브러리 `examples/esp32/lib/third-party/ESP32BLE.py`가 같은 세 UUID를 쓰고
 *   RX에 `FLAG_WRITE`(응답 있는 쓰기), TX에 `FLAG_NOTIFY`를 준다 — 그래서 브라우저는 **응답 있는 쓰기**로 보내고 알림을 받는다.
 *
 * 글자는 **소문자**로 적는다. Web Bluetooth의 UUID 규격 모양이 소문자 16진수이고(MDN BluetoothUUID),
 * 대문자를 받아 주는지는 브라우저마다 확인하지 않았다 — 소문자로 적으면 어느 쪽이든 된다.
 * MicroPython 쪽(`ESP32BLE.py`)은 대문자로 적지만 `ubluetooth.UUID`가 대소문자를 가리지 않아 같은 서비스다.
 *
 * **선택 창에서 서비스로 거를 수 없다:** `ESP32BLE.py`의 광고 데이터(`adv_data`)에는 플래그와 이름(0x09)만 들어 있고
 * 서비스 UUID가 없다. `filters: [{ services: [NUS] }]`로 거르면 보드가 목록에 뜨지 않는다.
 * 그래서 **이름 앞부분(namePrefix)으로 거르고 NUS는 `optionalServices`에 적는다**(MDN: 이름으로 거를 때는
 * optionalServices를 적어야 나중에 그 서비스를 쓸 수 있다).
 */

/** Nordic UART Service */
export const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
/** 브라우저 → 보드(쓰기). 보드의 `ESP32BLE.py`는 여기에 온 값을 `gatts_read`로 읽는다. */
export const NUS_RX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
/** 보드 → 브라우저(알림). 보드의 `ESP32BLE.send()`가 여기로 보낸다. */
export const NUS_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** 교실에서 쓰는 광고 이름의 기본 앞부분(`ESP32BLE.init("ESP32-07")`의 앞부분) */
export const DEFAULT_NAME_PREFIX = 'ESP32';

/** 한 번에 보낼 수 있는 값의 크기(바이트) — MicroPython 특성 기본 버퍼(PLAN §7.2 규칙 3·§7.7) */
export const BLE_VALUE_BYTES = 20;

export interface ChooserOptions {
  /** 이름 앞부분으로 거르기(비우면 acceptAll과 같은 뜻) */
  readonly namePrefix?: string;
  /** 이름을 모를 때 가까운 기기를 모두 보기 */
  readonly acceptAll?: boolean;
}

/**
 * 선택 창에 넘길 값을 만든다(순수 함수 — 단위 테스트가 이 모양을 지킨다).
 * - 이름 앞부분이 있으면 `filters: [{ namePrefix }]`, 없거나 acceptAll이면 `acceptAllDevices: true`.
 * - 어느 쪽이든 `optionalServices`에 NUS를 적는다(안 적으면 연결 뒤 `getPrimaryService`가 SecurityError).
 * - `acceptAllDevices`와 `filters`를 함께 주면 TypeError라서(MDN) 둘 중 하나만 넣는다.
 */
export function chooserOptions(options: ChooserOptions = {}): RequestDeviceOptions {
  const prefix = (options.namePrefix ?? '').trim();
  const optionalServices = [NUS_SERVICE_UUID];
  if (options.acceptAll === true || prefix === '') {
    return { acceptAllDevices: true, optionalServices };
  }
  return { filters: [{ namePrefix: prefix }], optionalServices };
}
