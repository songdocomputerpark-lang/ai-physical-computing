/**
 * 브라우저에 끼우는 모의 시리얼(병렬 제작 준비 2026-09-17) — tests/e2e/helpers/serial.ts의 installSerialMock(page, 설정, { plugins })가
 * 이 파일과 플러그인 파일을 esbuild로 한 덩어리(IIFE)로 묶어 page.addInitScript로 페이지 스크립트보다 먼저 실행한다.
 * 설정은 globalThis.__APC_SERIAL_MOCK_CONFIG__(JSON)로 받는다. 실행하면 navigator.serial이 FakeSerial이 되고,
 * 테스트는 window.__apcSerialMock(SerialMockController)으로 보드를 들여다보고 조작한다.
 * 플러그인: 기본 내보내기가 (context) => void인 파일 — 예) 펌웨어 굽기 구역이 ROM 부트로더 흉내를 setBootloaderHandler로 붙인다.
 * 사이트 빌드에는 들어가지 않는다(어느 페이지도 import하지 않음).
 */
import { createSerialMock, createSerialMockController, type SerialMockConfig, type SerialMockController, type SerialMockKit } from './config.ts';
import { installFakeSerial } from './fake-serial.ts';

export interface SerialMockPluginContext {
  readonly kit: SerialMockKit;
  readonly controller: SerialMockController;
  readonly config: SerialMockConfig | undefined;
}

export type SerialMockPlugin = (context: SerialMockPluginContext) => void;

interface MockScope {
  __APC_SERIAL_MOCK_CONFIG__?: SerialMockConfig;
  __apcSerialMock?: SerialMockController;
  navigator?: object;
}

/** 한 페이지(문서)에 한 번만 끼운다. 이미 있으면 그것을 돌려준다 */
export function bootSerialMock(plugins: readonly SerialMockPlugin[] = []): SerialMockController {
  const scope = globalThis as unknown as MockScope;
  if (scope.__apcSerialMock) {
    return scope.__apcSerialMock;
  }
  const config = scope.__APC_SERIAL_MOCK_CONFIG__;
  const kit = createSerialMock(config ?? undefined);
  const controller = createSerialMockController(kit);
  for (const plugin of plugins) {
    plugin({ kit, controller, config });
  }
  installFakeSerial(kit.serial, scope.navigator ?? globalThis);
  scope.__apcSerialMock = controller;
  return controller;
}
