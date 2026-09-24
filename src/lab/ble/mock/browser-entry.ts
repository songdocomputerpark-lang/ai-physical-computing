/**
 * 가짜 블루투스를 **브라우저 문서에 끼우는 입구**(P4-04). Playwright가 이 파일을 esbuild로 묶어
 * `page.addInitScript`로 넣는다(모의 시리얼 `src/lab/serial/mock/browser-entry.ts`와 같은 방식, README 8.3).
 * 사이트 스크립트보다 먼저 돌고, 문서가 새로 열릴 때마다 새 기기가 생긴다.
 *
 * 설정은 `globalThis.__APC_BLE_MOCK_CONFIG__`로 넣는다.
 *   { devices: [{ name: 'ESP32-07', echo: true }], chooser: 'first' }   // 기본
 *   { unsupported: true }                                               // navigator.bluetooth가 없는 브라우저 흉내(iOS·Firefox)
 * 테스트가 쓰는 조작은 `globalThis.__APC_BLE_MOCK__`에 있다(보드 노릇: notify·drop, 확인: writtenText·calls).
 */
import { createMockBluetooth, type MockBluetooth, type MockBluetoothConfig } from './mock-bluetooth.ts';

export interface BleMockGlobalConfig extends MockBluetoothConfig {
  /** 참이면 navigator.bluetooth를 아예 없앤다(지원하지 않는 브라우저) */
  readonly unsupported?: boolean;
}

export interface BleMockHandle {
  /** 사이트가 보낸 바이트 그대로 */
  written(index?: number): number[][];
  /** 사이트가 보낸 것을 글자로 이어 붙인 것 */
  writtenText(index?: number): string;
  /** 보드가 실물처럼 잘라서 받아 둔 값(글자) */
  receivedText(index?: number): string;
  /** 보드가 값을 보낸 것처럼 알림 내기 */
  notify(text: string, index?: number): void;
  /** 보드가 꺼진 것처럼 연결 끊기 */
  drop(index?: number): void;
  /** 선택 창을 부른 기록(설정과 사용자 조작 여부) */
  calls(): { options: RequestDeviceOptions; gesture: boolean | null }[];
  /** 겹쳐서 보낸 쓰기의 최대 개수(1이면 한 번에 하나씩 나간 것) */
  maxConcurrentWrites(index?: number): number;
  /** 선택 창 동작 바꾸기 */
  setChooser(mode: 'first' | 'cancel'): void;
  /** 연결된 횟수(다시 연결을 확인할 때) */
  connectCount(index?: number): number;
  /** 알림이 켜져 있나 */
  notifying(index?: number): boolean;
}

/** 전역에 붙는 이름(모의 시리얼과 같은 방식으로 타입만 적어 둔다 — 전역 선언을 저장소에 퍼뜨리지 않으려고) */
interface BleMockScope {
  __APC_BLE_MOCK_CONFIG__?: BleMockGlobalConfig;
  __APC_BLE_MOCK__?: BleMockHandle;
  navigator?: object;
}

const decoder = new TextDecoder();

function handleFor(mock: MockBluetooth): BleMockHandle {
  const deviceAt = (index = 0) => mock.devices[index] ?? mock.first;
  return {
    written(index = 0) {
      return deviceAt(index).written.map((item) => [...item]);
    },
    writtenText(index = 0) {
      return deviceAt(index)
        .written.map((item) => decoder.decode(Uint8Array.from(item)))
        .join('');
    },
    receivedText(index = 0) {
      return deviceAt(index)
        .received.map((item) => decoder.decode(Uint8Array.from(item)))
        .join('');
    },
    notify(text, index = 0) {
      deviceAt(index).notifyText(text);
    },
    drop(index = 0) {
      deviceAt(index).drop();
    },
    calls() {
      return mock.calls.map((call) => ({ options: call.options, gesture: call.gesture }));
    },
    maxConcurrentWrites(index = 0) {
      return deviceAt(index).maxConcurrentWrites;
    },
    setChooser(mode) {
      mock.chooser = mode;
    },
    connectCount(index = 0) {
      return deviceAt(index).connectCount;
    },
    notifying(index = 0) {
      return deviceAt(index).notifying;
    },
  };
}

/** 문서에 가짜 블루투스를 끼운다 */
export function bootBleMock(): BleMockHandle | null {
  const scope = globalThis as unknown as BleMockScope;
  const config: BleMockGlobalConfig = scope.__APC_BLE_MOCK_CONFIG__ ?? {};
  const target = scope.navigator ?? globalThis;
  if (config.unsupported === true) {
    // 이 브라우저에는 블루투스가 없는 것처럼 보이게 한다(Navigator.prototype의 접근자를 가린다).
    Object.defineProperty(target, 'bluetooth', { configurable: true, get: () => undefined });
    return null;
  }
  const mock = createMockBluetooth(config);
  Object.defineProperty(target, 'bluetooth', { configurable: true, get: () => mock });
  const handle = handleFor(mock);
  scope.__APC_BLE_MOCK__ = handle;
  return handle;
}
