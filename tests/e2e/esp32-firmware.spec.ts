// 펌웨어 굽기 화면 브라우저 테스트(PLAN §8.3 P3-09 — 완료 기준 "크롬에서 굽기 화면이 뜨고 파일 검증(크기·해시)이 된다", 실제 굽기는 운영자 실물).
//
// 어디서 여나: 굽기 화면은 보드 준비 페이지(/start/board/)의 "3단계: 보드에 MicroPython 굽기" 자리(#firmware)에 있다(P3-10).
//   페이지에 [data-firmware-flasher]가 있으면 그것을 시험하고, 없으면 개발 서버(Vite)에서 시험 입구
//   src/components/lab/firmware/dev-harness.ts를 불러 같은 HTML·CSS·화면 논리를 그 자리에 그린다(빌드 결과에는 입구가 없어 실패로 알린다).
//   보드 준비 페이지 전체 흐름(연결 확인 → 굽기 → 첫 예제)은 tests/e2e/start-board.spec.ts.
// 보드: 모의 시리얼(tests/e2e/helpers/serial.ts) + 모의 ESP32 ROM 부트로더 플러그인(src/lab/firmware/mock/serial-plugin.ts).
//   흉내는 esptool.py --no-stub과 다른 길이·블록 크기를 오류로 대답한다. 흉내에서 된 것은 실물의 증거가 아니다(부록 B-2).
// 펌웨어 파일: 저장소에 없으므로 테스트가 만든 가짜 ESP32 이미지를 page.route로 주고, 목록(크기·SHA-256)도 그 이미지에 맞춘다.
// 실행(병렬 제작): PW_BASE_URL=http://localhost:4506/ai-physical-computing/ npx playwright test tests/e2e/esp32-firmware.spec.ts --project=desktop
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { sha256Of, syntheticImage } from '../unit/firmware/helpers/synthetic-image.ts';
import { installSerialMock, serialMock, type SerialMockConfig } from './helpers/serial.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BOARD_PAGE = withBase('start/board/');
const HARNESS_MODULE = withBase('src/components/lab/firmware/dev-harness.ts');
const ROM_PLUGIN = 'src/lab/firmware/mock/serial-plugin.ts';
const REAL_MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'firmware', 'manifest.json'), 'utf8')) as {
  schema: number;
  firmware: Record<string, unknown>[];
};
const REAL_FIRMWARE = REAL_MANIFEST.firmware[0]!;
const TEST_FILE = 'firmware/v1.29.0/APC-TEST-ESP32_GENERIC-v1.29.0.bin';

// 서비스 워커가 페이지 요청을 가로채면 page.route가 닿지 않으므로 이 파일에서는 막는다(빌드 미리 보기에서 돌 때).
test.use({ serviceWorkers: 'block' });

interface TestFirmware {
  readonly image: Uint8Array;
  readonly info: Record<string, unknown>;
}

/** 테스트 이미지와 그 크기·SHA-256을 적은 펌웨어 항목 */
function testFirmware(size = 32_000): TestFirmware {
  const image = syntheticImage(size);
  return {
    image,
    info: {
      ...REAL_FIRMWARE,
      path: TEST_FILE,
      size: image.length,
      sha256: sha256Of(image),
      sourceUrl: `https://micropython.org/resources/firmware/${path.posix.basename(TEST_FILE)}`,
    },
  };
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** 가짜 펌웨어 파일을 준다(HEAD·GET). body를 바꾸면 크기는 같고 내용이 다른 파일 */
async function serveFirmware(page: Page, image: Uint8Array): Promise<{ requests: string[] }> {
  const requests: string[] = [];
  await page.route(`**/${TEST_FILE}`, async (route) => {
    requests.push(route.request().method());
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(image) });
  });
  return { requests };
}

/**
 * 보드 준비 페이지를 열고 굽기 화면을 찾는다. firmware를 주면 화면의 펌웨어 항목을 그것으로 바꾼다
 * (페이지에 컴포넌트가 있으면 HTML에 심긴 JSON·파일 주소를 바꾸고, 없으면 시험 입구에 목록으로 넘긴다).
 */
