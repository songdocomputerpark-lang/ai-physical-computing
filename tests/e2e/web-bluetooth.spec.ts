// 실제 블루투스(Web Bluetooth) 연결 화면 — PLAN §8.4 P4-04.
// 완료 기준: "크롬에서 연결 화면·오류 안내가 뜬다. 실제 보드 송수신은 운영자 확인."
// 그래서 이 검사는 **가짜 navigator.bluetooth**(src/lab/ble/mock/)로 화면과 흐름까지만 본다 — 실물 송수신은 부록 B 15번.
//
// 가짜를 끼우는 법은 모의 시리얼(README 8.3)과 같다: src/lab/ble/mock/browser-entry.ts를 esbuild로 묶어
// page.addInitScript로 페이지 스크립트보다 먼저 돌린다. 설정은 globalThis.__APC_BLE_MOCK_CONFIG__,
// 조작·확인은 globalThis.__APC_BLE_MOCK__.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import type { BleMockGlobalConfig, BleMockHandle } from '../../src/lab/ble/mock/browser-entry.ts';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, setEditorCode } from './helpers/lab.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY = path.join(ROOT, 'src/lab/ble/mock/browser-entry.ts');

test.describe.configure({ timeout: 180_000 });

let bundlePromise: Promise<string> | null = null;

