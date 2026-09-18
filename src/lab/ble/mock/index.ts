/**
 * 가짜 블루투스 공개 자리(테스트 전용 — 사이트 페이지는 이 폴더를 import하지 않는다).
 * Node 단위 테스트는 `createMockBluetooth`를 `BleConnection`에 넣고, 브라우저 테스트는 `bootBleMock`을 묶어 넣는다.
 */
export { bootBleMock, type BleMockGlobalConfig, type BleMockHandle } from './browser-entry.ts';
export {
  MockBluetooth,
  MockCharacteristic,
  MockDevice,
  MockGattServer,
  MockService,
  createMockBluetooth,
  domError,
  type ChooserCall,
  type MockBluetoothConfig,
  type MockDeviceConfig,
} from './mock-bluetooth.ts';