async function openFlasher(page: Page, firmware?: Record<string, unknown>): Promise<Locator> {
  if (firmware) {
    await page.route(`**${BOARD_PAGE}`, async (route) => {
      const response = await route.fetch();
      let html = await response.text();
      html = html
        .replace(/(<script type="application\/json" data-firmware-info>)[\s\S]*?(<\/script>)/u, (_whole, open: string, close: string) => `${open}${JSON.stringify(firmware).replace(/</gu, '\\u003c')}${close}`)
        .replace(/data-file-url="[^"]*"/u, `data-file-url="${withBase(String(firmware.path))}"`);
      const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !['content-length', 'content-encoding'].includes(name.toLowerCase())));
      await route.fulfill({ response, body: html, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
    });
  }
  const response = await page.goto(BOARD_PAGE);
  expect(response?.status()).toBe(200);
  const existing = page.locator('[data-firmware-flasher]');
  if ((await existing.count()) === 0) {
    const manifest = firmware ? { schema: 1, firmware: [firmware] } : null;
    // 문자열로 넘긴다: 함수로 넘기면 테스트 변환기가 import()를 바꿔 버릴 수 있다
    await page.evaluate(`(async () => {
      const harness = await import(${JSON.stringify(HARNESS_MODULE)});
      const anchor = document.querySelector('#firmware') || document.querySelector('main h1');
      await harness.mountFirmwareFlasherHarness(anchor, { manifest: ${JSON.stringify(manifest)} });
    })()`);
  }
  const root = page.locator('[data-firmware-flasher]').first();
  await expect(root).toHaveAttribute('data-mounted', 'true', { timeout: 30_000 });
  return root;
}

function stage(root: Locator, key: string): Locator {
  return root.locator(`[data-stage="${key}"]`);
}

async function romSummary(page: Page, id = 'board') {
  return page.evaluate(
    (portId) =>
      (globalThis as unknown as { __apcEsp32Rom: { summary(id: string): { commands: number; baudRate: number; protocolErrors: number; spiAttachLength: number | null; flashParameterSize: number | null; erased: { offset: number; size: number }[] } } }).__apcEsp32Rom.summary(portId),
    id,
  );
}

async function romCount(page: Page, name: string, id = 'board'): Promise<number> {
  return page.evaluate(([portId, command]) => (globalThis as unknown as { __apcEsp32Rom: { count(id: string, name: string): number } }).__apcEsp32Rom.count(portId!, command!), [id, name]);
}

async function installBoard(page: Page, config: SerialMockConfig = {}, romOptions: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((options) => {
    (globalThis as unknown as { __APC_ESP32_ROM_OPTIONS__: unknown }).__APC_ESP32_ROM_OPTIONS__ = { board: options };
  }, romOptions);
  await installSerialMock(page, config, { plugins: [ROM_PLUGIN] });
}

