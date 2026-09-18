// ESP32 실습실 — 통신 템플릿 3종과 통신 블록(P4-10, 구역 templates) 브라우저 테스트.
//
// 무엇을 보나
//  1. **통신 템플릿 3개가 가상 보드에서 돈다**(완료 기준). UART 에코는 보낸 줄이 그대로 되돌아오고, 블루투스 알림은
//     상대 기기를 [연결]하면 COUNT 값이 도착하며, MQTT는 와이파이·브로커에 이어 값을 보내기 시작한다.
//  2. **블록 → 코드 → 실행 결과가 코드 모드와 같다**: 통신 블록 예시가 Node의 Blockly로 만든 코드를 편집칸에 그대로 넣고
//     [실행]하면 템플릿과 같은 결과가 난다(UART는 되돌아오는 줄, 블루투스는 도착한 COUNT).
//  3. **허용 목록 밖 MQTT 메시지는 무시된다**(PD-29) — 탭 두 개로 확인한다. 보내는 탭이 on·laser-on·off를 차례로 보내면
//     받는 탭(블록이 만든 코드)은 on·off만 받아 LED를 켜고 끄고, laser-on은 "무시했어요"로 흘린다.
//  4. (통합 뒤) 도구 상자 "통신" 칸에서 블록을 끌어 놓으면 편집칸에 같은 코드가 생긴다 — kit.ts에 withCommCategory·
//     installCommBlocks가 붙기 전에는 건너뛴다(.cache/phase4-requests/templates.md).
//
// 돌리는 법(구역 검증): PW_BASE_URL=http://localhost:4705/ai-physical-computing/ npx playwright test tests/e2e/esp32-comm-blocks.spec.ts --project=desktop
//
// 개발 서버로 돌릴 때 알아 둘 것: 다른 사람이 저장소 파일을 저장하면 Vite HMR이 페이지를 통째로 새로 고쳐 실습이 끊긴다
// (보드가 '멈춤'이 되고 콘솔이 비워진다). 병렬 제작 중에 뜬금없이 실패하면 이것부터 의심한다 — 빌드본(astro preview)에는 없다.
import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { BlocklyApi, BlocklyBlocksApi, BlocklyPythonApi } from '../../src/lab/blocks/blockly-types.ts';
import { PREFIX_STORAGE_NAME } from '../../src/lab/bridge/index.ts';
import { findCommPreset, installCommBlocks } from '../../src/lab/blocks/comm/index.ts';
import { createBlocksKit } from '../../src/lab/blocks/kit.ts';
import { storageKey } from '../../src/lib/storage.ts';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, setEditorCode, waitDone } from './helpers/lab.ts';

const ESP32_PATH = withBase('labs/esp32/');
const require = createRequire(import.meta.url);

/** 탭 통로를 함께 쓰려면 두 탭의 접두어가 같아야 한다(sessionStorage 기본 — PD-29) */
const SHARED_PREFIX = 'testprefix22';

/**
 * MQTT 보내는 쪽 탭이 돌릴 코드 — 한 마디를 한 번 보내고 끝난다(받는 쪽은 블록이 만든 코드다).
 * 짧은 토픽(`esp32-01/rx`)만 쓰고 우리 반 접두어는 통로가 붙인다. 한 번에 하나씩 보내야 순서가 또렷해 검사가 흔들리지 않는다.
 */
function mqttSenderCode(text: string): string {
  return [
    'import network',
    'from umqtt.simple import MQTTClient',
    '',
    'wlan = network.WLAN(network.STA_IF)',
    'wlan.active(True)',
    "wlan.connect('my-wifi', 'my-password')",
    '',
    "client = MQTTClient('pc-01', 'broker.emqx.io', port=1883)",
    'client.connect()',
    `client.publish('esp32-01/rx', '${text}')`,
    `print('보냄:', '${text}')`,
    '',
  ].join('\n');
}

/** 통신 블록 예시 → MicroPython 코드(단위 테스트와 같은 길: Node의 Blockly 13.3.0) */
function blockCode(presetId: string): string {
  const Blockly = require('blockly/core') as BlocklyApi;
  const libraryBlocks = require('blockly/blocks') as BlocklyBlocksApi;
  const python = require('blockly/python') as BlocklyPythonApi;
  Blockly.setLocale(require('blockly/msg/ko') as Record<string, string>);
  const kit = createBlocksKit({ Blockly, libraryBlocks, python });
  installCommBlocks({ Blockly, python, forBlock: kit.generator.forBlock as unknown as Record<string, unknown>, generator: kit.generator });
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(findCommPreset(presetId)!.state as unknown as Record<string, unknown>, workspace);
  return kit.generate(workspace).code;
}

