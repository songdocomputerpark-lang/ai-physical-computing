// Web Bluetooth API 타입(navigator.bluetooth·BluetoothDevice·GATT …) — P4-04.
// @types/web-bluetooth는 설치하지 않았고(새 패키지는 구역 규칙상 요청), TypeScript 6.0.3의 lib.dom.d.ts에도 이 API가 없어서
// **사이트가 실제로 쓰는 부분만** 여기에 적는다(2026-09-18 확인: node_modules/typescript/lib/lib.dom.d.ts에 Bluetooth 인터페이스 없음).
// 근거 문서: MDN Web Bluetooth API·Bluetooth.requestDevice()·BluetoothRemoteGATTCharacteristic.writeValueWithResponse()
// (https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API , 2026-09-18 확인).
// src/ 안의 .d.ts라 astro check가 함께 읽으므로 import 없이 쓴다(src/lab/serial/web-serial.d.ts와 같은 방식).

/** 서비스 UUID: 128비트 소문자 글자, 16·32비트 숫자, 또는 등록된 이름('battery_service') */
type BluetoothServiceUUID = string | number;
type BluetoothCharacteristicUUID = string | number;

interface BluetoothLEScanFilter {
  readonly name?: string;
  readonly namePrefix?: string;
  readonly services?: readonly BluetoothServiceUUID[];
}

interface RequestDeviceOptions {
  readonly filters?: readonly BluetoothLEScanFilter[];
  readonly exclusionFilters?: readonly BluetoothLEScanFilter[];
  readonly optionalServices?: readonly BluetoothServiceUUID[];
  readonly acceptAllDevices?: boolean;
}

interface BluetoothCharacteristicProperties {
  readonly notify: boolean;
  readonly write: boolean;
  readonly writeWithoutResponse: boolean;
  readonly read: boolean;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly uuid: string;
  readonly service?: BluetoothRemoteGATTService;
  readonly properties: BluetoothCharacteristicProperties;
  readonly value?: DataView;
  /**
   * 응답 있는 쓰기(보드가 받았다고 답할 때까지 기다린다).
   * 값 자리는 lib.dom의 `BufferSource`가 아니라 `ArrayBufferView | ArrayBufferLike`로 적는다 —
   * TypeScript 6의 `BufferSource`는 버퍼가 `ArrayBuffer`인 것만 받아서, 워커·Pyodide에서 온
   * `Uint8Array<ArrayBufferLike>`를 그대로 넘기지 못한다(2026-09-18 astro check로 확인).
   */
  writeValueWithResponse(value: ArrayBufferView | ArrayBufferLike): Promise<void>;
  writeValueWithoutResponse(value: ArrayBufferView | ArrayBufferLike): Promise<void>;
  readValue(): Promise<DataView>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTService {
  readonly uuid: string;
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  readonly device: BluetoothDevice;
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  /** 브라우저가 만든 기기 id(사이트마다 다르다 — 기기 주소가 아니다) */
  readonly id: string;
  /** 광고 이름(없을 수 있다) */
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  forget?(): Promise<void>;
}

interface Bluetooth extends EventTarget {
  /** 이 컴퓨터에서 블루투스를 쓸 수 있는지(어댑터가 없거나 꺼져 있으면 false) */
  getAvailability(): Promise<boolean>;
  /** 선택 창을 연다 — **사용자 조작(클릭) 안에서 첫 await 앞에** 불러야 한다 */
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
}

interface Navigator {
  /** 이 브라우저에 Web Bluetooth가 없으면 undefined다(Firefox·Safari·iOS) */
  readonly bluetooth?: Bluetooth;
}
