/**
 * 개발 서버 전용 시험 입구 — 펌웨어 굽기 화면을 아무 페이지에 끼워 브라우저 테스트한다(병렬 제작 P3-09, 테스트 도구).
 *
 * 왜 있나: P3-09 때는 굽기 화면을 넣을 보드 준비 페이지(src/pages/start/board/)가 아직 다른 구역 파일이라 컴포넌트가 어느 페이지에도 없었다.
 * P3-10부터 보드 준비 페이지에 컴포넌트가 들어가 보통은 쓰이지 않고, 컴포넌트가 없는 페이지에서 굽기 화면만 시험할 때 쓴다.
 * tests/e2e/esp32-firmware.spec.ts는 페이지에 [data-firmware-flasher]가 없으면 개발 서버(Vite)에서 이 파일을 import해
 * 컴포넌트와 같은 HTML(markup.ts)·같은 CSS·같은 화면 논리(controller.ts)를 그 자리에 그린다.
 *   const harness = await import('/ai-physical-computing/src/components/lab/firmware/dev-harness.ts');
 *   await harness.mountFirmwareFlasherHarness(document.querySelector('#firmware'), { manifest });
 * 빌드 결과(dist/)에는 이 파일이 없다(어느 페이지도 import하지 않음). 페이지에 컴포넌트가 들어가면 테스트는 이 입구를 쓰지 않는다.
 */
import { mountFirmwareFlasher } from '../../../lab/firmware/controller.ts';
import { defaultFirmware, FIRMWARE_MANIFEST_PATH, parseFirmwareManifest } from '../../../lab/firmware/manifest.ts';
import { renderFirmwareFlasherHtml } from '../../../lab/firmware/markup.ts';
import { withBase } from '../../../lib/url.ts';
import './firmware-flasher.css';

export interface FirmwareFlasherHarnessOptions {
  /** 목록(JSON 객체). 없으면 개발 서버의 public/firmware/manifest.json을 받는다 */
  readonly manifest?: unknown;
  /** 빌드 때 파일이 있었다고 칠지(내려받기 링크) */
  readonly fileAtBuild?: boolean | null;
  readonly headingLevel?: 2 | 3 | 4;
  /** true면 target 안을 비우고 그린다(기본: target 바로 뒤에 붙인다) */
  readonly replace?: boolean;
}

/** target 뒤(또는 안)에 굽기 화면을 그리고 움직인다. 그린 뿌리 요소를 돌려준다 */
export async function mountFirmwareFlasherHarness(target: Element, options: FirmwareFlasherHarnessOptions = {}): Promise<HTMLElement> {
  const raw = options.manifest ?? (await (await fetch(withBase(FIRMWARE_MANIFEST_PATH), { cache: 'no-store' })).json());
  const firmware = defaultFirmware(parseFirmwareManifest(raw));
  const host = document.createElement('div');
  host.className = 'fw-host';
  host.dataset.firmwareHarness = 'true';
  host.setAttribute('data-pagefind-ignore', '');
  host.innerHTML = renderFirmwareFlasherHtml({
    firmware,
    fileUrl: withBase(firmware.path),
    noticeUrl: firmware.noticePath === null ? null : withBase(firmware.noticePath),
    fileAtBuild: options.fileAtBuild ?? null,
    labHref: withBase('labs/esp32/'),
    portHelpHref: withBase('start/board/#port-not-found'),
    headingLevel: options.headingLevel ?? 3,
  });
  if (options.replace) {
    target.replaceChildren(host);
  } else {
    target.after(host);
  }
  const root = host.querySelector<HTMLElement>('[data-firmware-flasher]');
  if (!root) {
    throw new Error('굽기 화면을 그리지 못했어요.');
  }
  mountFirmwareFlasher(root);
  return root;
}