function board(page: Page): Locator {
  return page.locator('[data-board-io]');
}

function part(page: Page, id: string): Locator {
  return page.locator(`[data-board-part="${id}"]`);
}

function controls(page: Page, id: string): Locator {
  return page.locator(`[data-board-part-controls="${id}"]`);
}

function consoleBox(page: Page): Locator {
  return page.locator('[data-lab-console]');
}

/** 이 탭도 같은 통신 접두어를 쓰게 한다(탭 통로는 접두어가 같아야 만난다) */
async function useSharedPrefix(page: Page): Promise<void> {
  const key = storageKey(PREFIX_STORAGE_NAME);
  await page.addInitScript(
    ([name, value]) => {
      try {
        window.sessionStorage.setItem(name!, value!);
      } catch {
        // 사생활 보호 모드처럼 저장이 막히면 그냥 둔다(접두어는 그때그때 새로 만들어진다)
      }
    },
    [key, SHARED_PREFIX] as const,
  );
}

async function openLab(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`${ESP32_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
}

async function run(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(board(page)).toHaveAttribute('data-board-phase', /^(run|idle|end)$/u, { timeout: 90_000 });
}

async function stop(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).click();
  expect(await waitDone(page, 30_000)).toBe('stopped');
}

/**
 * 시리얼 창에서 글자 한 줄을 보낸다(끝에 줄바꿈을 붙여서 — 템플릿이 한 줄로 읽는다).
 * 보드가 도는 동안만 보낼 수 있으므로 먼저 그것을 기다리고, 보낸 뒤에는 정말 나갔는지(data-uart-sent) 본다.
 */
async function sendLine(page: Page, text: string): Promise<void> {
  const serial = controls(page, 'uart');
  await expect(serial).toHaveAttribute('data-uart-running', 'true', { timeout: 30_000 });
  await serial.locator('[data-uart-ending]').selectOption('lf');
  const before = Number((await serial.getAttribute('data-uart-sent')) ?? '0');
  const input = serial.getByLabel('보낼 글자');
  await input.fill(text);
  await input.press('Enter');
  const problem = serial.locator('[data-uart-send-error]');
  if (await problem.isVisible()) {
    throw new Error(`시리얼 창이 "${text}"을(를) 보내지 못했어요: ${(await problem.textContent())?.trim() ?? ''}`);
  }
  await expect(serial).toHaveAttribute('data-uart-sent', String(before + 1), { timeout: 10_000 });
}

/** 보내는 쪽 탭에서 한 마디를 보낸다(코드를 넣고 [실행] → 끝날 때까지) */
async function publishOnce(sender: Page, text: string): Promise<void> {
  await setEditorCode(sender, mqttSenderCode(text));
  await sender.getByRole('button', { name: '실행', exact: true }).click();
  expect(await waitDone(sender, 90_000), `"${text}" 보내기가 끝나지 않았어요`).toBe('ok');
  await expect(consoleBox(sender)).toContainText(`보냄: ${text}`, { timeout: 10_000 });
}

test.describe('통신 템플릿과 통신 블록(P4-10)', () => {
  test.describe.configure({ timeout: 300_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '같은 파이썬·같은 흉내라 결과가 같다 — 데스크톱에서 한 번만 본다.');

  test('통신 템플릿 1(UART 에코): 보낸 줄이 그대로 되돌아온다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await openLab(page, '?example=esp32%2Ftemplates%2Fuart-echo.py');
    // 머리말 `# @part uart rx=17 tx=16` → 보드 아래 USB-UART 변환기와 엇갈린 배선
    await expect(part(page, 'uart')).toBeVisible();
    await expect(page.locator('[data-board-wire="signal:uart:rx"]')).toHaveAttribute('data-gpio', '17');
    await expect(page.locator('[data-board-wire="signal:uart:tx"]')).toHaveAttribute('data-gpio', '16');
    // 실습 방법(머리말 "── 실습 방법 ──")이 보드 그림 위에 보인다
    await expect(page.locator('[data-board-practice]')).toContainText('[보낼 글자]');

    await run(page);
    await expect(controls(page, 'uart').locator('[data-uart-status]')).toHaveText('보드 UART와 이어졌어요(9600bps).', { timeout: 30_000 });

    await sendLine(page, 'hello');
    await expect(consoleBox(page)).toContainText('1 번째 줄 받음: hello', { timeout: 20_000 });
    await expect(controls(page, 'uart').getByLabel('보드가 보낸 글자')).toHaveValue(/hello/u, { timeout: 20_000 });

    await sendLine(page, 'world');
    await expect(consoleBox(page)).toContainText('2 번째 줄 받음: world', { timeout: 20_000 });
    await expect(controls(page, 'uart').getByLabel('보드가 보낸 글자')).toHaveValue(/world/u, { timeout: 20_000 });
    await board(page).screenshot({ path: test.info().outputPath('template-uart-echo.png') });

    await stop(page);
    expect(errors).toEqual([]);
  });

  test('블록 → 코드 → 실행: 블록이 만든 UART 에코 코드가 템플릿과 같은 결과를 낸다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const code = blockCode('comm-uart-echo');
    expect(code).toContain('# @part uart rx=17 tx=16');
    expect(code).toContain('uart = UART(2, baudrate=9600, tx=17, rx=16, timeout=200)');

    await openLab(page);
    await setEditorCode(page, code);
    // 코드 모드에서도 블록 코드의 머리말을 읽어 배선도를 그린다(예제 배선이 아니라 코드에서)
    await expect(part(page, 'uart')).toBeVisible({ timeout: 20_000 });

    await run(page);
    await expect(controls(page, 'uart').locator('[data-uart-status]')).toHaveText('보드 UART와 이어졌어요(9600bps).', { timeout: 30_000 });

    await sendLine(page, 'hi');
    // 블록 코드는 print(받은줄) — 템플릿과 같은 줄이 되돌아오는지가 핵심이다
    await expect(consoleBox(page)).toContainText('hi', { timeout: 20_000 });
    await expect(controls(page, 'uart').getByLabel('보드가 보낸 글자')).toHaveValue(/hi/u, { timeout: 20_000 });

    await stop(page);
    expect(errors).toEqual([]);
  });

  test('통신 템플릿 2(블루투스 알림): 연결 전에는 한 번만 알리고, 연결하면 COUNT 값이 도착한다', async ({ page }) => {
    await openLab(page, '?example=esp32%2Ftemplates%2Fble-notify.py');
    // 머리말 `# @part ble 12` → 보드 안 블루투스와 상태 LED(GPIO12) 배선
    await expect(part(page, 'ble')).toBeVisible();

    await run(page);
    // 아직 상대 기기가 없다: 영어 트레이스백이 아니라 한국어 한 줄로 알리고 계속 돈다
    await expect(consoleBox(page)).toContainText('아직 연결된 기기가 없어요', { timeout: 30_000 });
    await page.waitForTimeout(4000);
    const notices = ((await consoleBox(page).textContent()) ?? '').split('아직 연결된 기기가 없어요').length - 1;
    expect(notices, '같은 안내가 1초마다 쌓이면 안 된다(한 번만)').toBe(1);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running');

    // 상대 기기(가상 스마트폰·컴퓨터)를 연결하면 그때부터 값이 도착한다
    const ble = controls(page, 'ble');
    await ble.locator('[data-ble-connect]').click();
    await expect(ble.getByLabel('주고받은 값')).toHaveValue(/COUNT,\d/u, { timeout: 30_000 });
    await board(page).screenshot({ path: test.info().outputPath('template-ble-notify.png') });

    await stop(page);
  });

  test('블록 → 코드 → 실행: 블록이 만든 블루투스 코드도 연결하면 값이 도착한다', async ({ page }) => {
    const code = blockCode('comm-ble-notify');
    expect(code).toContain('# @part ble 12');
    expect(code).toContain("ble = ESP32BLE.init('ESP32-01')");

    await openLab(page);
    await setEditorCode(page, code);
    await expect(part(page, 'ble')).toBeVisible({ timeout: 20_000 });

    await run(page);
    await expect(consoleBox(page)).toContainText('아직 연결된 기기가 없어요', { timeout: 30_000 });
    const ble = controls(page, 'ble');
    await ble.locator('[data-ble-connect]').click();
    // 블록은 숫자만 보낸다(ble_send(str(횟수))) — 템플릿과 같은 길로 값이 도착하는지가 핵심이다
    await expect(ble.getByLabel('주고받은 값')).toHaveValue(/[1-9]/u, { timeout: 30_000 });

    await stop(page);
  });

  test('통신 템플릿 3(MQTT): 와이파이와 브로커에 이어 값을 보내기 시작한다', async ({ page }) => {
    await useSharedPrefix(page);
    await openLab(page, '?example=esp32%2Ftemplates%2Fmqtt-pub-sub.py');
    await run(page);
    await expect(consoleBox(page)).toContainText('와이파이 연결: True', { timeout: 60_000 });
    // 토픽은 짧게 — 우리 반 접두어는 통로가 붙인다(코드에 또 적으면 두 번 붙는다)
    await expect(consoleBox(page)).toContainText('MQTT 연결됨: esp32-01/tx', { timeout: 30_000 });
    await expect(consoleBox(page)).not.toContainText('Traceback');
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running');
    // 공개 브로커 경고는 늘 화면에 보인다(PD-29)
    await expect(page.locator('[data-lab-module-panel="mqtt"]')).toBeVisible();

    await stop(page);
  });

  test('허용 목록 밖 MQTT 메시지는 무시된다(PD-29) — 탭 두 개', async ({ browser }) => {
    const context = await browser.newContext();
    const receiver = await context.newPage();
    const sender = await context.newPage();
    try {
      await useSharedPrefix(receiver);
      await useSharedPrefix(sender);

      // 받는 쪽: 블록이 만든 MQTT 코드(허용 목록·길이 검사가 들어 있다)
      const code = blockCode('comm-mqtt-pub-sub');
      expect(code).toContain("MQTT_ALLOW = ('on', 'off', 'blink')");
      await openLab(receiver);
      await setEditorCode(receiver, code);
      await run(receiver);
      await expect(consoleBox(receiver)).toContainText('MQTT 연결됨: esp32-01', { timeout: 90_000 });

      // 보내는 쪽 탭을 연다(한 번에 한 마디씩 보내고 끝나므로 순서가 또렷하다)
      await openLab(sender);
      const led = receiver.locator('[data-board-header][data-gpio="2"]');

      // ① 허용 목록 안의 on — 받아서 내장 LED가 켜진다
      await publishOnce(sender, 'on');
      await expect(led).toHaveAttribute('data-high', 'true', { timeout: 30_000 });

      // ② 허용 목록 밖의 laser-on — 무시하고 까닭을 한국어로 알린다. LED는 그대로 켜져 있다.
      await publishOnce(sender, 'laser-on');
      await expect(consoleBox(receiver)).toContainText('무시했어요(허용 목록에 없어요): laser-on', { timeout: 30_000 });
      await expect(led).toHaveAttribute('data-high', 'true');

      // ③ 20바이트를 넘는 긴 명령 — 길이 검사에서 먼저 걸린다(PD-29). LED는 그대로.
      await publishOnce(sender, 'off'.repeat(9));
      await expect(consoleBox(receiver)).toContainText('무시했어요(너무 긴 메시지)', { timeout: 30_000 });
      await expect(led).toHaveAttribute('data-high', 'true');

      // ④ 다시 허용 목록 안의 off — 그대로 통해서 꺼진다(막기만 하는 것이 아니다)
      await publishOnce(sender, 'off');
      await expect(led).toHaveAttribute('data-high', 'false', { timeout: 30_000 });

      await stop(receiver);
    } finally {
      await context.close();
    }
  });

  test('도구 상자 "통신" 칸이 붙으면 블록을 끌어 놓아 코드를 만든다', async ({ page }) => {
    await openLab(page, '?blocks=1');
    await expect(page.locator('[data-blocks]')).toHaveAttribute('data-blocks-ready', 'yes', { timeout: LOAD_TIMEOUT });
    const category = page.locator('[data-blocks-workspace] .blocklyToolboxCategory', { hasText: '통신' });
    const attached = (await category.count()) > 0;
    test.skip(!attached, '통합에서 kit.ts에 withCommCategory·installCommBlocks를 붙이면 이 검사가 돈다(.cache/phase4-requests/templates.md).');

    const { dragFromToolbox, editorCode } = await import('./helpers/blocks.ts');
    await dragFromToolbox(page, { category: '통신', type: 'apc_comm_uart_send', to: 'free' });
    await expect.poll(() => editorCode(page), { timeout: 20_000 }).toContain('uart.write(');
    await expect.poll(() => editorCode(page)).toContain('# @part uart rx=17 tx=16');
  });
});
