/**
 * 모의 시리얼 플러그인 예시(병렬 제작 준비 2026-09-17) — 다운로드 모드(DTR·RTS 리셋 순서로 들어감)에서 받은 바이트를 그대로 돌려보낸다.
 * 플러그인 모양만 보여 주는 것이다: 펌웨어 굽기 구역(P3-09)은 이 폴더에 자기 파일(예: esp-rom-loader.ts)을 새로 만들어
 * ROM 부트로더 응답(SLIP·SYNC 등)을 흉내 내고 installSerialMock(page, 설정, { plugins: ['tests/e2e/helpers/serial-plugins/<파일>.ts'] })로 넣는다.
 * 브라우저 안에서 도는 코드라 Node 모듈(fs 등)을 import하지 않는다.
 */
import type { SerialMockPluginContext } from '../../../../src/lab/serial/mock/browser-entry.ts';

export default function bootloaderEcho({ kit, controller }: SerialMockPluginContext): void {
  for (const id of kit.ports.keys()) {
    if (controller.mode(id) === 'custom' || controller.mode(id) === 'none') {
      continue;
    }
    controller.setBootloaderHandler(id, (bytes, io) => io.emit(bytes));
  }
}