/** 가짜 블루투스 스크립트(한 번만 묶는다) */
function mockBundle(): Promise<string> {
  bundlePromise ??= build({
    stdin: {
      contents: [`import { bootBleMock } from ${JSON.stringify(ENTRY)};`, 'bootBleMock();'].join('\n'),
      resolveDir: ROOT,
      sourcefile: 'apc-ble-mock-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'silent',
  }).then((result) => {
    const output = result.outputFiles[0];
    if (!output) {
      throw new Error('가짜 블루투스 스크립트를 묶지 못했어요.');
    }
    return output.text;
  });
  return bundlePromise;
}

/** page.goto 전에 부른다 */
async function installBleMock(page: Page, config: BleMockGlobalConfig = {}): Promise<void> {
  const bundle = await mockBundle();
  await page.addInitScript({ content: `globalThis.__APC_BLE_MOCK_CONFIG__ = ${JSON.stringify(config)};\n${bundle}` });
}

/** 브라우저 안의 가짜 보드를 조작·확인한다 */
function bleMock(page: Page) {
  const call = <K extends keyof BleMockHandle>(name: K, args: unknown[] = []) =>
    page.evaluate(
      ([method, values]) => {
        const handle = (globalThis as unknown as { __APC_BLE_MOCK__?: Record<string, (...rest: unknown[]) => unknown> }).__APC_BLE_MOCK__;
        if (!handle) {
          throw new Error('가짜 블루투스가 없어요.');
        }
        return handle[method as string]?.(...(values as unknown[]));
      },
      [name, args] as [string, unknown[]],
    );
  return {
    writtenText: () => call('writtenText') as Promise<string>,
    receivedText: () => call('receivedText') as Promise<string>,
    notify: (text: string) => call('notify', [text]) as Promise<void>,
    drop: () => call('drop') as Promise<void>,
    calls: () => call('calls') as Promise<{ options: Record<string, unknown>; gesture: boolean | null }[]>,
    maxConcurrentWrites: () => call('maxConcurrentWrites') as Promise<number>,
    connectCount: () => call('connectCount') as Promise<number>,
    notifying: () => call('notifying') as Promise<boolean>,
  };
}

/** 블루투스 예제(f137)를 연 ESP32 실습실 — 코드에 ESP32BLE가 있어 블루투스 칸이 열린다 */
async function openBleLab(page: Page): Promise<void> {
  const response = await page.goto(`${withBase('labs/esp32/')}?example=${encodeURIComponent('esp32/bt/b1-ble-receive-print.py')}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(page.locator('[data-ble-real]')).toBeVisible({ timeout: 30_000 });
}

const panel = (page: Page) => page.locator('[data-ble-real]');
const connectButton = (page: Page) => page.locator('[data-ble-real-action="connect"]');

test.describe('실제 블루투스 연결 화면', () => {
  test('보드를 고르면 이어지고, 보낸 값이 보드에 닿고, 보드가 보낸 값이 콘솔에 나온다', async ({ page }) => {
    await installBleMock(page, { devices: [{ name: 'ESP32-07' }] });
    await openBleLab(page);

    await connectButton(page).click();
    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'open', { timeout: 10_000 });
    await expect(page.locator('[data-ble-real-badge]')).toHaveText('연결됨');
    await expect(page.locator('[data-ble-real-status]')).toContainText('ESP32-07');
    await expect(page.locator('[data-ble-real-device]')).toContainText('기기 주소를 알려 주지 않아요');

    // 선택 창은 **클릭(사용자 조작) 안에서** 열렸다 — 저장소·안전 검토 항목
    const calls = await bleMock(page).calls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options.filters).toEqual([{ namePrefix: 'ESP32' }]);
    expect(calls[0]?.options.optionalServices).toEqual(['6e400001-b5a3-f393-e0a9-e50e24dcca9e']);
    const knowsActivation = await page.evaluate(() => typeof (navigator as { userActivation?: { isActive?: boolean } }).userActivation?.isActive === 'boolean');
    if (knowsActivation) {
      // 크롬 계열은 navigator.userActivation으로 "지금 사용자 조작 안인가"를 알 수 있다 — 참이어야 한다.
      expect(calls[0]?.gesture).toBe(true);
    }

    // 보내기 → 보드에 그대로 닿는다
    await page.locator('[data-ble-real-text]').fill('a');
    await page.locator('[data-ble-real-action="send"]').click();
    await expect.poll(() => bleMock(page).writtenText(), { timeout: 10_000 }).toBe('a\n');
    await expect(page.locator('[data-ble-real-log]')).toContainText('→ 보냄');
    await expect(page.locator('[data-ble-real-counts]')).toContainText('보낸 2바이트');

    // 보드가 보낸 값(알림) → 칸과 실습실 콘솔
    expect(await bleMock(page).notifying()).toBe(true);
    await bleMock(page).notify('COUNT,3\n');
    await expect(page.locator('[data-ble-real-log]')).toContainText('COUNT,3');
    await expect(page.locator('[data-lab-console]')).toContainText('보드가 보낸 값: COUNT,3');

    // [연결 끊기]
    await page.locator('[data-ble-real-action="disconnect"]').click();
    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'idle');
  });

  test('선택 창을 닫으면 무엇을 확인할지 한국어로 알려 준다', async ({ page }) => {
    await installBleMock(page, { chooser: 'cancel' });
    await openBleLab(page);

    await connectButton(page).click();
    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'error', { timeout: 10_000 });
    await expect(page.locator('[data-ble-real-problem-text]')).toContainText('고르지 않았');
    await expect(page.locator('[data-ble-real-problem-advice]')).toContainText('전원');
    await expect(page.locator('[data-ble-real-problem-advice]')).toContainText('가까운 기기 모두 보기');
  });

  test('블루투스 UART 서비스가 없는 기기를 고르면 "코드를 실행했는지" 안내가 난다', async ({ page }) => {
    await installBleMock(page, { devices: [{ name: 'ESP32-07', services: [] }] });
    await openBleLab(page);

    await connectButton(page).click();
    await expect(page.locator('[data-ble-real-problem-text]')).toContainText('UART 서비스', { timeout: 10_000 });
    await expect(page.locator('[data-ble-real-problem-advice]')).toContainText('ESP32BLE');
  });

  test('빠르게 여러 번 보내도 한 번에 하나씩 나가고, 20바이트가 넘으면 미리 알린다', async ({ page }) => {
    await installBleMock(page, { devices: [{ name: 'ESP32-07', writeDelayMs: 30 }] });
    await openBleLab(page);
    await connectButton(page).click();
    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'open', { timeout: 10_000 });

    const text = page.locator('[data-ble-real-text]');
    const send = page.locator('[data-ble-real-action="send"]');
    for (const value of ['1', '2', '3', '4']) {
      await text.fill(value);
      await send.click();
    }
    await expect.poll(() => bleMock(page).writtenText(), { timeout: 15_000 }).toBe('1\n2\n3\n4\n');
    expect(await bleMock(page).maxConcurrentWrites()).toBe(1);

    // 20바이트를 넘겨 보내면 경고가 뜨고, 보드는 앞 20바이트만 받아 둔다(실물과 같게 — §7.7)
    await text.fill('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    await page.locator('[data-ble-real-newline]').uncheck();
    await send.click();
    await expect(page.locator('[data-ble-real-warning]')).toContainText('20바이트', { timeout: 10_000 });
    await expect.poll(() => bleMock(page).receivedText(), { timeout: 10_000 }).toContain('ABCDEFGHIJKLMNOPQRST');
    expect(await bleMock(page).receivedText()).not.toContain('ABCDEFGHIJKLMNOPQRSTU');
  });

  test('보드가 꺼지면 알려 주고, [다시 연결]은 선택 창 없이 같은 보드에 잇는다', async ({ page }) => {
    await installBleMock(page, { devices: [{ name: 'ESP32-07' }] });
    await openBleLab(page);
    await connectButton(page).click();
    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'open', { timeout: 10_000 });

    await bleMock(page).drop();
    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'error');
    await expect(page.locator('[data-ble-real-problem-text]')).toContainText('끊겼어요');

    const reconnect = page.locator('[data-ble-real-action="reconnect"]');
    await expect(reconnect).toBeVisible();
    await reconnect.click();
    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'open', { timeout: 10_000 });
    expect(await bleMock(page).calls()).toHaveLength(1); // 선택 창은 한 번만 열렸다
    expect(await bleMock(page).connectCount()).toBe(2);
  });

  test('이름 앞부분으로 내 보드를 좁히고, [가까운 기기 모두 보기]로 모두 볼 수 있다', async ({ page }) => {
    await installBleMock(page, { devices: [{ name: '무선이어폰' }, { name: 'ESP32-12' }] });
    await openBleLab(page);

    await page.locator('[data-ble-real-prefix]').fill('ESP32-12');
    await connectButton(page).click();
    await expect(page.locator('[data-ble-real-status]')).toContainText('ESP32-12', { timeout: 10_000 });

    // 이름을 모를 때: 모두 보기(선택 창 설정이 acceptAllDevices로 바뀐다)
    await page.locator('[data-ble-real-action="disconnect"]').click();
    await page.locator('[data-ble-real-accept-all]').check();
    await connectButton(page).click();
    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'open', { timeout: 10_000 });
    const calls = await bleMock(page).calls();
    expect(calls.at(-1)?.options.acceptAllDevices).toBe(true);
    expect(calls.at(-1)?.options.filters).toBeUndefined();
  });

  test('교실 이름 규칙: 자리 번호로 코드 한 줄을 만들어 주고, 개인정보가 섞이면 알린다', async ({ page }) => {
    await installBleMock(page, { devices: [{ name: 'ESP32-07' }] });
    await openBleLab(page);

    await expect(page.locator('[data-ble-real-classroom]')).toContainText('자리 번호');
    await expect(page.locator('[data-ble-real-classroom]')).toContainText('이름·학번·전화번호를 넣지 말고');
    await page.locator('[data-ble-real-seat]').fill('12');
    await expect(page.locator('[data-ble-real-init-line]')).toHaveText('ble = ESP32BLE.init("ESP32-12")');

    await page.locator('[data-ble-real-prefix]').fill('2학년3반');
    await expect(page.locator('[data-ble-real-name-issues]')).toContainText('영문과 숫자');
  });

  test('블루투스를 쓸 수 없는 브라우저(아이폰·Firefox 등)에서는 까닭과 가상 블루투스 길을 알려 준다', async ({ page }) => {
    await installBleMock(page, { unsupported: true });
    await openBleLab(page);

    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'unsupported');
    const notice = page.locator('[data-ble-real-unsupported]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('블루투스');
    await expect(page.locator('[data-ble-real-fallback]')).toContainText('가상 보드의 블루투스 칸');
    await expect(connectButton(page)).toBeDisabled();

    // 가상 블루투스 칸(P4-03)으로 이어 간다
    const virtualButton = page.locator('[data-ble-real-action="virtual"]');
    await expect(virtualButton).toBeVisible();
    await virtualButton.click();
    await expect(page.locator('[data-lab-message]')).toContainText('가상 보드의 블루투스 칸으로 옮겼어요');
    await expect(page.locator('[data-ble-connect]')).toBeVisible();
  });

  test('키보드만으로 연결하고 보낼 수 있다', async ({ page }) => {
    await installBleMock(page, { devices: [{ name: 'ESP32-07' }] });
    await openBleLab(page);

    await connectButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toHaveAttribute('data-ble-real-state', 'open', { timeout: 10_000 });
    const text = page.locator('[data-ble-real-text]');
    await text.focus();
    await text.fill('b');
    await page.keyboard.press('Enter'); // form submit
    await expect.poll(() => bleMock(page).writtenText(), { timeout: 10_000 }).toBe('b\n');
  });

  test('코드가 블루투스를 쓰지 않으면 칸이 열리지 않는다', async ({ page }) => {
    await installBleMock(page, { devices: [{ name: 'ESP32-07' }] });
    await page.goto(withBase('labs/esp32/'));
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await setEditorCode(page, 'print("안녕")\n');
    await expect(page.locator('[data-lab-module-panel="web-bluetooth"]')).toBeHidden();
    await setEditorCode(page, 'import ESP32BLE\nble = ESP32BLE.init("ESP32-07")\n');
    await expect(page.locator('[data-lab-module-panel="web-bluetooth"]')).toBeVisible({ timeout: 10_000 });
  });

  test('다른 화면이 창 이벤트를 보내면 칸이 열린다([보내기] 패널에서 이 통로를 고를 때)', async ({ page }) => {
    await installBleMock(page, { devices: [{ name: 'ESP32-07' }] });
    await page.goto(withBase('labs/esp32/'));
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await setEditorCode(page, 'print("안녕")\n');
    await expect(page.locator('[data-lab-module-panel="web-bluetooth"]')).toBeHidden();
    // 브릿지 통로 'ble'을 열면 src/lab/ble/channel.ts가 같은 이벤트를 보낸다(구역 A의 [보내기] 패널이 통로를 고를 때)
    await page.evaluate(() => window.dispatchEvent(new Event('apc:web-bluetooth-show')));
    await expect(page.locator('[data-lab-module-panel="web-bluetooth"]')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('좁은 화면', () => {
  test('휴대폰 폭에서도 칸이 가로로 넘치지 않는다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '휴대폰 화면에서만 본다');
    await installBleMock(page, { devices: [{ name: 'ESP32-07' }] });
    await openBleLab(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
