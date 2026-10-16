// ESP32 실습실 — 키트 장치 도감 예제는 고를 때 받는다(판 1.5.0 구역 K3a, src/lab/controls/lazy-examples.ts·DECISIONS C15·C151).
// 확인하는 것
//  1. 실습실 HTML의 예제 목록 JSON에는 키트 예제 212개가 목록 자리(id·제목·파일·묶음·받을 주소)로만 있고 코드는 없다.
//     열기만 해서는 키트 JSON을 하나도 받지 않고, [예제 불러오기]로 고르면 그 예제 JSON 하나를 받아 편집칸·배선·실습 방법·설명이 채워진다.
//     서비스 워커의 사전 캐시(셸)에는 키트 JSON이 없다.
//  2. 받은 키트 예제(4.01 가변저항 — 아날로그 센서 + 문자 LCD, 범용 부품 B1)가 [실행]으로 가상 보드에서 돈다: 조작 칸의 값이 LCD 글자로.
//  3. ?example=esp32/kit/…(차시 iframe의 &embed=1 포함)로 바로 열면 받는 동안 편집칸에 자리 글(읽기 전용)이 있다가 받은 코드로 바뀐다.
//  4. 받기가 실패하면(404 흉내) 안내 줄에 까닭과 [다시 받기]가 보이고, 앞 예제는 그대로이며, [다시 받기]로 받아진다.
//     ?example=로 연 예제를 받지 못하면 자리 글이 "받지 못했어요"로 바뀌고 [실행]은 다른 코드를 돌리지 않는다.
import { expect, test, type Page, type Route } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { editorContent, editorText, expectEditorToContain, labRoot, LOAD_TIMEOUT } from './helpers/lab.ts';

const ESP32_PATH = withBase('labs/esp32/');
const KIT_FILE = 'esp32/kit/ch4/4-01-potentiometer-1.py';
const KIT_ID = 'kit-ch4-4-01-potentiometer-1';
const KIT_CODE_LINE = 'pot = ADC(Pin(32))';
const KIT_ROUTE = '**/labs/esp32/kit-code/**';

interface EmbeddedExample {
  id: string;
  title: string;
  code: string;
  file?: string;
  codeUrl?: string;
}

function board(page: Page) {
  return page.locator('[data-board-io]');
}

function part(page: Page, id: string) {
  return page.locator(`[data-board-part="${id}"]`);
}

function message(page: Page) {
  return page.locator('[data-lab-message]');
}

/** 키트 JSON 요청(주소)을 모은다 */
function kitRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/labs/esp32/kit-code/')) {
      urls.push(request.url());
    }
  });
  return urls;
}