test.describe('펌웨어 굽기 화면', () => {
  // 개발 서버는 esptool-js를 처음 import할 때 의존성을 다시 묶으며 페이지를 한 번 새로 고칠 수 있다(src/lab/README.md 5.1) — 검사 전에 한 번 불러 둔다.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    try {
      await page.goto(BOARD_PAGE);
      await page
        .evaluate(`(async () => {
          await import(${JSON.stringify(HARNESS_MODULE)});
          const flasher = await import(${JSON.stringify(withBase('src/lab/firmware/flasher.ts'))});
          // 포트 없이 만들기만 한다(esptool-js를 불러 Transport·ESPLoader를 만든다 — 포트는 열지 않음)
          const dummy = { getInfo: () => ({}), addEventListener() {}, removeEventListener() {}, readable: null };
          await flasher.FirmwareFlasher.create({ port: dummy });
        })()`)
        .catch(() => undefined);
      await page.waitForTimeout(1500);
    } finally {
      await page.close();
    }
  });

  test('굽기 화면이 뜨고, 펌웨어 파일이 없으면 "펌웨어 파일 준비 중"과 선생님용 수동 방법을 보인다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 본다(휴대폰 화면은 아래 검사)');
    const errors = collectPageErrors(page);
    // 파일을 사이트에 올린 뒤에도 이 경로를 시험하도록 파일 주소를 404로 막는다(통합 전에는 원래 없다)
    await page.route(`**/${String(REAL_FIRMWARE.path)}`, (route) => route.fulfill({ status: 404, contentType: 'text/html', body: 'Not Found' }));
    const root = await openFlasher(page);
    await expect(root.getByRole('heading', { name: '펌웨어 굽기' })).toBeVisible();
    await expect(root).toHaveAttribute('data-support', 'ready');
    await expect(root.locator('.fw__facts')).toContainText('MicroPython v1.29.0(2026-08-24) · ESP32용 · 1.7MB');
    // 파일이 없으면 HEAD 404 → 준비 중
    await expect(root).toHaveAttribute('data-file-state', 'missing', { timeout: 15_000 });
    const missing = root.locator('[data-firmware-missing]');
    await expect(missing).toBeVisible();
    await expect(missing).toContainText('펌웨어 파일 준비 중이에요');
    await expect(root.getByRole('button', { name: '펌웨어 굽기 시작' })).toBeDisabled();
    // 단계 7개가 "기다림"으로 보인다
    await expect(root.locator('[data-stage]')).toHaveCount(7);
    await expect(stage(root, 'write')).toContainText('펌웨어 쓰기');
    await expect(stage(root, 'write')).toContainText('기다림');
    // "수동으로 굽는 방법" 링크를 누르면 선생님용 접힘이 펴진다
    await missing.getByRole('link', { name: '수동으로 굽는 방법' }).click();
    const manual = root.locator('[data-firmware-manual]');
    await expect(manual).toHaveAttribute('open', '');
    await expect(manual).toContainText('install or update MicroPython');
    await expect(manual).toContainText('esptool.py --baud 460800 write_flash 0x1000 ESP32_GENERIC-20260824-v1.29.0.bin');
    await expect(manual).toContainText('e67ad6015a0a504c1fec9aa9bbf589d0432ed28e62546f4f8dd8a147f8bd95f6');
    await expect(manual.getByRole('link', { name: 'MicroPython ESP32_GENERIC 공식 내려받기 페이지' })).toHaveAttribute(
      'href',
      'https://micropython.org/download/ESP32_GENERIC/',
    );
    // 칩만 확인하기는 파일 없이도 된다
    await expect(manual.getByRole('button', { name: '칩만 확인하기' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('firmware-missing.png'), fullPage: false });
    await root.screenshot({ path: testInfo.outputPath('firmware-missing-panel.png') });
    expect(errors).toEqual([]);
  });

  test('파일이 있으면 크기·SHA-256을 확인한 뒤 모의 보드를 지우고 굽고, 단계·진행률·재시작 안내까지 보인다(키보드로 조작)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    const errors = collectPageErrors(page);
    const firmware = testFirmware(32_000);
    await installBoard(page, {}, { writeMsPerBlock: 15 });
    const served = await serveFirmware(page, firmware.image);
    const root = await openFlasher(page, firmware.info);
    await expect(root).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });
    await expect(root.locator('[data-firmware-file-text]')).toContainText('준비됐어요');
    const start = root.getByRole('button', { name: '펌웨어 굽기 시작' });
    await expect(start).toBeEnabled();

    // 키보드: 지우기 선택(Space) → Tab으로 [펌웨어 굽기 시작] → Enter
    const erase = root.getByRole('checkbox', { name: '굽기 전에 보드를 모두 지우기' });
    await erase.focus();
    await page.keyboard.press('Space');
    await expect(erase).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(start).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(root).toHaveAttribute('data-state', 'running');
    await expect(root.getByRole('button', { name: '멈추기' })).toBeVisible();
    await expect(root.locator('[data-firmware-running-note]')).toContainText('USB 케이블을 뽑거나');
    // 쓰는 동안 진행률이 0과 100 사이에서 보인다
    const bar = stage(root, 'write').locator('[data-progress-bar]');
    await expect.poll(() => bar.evaluate((node) => (node as HTMLProgressElement).value), { timeout: 30_000 }).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('firmware-writing.png') });

    await expect(root).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    await expect(stage(root, 'port')).toHaveAttribute('data-stage-state', 'done');
    await expect(stage(root, 'port')).toContainText('WCH CH340 계열(1a86:7523)');
    await expect(stage(root, 'chip')).toContainText('ESP32-D0WD-V3 (revision 3) · 플래시 4MB');
    await expect(stage(root, 'file')).toContainText(`크기 ${firmware.image.length.toLocaleString('en-US')}바이트 · SHA-256 일치`);
    await expect(stage(root, 'erase')).toHaveAttribute('data-stage-state', 'done');
    await expect(stage(root, 'write')).toHaveAttribute('data-stage-state', 'done');
    expect(await bar.evaluate((node) => (node as HTMLProgressElement).value)).toBe(100);
    await expect(stage(root, 'verify')).toContainText('MD5 일치');
    await expect(stage(root, 'restart')).toContainText('MicroPython v1.29.0이 시작했어요');
    const done = root.locator('[data-firmware-done]');
    await expect(done).toBeVisible();
    await expect(done).toBeFocused();
    await expect(done).toContainText('끝났어요! 보드에 MicroPython v1.29.0이 들어갔어요.');
    await expect(done).toContainText('"MicroPython v1.29.0" 시작 글');
    // 보드 준비 페이지에서는 끝나면 교과서 2-1-1 첫 예제(내장 LED)를 연 실습실로, 그리고 이 페이지의 [보드 연결]로 다시 확인할 수 있다(P3-10)
    await expect(done.getByRole('link', { name: 'ESP32 실습실로 가기' })).toHaveAttribute('href', `${withBase('labs/esp32/')}?example=${encodeURIComponent('esp32/u2/2-1-1-blink-check.py')}`);
    await expect(done.getByRole('link', { name: '이 페이지에서 보드 연결 다시 확인하기' })).toHaveAttribute('href', '#connect');
    await expect(root.getByRole('button', { name: '멈추기' })).toBeHidden();

    // 모의 ROM: 스텁을 올리지 않았고(MEM_*), esptool.py --no-stub 모양(SPI_ATTACH 8바이트·지우기 위치 0부터 4MB·460800)으로 받았다
    const summary = await romSummary(page);
    expect(summary.protocolErrors).toBe(0);
    expect(summary.spiAttachLength).toBe(8);
    expect(summary.flashParameterSize).toBe(4 * 1024 * 1024);
    expect(summary.erased[0]).toEqual({ offset: 0, size: 4 * 1024 * 1024 });
    expect(summary.baudRate).toBe(460800);
    expect(await romCount(page, 'MEM_BEGIN')).toBe(0);
    expect(await romCount(page, 'ERASE_FLASH')).toBe(0);
    const flashMd5 = await page.evaluate(
      ([offset, length]) => (globalThis as unknown as { __apcEsp32Rom: { md5(id: string, o: number, l: number): string } }).__apcEsp32Rom.md5('board', offset!, length!),
      [0x1000, firmware.image.length],
    );
    expect(flashMd5).toBe(createHash('md5').update(firmware.image).digest('hex'));
    // 보드는 다시 시작해 보통 REPL, 포트는 닫혔다(ESP32 실습실이 바로 연결할 수 있게)
    const board = serialMock(page);
    await expect.poll(() => board.mode()).toBe('friendly');
    await expect.poll(() => board.isOpen()).toBe(false);
    expect(served.requests).toContain('GET');
    await root.screenshot({ path: testInfo.outputPath('firmware-done-panel.png') });
    expect(errors).toEqual([]);
  });

  test('받은 파일의 SHA-256이 목록과 다르면 굽지 않고 보드를 원래대로 둔다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    const firmware = testFirmware(16_000);
    const tampered = firmware.image.slice();
    tampered[5000] = tampered[5000]! ^ 0xff;
    await installBoard(page);
    await serveFirmware(page, tampered);
    const root = await openFlasher(page, firmware.info);
    await expect(root).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });
    await root.getByRole('button', { name: '펌웨어 굽기 시작' }).click();
    await expect(root).toHaveAttribute('data-state', 'error', { timeout: 60_000 });
    const error = root.locator('[data-firmware-error]');
    await expect(error).toHaveAttribute('data-error-code', 'firmware-corrupt');
    await expect(error).toContainText('받은 펌웨어 파일이 올바르지 않아요');
    await expect(error).toContainText('지문(SHA-256)');
    await expect(error).toBeFocused();
    await expect(stage(root, 'file')).toHaveAttribute('data-stage-state', 'failed');
    await expect(error.locator('[data-error-raw]')).toContainText(firmware.info.sha256 as string);
    expect(await romCount(page, 'FLASH_DEFL_BEGIN')).toBe(0);
    await expect.poll(() => serialMock(page).mode()).toBe('friendly');
  });

  test('보드가 굽기 모드로 바뀌지 않으면 BOOT 버튼을 누른 채 다시 하라고 안내한다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    const firmware = testFirmware(8_000);
    await installBoard(page, { ports: [{ id: 'board', micropython: { autoResetCircuit: false } }] });
    await serveFirmware(page, firmware.image);
    const root = await openFlasher(page, firmware.info);
    await expect(root).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });
    await root.getByRole('button', { name: '펌웨어 굽기 시작' }).click();
    await expect(stage(root, 'chip')).toHaveAttribute('data-stage-state', 'active');
    await expect(root).toHaveAttribute('data-state', 'error', { timeout: 60_000 });
    const error = root.locator('[data-firmware-error]');
    await expect(error).toHaveAttribute('data-error-code', 'no-download-mode');
    await expect(error).toContainText('보드가 굽기 모드로 바뀌지 않았어요');
    await expect(error.locator('[data-error-steps] li').first()).toContainText('BOOT 버튼을 손가락으로 누른 채로 [다시 시도]를 눌러요');
    await expect(error.getByRole('button', { name: '다시 시도' })).toBeVisible();
    await expect(error.getByRole('link', { name: '포트·케이블·드라이버 도움말 보기' })).toBeVisible();
    await expect(error.locator('[data-error-raw]')).toContainText('Failed to connect with the device');
    await expect(stage(root, 'chip')).toHaveAttribute('data-stage-state', 'failed');
    await expect(stage(root, 'chip')).toContainText('보드가 굽기 모드로 바뀌지 않았어요');
    // 파일 받기는 끝났어도 "진행 중"으로 남지 않는다
    await expect(stage(root, 'file')).toHaveAttribute('data-stage-state', 'waiting');
    await root.screenshot({ path: testInfo.outputPath('firmware-boot-error.png') });

    // BOOT 버튼을 누른 채 [다시 시도] 흉내: 이번에는 보드가 굽기 모드로 바뀐다 → 보드가 대답했던 포트라 선택 창 없이 그 포트로 끝까지 굽는다
    const board = serialMock(page);
    expect(await board.requests()).toHaveLength(1);
    await page.evaluate(() => {
      const device = (globalThis as unknown as { __apcSerialMock: { device(id: string): { options: { autoResetCircuit?: boolean } } } }).__apcSerialMock.device('board');
      device.options.autoResetCircuit = true;
    });
    await error.getByRole('button', { name: '다시 시도' }).click();
    await expect(root).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    expect(await board.requests()).toHaveLength(1);
    await expect(root.locator('[data-firmware-done]')).toContainText('끝났어요!');
  });

  test('속도를 올리지 못하면 [느린 속도로 다시 굽기]로 115200 그대로 끝까지 굽는다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    const firmware = testFirmware(12_000);
    await installBoard(page, {}, { ignoreBaudChange: true });
    await serveFirmware(page, firmware.image);
    const root = await openFlasher(page, firmware.info);
    await expect(root).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });
    await root.getByRole('button', { name: '펌웨어 굽기 시작' }).click();
    await expect(root).toHaveAttribute('data-state', 'error', { timeout: 60_000 });
    const error = root.locator('[data-firmware-error]');
    await expect(error).toHaveAttribute('data-error-code', 'baud-failed');
    const slow = error.getByRole('button', { name: '느린 속도로 다시 굽기' });
    await expect(slow).toBeVisible();
    const changesBefore = await romCount(page, 'CHANGE_BAUDRATE');
    expect(changesBefore).toBe(1);
    await slow.click();
    await expect(root).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    expect(await romCount(page, 'CHANGE_BAUDRATE')).toBe(changesBefore);
    expect((await romSummary(page)).baudRate).toBe(115200);
    await expect(root.locator('[data-firmware-log]')).toContainText('at 115200 bps');
  });

  test('포트 선택 창을 닫으면 오류가 아닌 안내로 알리고 다시 누르면 창이 다시 뜬다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    await installBoard(page);
    const root = await openFlasher(page);
    const board = serialMock(page);
    await board.chooseNext(null);
    const manual = root.locator('[data-firmware-manual]');
    await manual.locator(':scope > summary').click();
    await manual.getByRole('button', { name: '칩만 확인하기' }).click();
    await expect(root).toHaveAttribute('data-state', 'error', { timeout: 15_000 });
    const error = root.locator('[data-firmware-error]');
    await expect(error).toHaveAttribute('data-error-code', 'port-cancelled');
    await expect(error).toHaveAttribute('data-tone', 'notice');
    await expect(error).toContainText('포트를 고르지 않았어요');
    await expect(stage(root, 'port')).toHaveAttribute('data-stage-state', 'waiting');
    await error.getByRole('button', { name: '칩 다시 확인하기' }).click();
    await expect(root).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    expect(await board.requests()).toHaveLength(2);
  });

  test.describe('운영자가 받은 실제 펌웨어 파일로', () => {
    const staged = path.join(ROOT, '.cache', 'firmware-staging', 'ESP32_GENERIC-20260824-v1.29.0.bin');
    test.skip(!fs.existsSync(staged), '.cache/firmware-staging에 실제 파일이 있는 컴퓨터(운영자 PC)에서만 — CI에는 없다');

    test('실제 목록(1,790,544바이트·SHA-256 e67ad601…)과 실제 파일이 브라우저 검증을 통과하고 모의 보드에 끝까지 구워진다', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
      test.setTimeout(240_000);
      const image = new Uint8Array(fs.readFileSync(staged));
      await installBoard(page);
      await page.route(`**/${String(REAL_FIRMWARE.path)}`, (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(image) }));
      const root = await openFlasher(page);
      await expect(root).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });
      await root.getByRole('button', { name: '펌웨어 굽기 시작' }).click();
      await expect(stage(root, 'file')).toContainText('크기 1,790,544바이트 · SHA-256 일치', { timeout: 60_000 });
      await expect(root).toHaveAttribute('data-state', 'done', { timeout: 200_000 });
      const flashMd5 = await page.evaluate(
        ([offset, length]) => (globalThis as unknown as { __apcEsp32Rom: { md5(id: string, o: number, l: number): string } }).__apcEsp32Rom.md5('board', offset!, length!),
        [0x1000, image.length],
      );
      expect(flashMd5).toBe('9bc5ba8866e70b194d92af536c143070');
      expect(await romCount(page, 'MEM_BEGIN')).toBe(0);
      await expect(root.locator('[data-firmware-log]')).toContainText('flash done: 1790544 bytes');
    });
  });

  test('[멈추기]를 누르고 확인하면 쓰기를 바로 멈추고 다시 구우라고 안내한다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    const firmware = testFirmware(64_000);
    await installBoard(page, {}, { writeMsPerBlock: 60 });
    await serveFirmware(page, firmware.image);
    const root = await openFlasher(page, firmware.info);
    await expect(root).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });
    await root.getByRole('button', { name: '펌웨어 굽기 시작' }).click();
    const bar = stage(root, 'write').locator('[data-progress-bar]');
    await expect.poll(() => bar.evaluate((node) => (node as HTMLProgressElement).value), { timeout: 30_000 }).toBeGreaterThan(5);
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('반쯤만 들어가');
      void dialog.accept();
    });
    const stoppedAt = Date.now();
    await root.getByRole('button', { name: '멈추기' }).click();
    await expect(root).toHaveAttribute('data-state', 'error', { timeout: 10_000 });
    expect(Date.now() - stoppedAt).toBeLessThan(5_000);
    const error = root.locator('[data-firmware-error]');
    await expect(error).toHaveAttribute('data-error-code', 'aborted');
    await expect(error).toContainText('굽기를 멈췄어요');
    await expect(root.getByRole('button', { name: '멈추기' })).toBeHidden();
    await expect.poll(() => serialMock(page).isOpen()).toBe(false);
  });

  test('쓰는 도중 USB 선이 빠지면 "보드와 연결이 끊겼어요"로 바로 멈춘다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    const firmware = testFirmware(64_000);
    await installBoard(page, {}, { writeMsPerBlock: 40 });
    await serveFirmware(page, firmware.image);
    const root = await openFlasher(page, firmware.info);
    await expect(root).toHaveAttribute('data-file-state', 'available', { timeout: 15_000 });
    await root.getByRole('button', { name: '펌웨어 굽기 시작' }).click();
    const bar = stage(root, 'write').locator('[data-progress-bar]');
    await expect.poll(() => bar.evaluate((node) => (node as HTMLProgressElement).value), { timeout: 30_000 }).toBeGreaterThan(10);
    const unpluggedAt = Date.now();
    await serialMock(page).unplug();
    await expect(root).toHaveAttribute('data-state', 'error', { timeout: 10_000 });
    expect(Date.now() - unpluggedAt).toBeLessThan(5_000);
    const error = root.locator('[data-firmware-error]');
    await expect(error).toHaveAttribute('data-error-code', 'device-lost');
    await expect(error).toContainText('보드와 연결이 끊겼어요');
    await expect(stage(root, 'write')).toHaveAttribute('data-stage-state', 'failed');
  });

  test('선생님용 [칩만 확인하기]는 굽지 않고 칩을 보여 준 뒤 보드를 다시 시작한다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    await installBoard(page);
    const root = await openFlasher(page);
    const manual = root.locator('[data-firmware-manual]');
    await manual.locator(':scope > summary').click();
    await manual.getByRole('button', { name: '칩만 확인하기' }).click();
    await expect(root).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    await expect(root.locator('[data-firmware-done]')).toContainText('칩 확인이 끝났어요.');
    await expect(root.locator('[data-firmware-done]')).toContainText('ESP32-D0WD-V3 (revision 3) · 플래시 4MB');
    await expect(stage(root, 'write')).toHaveAttribute('data-stage-state', 'skipped');
    expect(await romCount(page, 'FLASH_DEFL_BEGIN')).toBe(0);
    await expect.poll(() => serialMock(page).mode()).toBe('friendly');
  });

  test('보드 준비 페이지에 들어가도 페이지의 다른 안내·찾기와 겹치지 않는다(글·id·검색 색인)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    const root = await openFlasher(page);
    // tests/e2e/start.spec.ts가 getByText로 누르는 글이 페이지에 하나뿐이다(굽기 화면이 같은 글을 만들지 않는다)
    await expect(page.getByText('포트 선택 창에 보드가 안 보여요')).toHaveCount(1);
    await expect(page.getByText('충전 전용 케이블로는 연결되지 않아요')).toHaveCount(1);
    // id가 페이지 안에서 겹치지 않는다
    const duplicateIds = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const element of document.querySelectorAll('[id]')) {
        seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
      }
      return [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    });
    expect(duplicateIds).toEqual([]);
    // 굽기 화면 글은 사이트 검색 색인에서 빠진다
    await expect(root.locator('xpath=ancestor-or-self::*[@data-pagefind-ignore]')).not.toHaveCount(0);
    // 제목 단계: 페이지의 h2("3단계 보드에 MicroPython 굽기") 아래 h3, 선생님용 접힘 안은 h4
    await expect(root.locator('h3.fw__title')).toHaveText('펌웨어 굽기');
    await expect(root.locator('h4.fw__manual-title')).toHaveCount(4);
  });

  test('USB 보드 연결 기능이 없는 브라우저면 굽기 단추 대신 안내만 보인다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만');
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'serial', { configurable: true, get: () => undefined });
    });
    const root = await openFlasher(page);
    await expect(root).toHaveAttribute('data-support', 'no-serial');
    const notice = root.locator('[data-firmware-unsupported]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('이 브라우저에는 USB 보드 연결 기능이 없어요.');
    await expect(notice).toContainText('컴퓨터용 Chrome이나 Edge');
    await expect(root.locator('[data-firmware-run]')).toBeHidden();
    await expect(root.locator('[data-firmware-manual] > summary')).toBeVisible();
  });

  test('휴대폰 화면에서는 굽기 대신 컴퓨터에서 하라고 안내하고 가로로 넘치지 않는다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '휴대폰 화면에서만');
    const errors = collectPageErrors(page);
    const root = await openFlasher(page);
    await expect(root).toHaveAttribute('data-support', 'mobile');
    await expect(root.locator('[data-firmware-unsupported]')).toContainText('휴대폰이나 태블릿에서는 펌웨어를 굽지 않아요.');
    await expect(root.locator('[data-firmware-run]')).toBeHidden();
    await root.locator('[data-firmware-manual] > summary').click();
    await root.scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await root.screenshot({ path: testInfo.outputPath('firmware-mobile-panel.png') });
    expect(errors).toEqual([]);
  });
});