async function openEsp32Lab(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`${ESP32_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 30_000 });
}

async function chooseExample(page: Page, id: string): Promise<void> {
  await page.locator('[data-lab-example-select]').selectOption(id);
  await page.locator('[data-lab-example-load]').click();
}

test.describe('ESP32 실습실 — 키트 장치 도감 예제는 고를 때 받는다', () => {
  test.describe.configure({ timeout: 180_000 });

  test('HTML에는 목록 자리만 있고, 고르면 그 예제 JSON 하나를 받아 편집칸·배선·실습 방법이 채워진다(사전 캐시 밖)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requested = kitRequests(page);
    await openEsp32Lab(page);

    const embedded = await page.locator('script[data-lab-examples]').evaluate((element) => JSON.parse(element.textContent ?? '[]') as EmbeddedExample[]);
    const kit = embedded.filter((example) => example.file?.startsWith('esp32/kit/'));
    expect(kit).toHaveLength(212);
    for (const example of kit) {
      expect(example.code, example.id).toBe('');
      expect(example.codeUrl, example.id).toMatch(new RegExp(`^${withBase('labs/esp32/kit-code/')}ch\\d/[a-z0-9-]+\\.json\\?v=\\d+\\.\\d+\\.\\d+$`, 'u'));
    }
    // 교과서·사이트 예제는 지금처럼 코드째
    expect(embedded.find((example) => example.id === '01-first-blink')?.code).toContain('Pin');
    // 브릭셀 웹 전용 1.7.7 두 개는 싣지 않는다
    expect(embedded.map((example) => example.file)).not.toContain('esp32/kit/ch1/1-7-7-brx-ble.py');
    await expect(labRoot(page)).toHaveAttribute('data-example', '01-first-blink');
    expect(requested).toEqual([]);

    await chooseExample(page, KIT_ID);
    await expect(labRoot(page)).toHaveAttribute('data-example', KIT_ID);
    await expectEditorToContain(page, KIT_CODE_LINE);
    await expect(labRoot(page)).toHaveAttribute('data-example-fetch', 'done');
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain('/labs/esp32/kit-code/ch4/4-01-potentiometer-1.json?v=');
    // 받은 내용: 배선(아날로그 센서 + 문자 LCD)·실습 방법·설명
    await expect(part(page, 'sensor-analog')).toHaveCount(1);
    await expect(part(page, 'lcd')).toHaveAttribute('data-part', 'lcd-i2c');
    await expect(page.locator('[data-board-practice]')).toBeVisible();
    await expect(page.locator('[data-board-practice]')).toContainText('가변저항');
    await expect(page.locator('[data-lab-example-description]')).toContainText('손잡이를 돌리면');
    await expect(message(page)).toContainText('예제를 불러왔어요');

    // 다른 예제로 갔다가 돌아오면 다시 받지 않는다(받은 예제가 목록 자리를 바꿨다)
    await chooseExample(page, '01-first-blink');
    await expect(labRoot(page)).toHaveAttribute('data-example', '01-first-blink');
    await chooseExample(page, KIT_ID);
    await expectEditorToContain(page, KIT_CODE_LINE);
    expect(requested).toHaveLength(1);

    // 서비스 워커 사전 캐시(셸)에 키트 JSON이 들어가지 않는다
    const sw = await page.request.get(withBase('sw.js'));
    expect(sw.ok()).toBe(true);
    expect(await sw.text()).not.toContain('kit-code');
    expect(errors).toEqual([]);
  });

  test('받은 키트 예제(4.01 가변저항 — 아날로그 센서 + 문자 LCD)가 [실행]으로 가상 보드에서 돈다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '실행 결과는 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    await openEsp32Lab(page);
    await chooseExample(page, KIT_ID);
    await expectEditorToContain(page, KIT_CODE_LINE);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });

    const controls = page.locator('[data-board-part-controls="sensor-analog"]');
    const number = controls.locator('input[data-sensor-analog-number]');
    await number.fill('3000');
    await expect(controls).toHaveAttribute('data-sensor-analog-value', '3000');

    await page.getByRole('button', { name: '실행', exact: true }).click();
    const lcd = part(page, 'lcd');
    await expect(lcd).toHaveAttribute('data-visual-line1', 'Analog'.padEnd(16), { timeout: 60_000 });
    await expect(lcd).toHaveAttribute('data-visual-line2', 'Val 3000 73%'.padEnd(16), { timeout: 30_000 });
    await expect(page.locator('[data-lab-console]')).toContainText('가변저항 테스트 시작');
    // 실행 중에 값을 바꾸면 다음 읽기(0.3초마다)에 LCD가 따라온다
    await number.fill('1000');
    await expect(lcd).toHaveAttribute('data-visual-line2', 'Val 1000 24%'.padEnd(16), { timeout: 10_000 });

    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', 'stopped', { timeout: 30_000 });
  });

  test.describe('주소로 바로 열기·받기 실패', () => {
    // page.route가 키트 JSON 요청을 보게 서비스 워커를 막는다(서비스 워커가 가로챈 요청은 page.route에 오지 않는다)
    test.use({ serviceWorkers: 'block' });

    test('?example=esp32/kit/…&embed=1로 열면 받는 동안 자리 글(읽기 전용)이 있다가 받은 코드로 바뀐다', async ({ page }) => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(KIT_ROUTE, async (route: Route) => {
        await gate;
        await route.continue();
      });
      await openEsp32Lab(page, `?example=${KIT_FILE}&embed=1`);
      await expect(labRoot(page)).toHaveAttribute('data-example', KIT_ID);
      await expect(labRoot(page)).toHaveAttribute('data-example-pending', 'loading');
      await expect(labRoot(page)).toHaveAttribute('data-example-fetch', 'loading');
      expect(await editorText(page)).toContain('예제 코드를 받는 중이에요');
      await expect(editorContent(page)).toHaveAttribute('aria-readonly', 'true');
      await expect(message(page)).toContainText('예제 코드를 받는 중이에요');
      // 찾지 못한 예제로 보지 않는다(목록에 있는 예제)
      await expect(labRoot(page)).not.toHaveAttribute('data-example-missing', /.*/u);

      release();
      await expectEditorToContain(page, KIT_CODE_LINE);
      await expect(labRoot(page)).toHaveAttribute('data-example-fetch', 'done');
      await expect(labRoot(page)).not.toHaveAttribute('data-example-pending', /.*/u);
      await expect(editorContent(page)).not.toHaveAttribute('aria-readonly', /.*/u);
      await expect(part(page, 'lcd')).toHaveCount(1);
      await expect(page.locator('[data-lab-example-select]')).toHaveValue(KIT_ID);
      // 받은 코드는 자동 저장본이 아니다(고치기 전까지 "저장됨"이 없다)
      await expect(labRoot(page)).toHaveAttribute('data-save-state', 'idle');
    });

    test('받기가 실패하면(404) 까닭과 [다시 받기]가 보이고 앞 예제는 그대로, [다시 받기]로 받아진다', async ({ page }) => {
      await page.route(KIT_ROUTE, (route: Route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
      await openEsp32Lab(page);
      const before = await editorText(page);
      expect(before).toContain('Pin');

      await chooseExample(page, KIT_ID);
      await expect(message(page)).toContainText('예제 코드를 받지 못했어요(사이트에서 예제 파일을 찾지 못했어요(404))');
      const retry = page.locator('[data-lab-example-retry]');
      await expect(retry).toBeVisible();
      await expect(retry).toHaveText('다시 받기');
      await expect(labRoot(page)).toHaveAttribute('data-example-fetch', 'failed');
      // 앞 예제·선택 상자는 그대로(받지 못한 예제가 열린 것처럼 보이지 않게)
      await expect(labRoot(page)).toHaveAttribute('data-example', '01-first-blink');
      await expect(page.locator('[data-lab-example-select]')).toHaveValue('01-first-blink');
      expect(await editorText(page)).toBe(before);

      await page.unroute(KIT_ROUTE);
      await retry.click();
      await expectEditorToContain(page, KIT_CODE_LINE);
      await expect(labRoot(page)).toHaveAttribute('data-example', KIT_ID);
      await expect(retry).toBeHidden();
      // 누른 [다시 받기]가 숨어도 초점은 문서로 사라지지 않는다(예제 선택 상자로)
      await expect(page.locator('[data-lab-example-select]')).toBeFocused();
    });

    test('?example=로 연 키트 예제를 받지 못하면 자리 글이 "받지 못했어요"로 바뀌고 [실행]은 다른 코드를 돌리지 않는다', async ({ page }) => {
      await page.route(KIT_ROUTE, (route: Route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
      await openEsp32Lab(page, `?example=${KIT_FILE}`);
      await expect(labRoot(page)).toHaveAttribute('data-example-pending', 'failed');
      await expectEditorToContain(page, '예제 코드를 받지 못했어요');
      await expect(editorContent(page)).toHaveAttribute('aria-readonly', 'true');
      await expect(message(page)).toContainText('[다시 받기]');
      await expect(page.locator('[data-lab-example-retry]')).toBeVisible();

      if (test.info().project.name !== 'mobile') {
        await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
        await page.getByRole('button', { name: '실행', exact: true }).click();
        await expect(message(page)).toContainText('예제 코드를 받지 못해서 할 수 없어요');
        await expect(labRoot(page)).toHaveAttribute('data-run-count', '0');
      }

      await page.unroute(KIT_ROUTE);
      await page.locator('[data-lab-example-retry]').click();
      await expectEditorToContain(page, KIT_CODE_LINE);
      await expect(labRoot(page)).not.toHaveAttribute('data-example-pending', /.*/u);
      await expect(editorContent(page)).not.toHaveAttribute('aria-readonly', /.*/u);
    });
  });
});
