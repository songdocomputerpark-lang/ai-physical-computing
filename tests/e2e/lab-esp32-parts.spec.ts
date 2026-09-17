// ESP32 실습실 — 보드 그림·첫 부품·배선도(PLAN §8.3 P3-02) 브라우저 테스트.
// 확인하는 것(완료 기준: "f046, f015, f052, f053과 진동 알림 새 예제가 돈다" — LED 켜짐 상태·버튼 누름·진동 표시)
//  1. 원본에서 옮긴 f046(내장 LED 깜빡이기): 파일 그대로 돌아 LED가 켜졌다 꺼지고, 보드 그림의 GPIO2 핀 머리가 1일 때 빛난다. 바깥 부품이 없어 배선도는 없다.
//  2. f015(BOOT 버튼): 기다리는 줄이 없는 반복문에서도 BOOT 버튼을 키보드(Enter를 누르고 있기)·마우스로 누르는 동안 LED가 켜진다.
//  3. f053(터치 센서 값 읽기): 배선도에 터치 센서와 GPIO17 신호선이 그려지고, 마우스·키보드(Space)·손가락(터치 화면)으로 누르는 동안 콘솔에 1이 나온다.
//  4. f052(터치 + 문자 LCD): LCD는 아직 없는 부품이라 "주의"가 보이고, 2번 줄 SoftI2C에서 한국어 안내가 든 ImportError로 끝난다(P3-04에서 끝까지 돈다).
//  5. 진동 알림 새 예제(PD-36): 터치하면 진동 모터가 떨리고(움직임 줄이기면 떨지 않고 "진동 중"), 사이트 배정 핀 안내가 보인다.
//  6. 배선 오류: 화면 검사(스트래핑 핀·한 핀에 입력·출력 부품·입력 전용 핀·아직 없는 부품)와 파이썬 검사(입력 부품 핀을 출력으로·출력 부품 핀을 입력으로·
//     부품 없는 핀을 출력으로)가 한국어로 보인다.
//  7. [그림 크게 보기]: 좁은 화면에서 그림을 넓게 펴 가로로 밀어 보고(페이지는 넘치지 않음), 고른 값을 기억한다.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, setEditorCode, waitDone } from './helpers/lab.ts';

const ESP32_PATH = withBase('labs/esp32/');

/**
 * 문자 LCD(P3-04 구역 B)가 가상 보드에 생겼는지 — 부품 폴더 parts/lcd-i2c/ 또는 SoftI2C 확장(apc_board_i2c.py)이 있으면 true.
 * "P3-04 전" 모습을 보는 검사는 그때 건너뛴다(병렬 제작 준비 2026-09-17 — 부품 구역이 이 공유 spec을 고치지 않아도 되게).
 */
function lcdEmulated(): boolean {
  const boardDir = path.join(process.cwd(), 'src', 'lab', 'modules', 'board');
  if (fs.existsSync(path.join(boardDir, 'parts', 'lcd-i2c', 'part.ts'))) {
    return true;
  }
  const walk = (dir: string): boolean =>
    fs.readdirSync(dir, { withFileTypes: true }).some((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name === 'apc_board_i2c.py'));
  return walk(boardDir);
}

function board(page: Page) {
  return page.locator('[data-board-io]');
}

function part(page: Page, id: string) {
  return page.locator(`[data-board-part="${id}"]`);
}

function header(page: Page, gpio: number) {
  return page.locator(`[data-board-header][data-gpio="${gpio}"]`);
}

function consoleBox(page: Page) {
  return page.locator('[data-lab-console]');
}

async function consoleText(page: Page): Promise<string> {
  return (await consoleBox(page).textContent()) ?? '';
}

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/**
 * 요소의 속성 값이 바뀌는 차례를 페이지 안에서 빠짐없이 모은다(같은 값이 이어지면 한 번만).
 * 짧게 켜졌다 꺼지는 모습(진동 0.3초·쉼 0.2초)을 expect 폴링 간격(100→250→500ms) 사이에 놓치지 않으려고 — 시간 창에 기대지 않는다(README 4.6).
 * 돌려주는 함수를 부르면 지금까지 모은 값을 쉼표로 이어 준다.
 */
async function recordAttribute(page: Page, selector: string, attribute: string): Promise<() => Promise<string>> {
  const key = `__record_${attribute}_${Math.random().toString(36).slice(2)}`;
  await page.locator(selector).evaluate(
    (element, { name, storeKey }) => {
      const values: string[] = [String(element.getAttribute(name))];
      (window as unknown as Record<string, string[]>)[storeKey] = values;
      new MutationObserver(() => {
        const value = String(element.getAttribute(name));
        if (values[values.length - 1] !== value) {
          values.push(value);
        }
      }).observe(element, { attributes: true, attributeFilter: [name] });
    },
    { name: attribute, storeKey: key },
  );
  return () => page.evaluate((storeKey) => ((window as unknown as Record<string, string[]>)[storeKey] ?? []).join(','), key);
}

/** 예제 파일을 주소로 골라 실습실을 연다(파이썬 준비까지 기다림) */
async function openExample(page: Page, file: string): Promise<void> {
  const response = await page.goto(`${ESP32_PATH}?example=${encodeURIComponent(file)}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 30_000 });
}

async function run(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(board(page)).toHaveAttribute('data-board-phase', 'run', { timeout: 60_000 });
}

async function stop(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).click();
  expect(await waitDone(page, 30_000)).toBe('stopped');
}

test.describe('ESP32 실습실 — 보드 그림과 첫 부품(P3-02)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('f046 원본 그대로: 내장 LED가 켜졌다 꺼지고 GPIO2 핀 머리가 1일 때 빛나며, 바깥 부품이 없어 배선도 대신 안내가 보인다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '예제 동작은 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openExample(page, 'esp32/u2/2-1-1-blink-check.py');
    await expect(labRoot(page)).toHaveAttribute('data-example', 'u2-2-1-1-blink-check');
    // 보드 그림: 핀 머리 30개, 스트래핑 핀 표시, 바깥 부품이 없으면 브레드보드·선 없음
    await expect(page.locator('[data-board-header]')).toHaveCount(30);
    await expect(page.locator('[data-board-stage] .board-strap-mark')).toHaveCount(5);
    await expect(page.locator('[data-board-breadboard]')).toHaveCount(0);
    await expect(page.locator('[data-board-wiring-empty]')).toBeVisible();
    await expect(page.locator('[data-board-problems]')).toBeHidden();
    await expect(header(page, 2)).toHaveAttribute('data-used', 'false');
    // 사이드카의 실습 방법이 보드 그림 위에 보인다
    await expect(page.locator('[data-board-practice]')).toBeVisible();
    await expect(page.locator('[data-board-practice-steps] li')).toHaveCount(3);
    await expect(page.locator('[data-board-practice-steps] li').nth(1)).toContainText('내장 LED(IO2)');

    const led = part(page, 'builtin-led');
    const ledSequence = await recordAttribute(page, '[data-board-part="builtin-led"]', 'data-visual-lit');
    const pinSequence = await recordAttribute(page, '[data-board-header][data-gpio="2"]', 'data-high');
    await run(page);
    // 0.5초마다 켜고 끈다: 모은 차례에 꺼짐 → 켜짐 → 꺼짐 → 켜짐이 들어 있다(LED 모습과 GPIO2 핀 머리 빛이 함께)
    await expect.poll(ledSequence, { timeout: 15_000 }).toContain('false,true,false,true');
    await expect.poll(pinSequence, { timeout: 5_000 }).toContain('false,true,false,true');
    await expect(header(page, 2)).toHaveAttribute('data-used', 'true');
    await expect(led).toHaveAttribute('aria-label', /내장 LED\(GPIO2\): 켜짐|내장 LED\(GPIO2\): 꺼짐/u);
    await expect(page.locator('[data-board-pin="2"]')).toContainText('내장 LED');
    await stop(page);
    await expect(led).toHaveAttribute('data-visual-lit', 'false');
    await expect(header(page, 2)).toHaveAttribute('data-high', 'false');
    expect(await consoleText(page)).not.toMatch(/Traceback|\[알림\]/u);
    expect(errors).toEqual([]);
  });

  test('f015 원본 그대로: 기다리는 줄이 없는 반복문에서도 BOOT 버튼을 키보드(Enter)·마우스로 누르는 동안 LED가 켜진다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '예제 동작은 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    await openExample(page, 'esp32/hw/boot-button-led-check.py');
    await run(page);
    const led = part(page, 'builtin-led');
    const boot = part(page, 'boot-button');
    await expect(page.locator('[data-board-pin="0"]')).toHaveAttribute('data-level', '1', { timeout: 10_000 });
    await expect(led).toHaveAttribute('data-visual-lit', 'false');

    // 키보드: Tab으로 닿는 버튼에 초점 → Enter를 누르고 있는 동안
    await boot.focus();
    await page.keyboard.down('Enter');
    await expect(boot).toHaveAttribute('aria-pressed', 'true');
    await expect(led).toHaveAttribute('data-visual-lit', 'true', { timeout: 10_000 });
    await page.keyboard.up('Enter');
    await expect(led).toHaveAttribute('data-visual-lit', 'false', { timeout: 10_000 });

    // 마우스
    await boot.hover();
    await page.mouse.down();
    await expect(led).toHaveAttribute('data-visual-lit', 'true', { timeout: 10_000 });
    await page.mouse.up();
    await expect(led).toHaveAttribute('data-visual-lit', 'false', { timeout: 10_000 });
    await stop(page);
  });

  test('f053 원본 그대로: 배선도에 터치 센서와 GPIO17 신호선이 그려지고, 누르는 동안 콘솔에 1이 나온다(데스크톱 마우스·키보드, 모바일 손가락)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openExample(page, 'esp32/u2/2-1-2-adv-touch-check.py');
    const touch = part(page, 'touch-digital');
    await expect(touch).toHaveAttribute('role', 'button');
    await expect(touch).toHaveAttribute('aria-label', /터치 센서\(GPIO17\)/u);
    await expect(page.locator('[data-board-breadboard]')).toHaveCount(1);
    await expect(page.locator('[data-board-wire="signal:touch-digital:sig"]')).toHaveAttribute('data-gpio', '17');
    await expect(page.locator('[data-board-wire="power:gnd"]')).toHaveCount(1);
    await expect(page.locator('[data-board-wire="power:vcc"]')).toHaveCount(1);
    await expect(header(page, 17)).toHaveAttribute('data-wired', 'true');
    await expect(page.locator('[data-board-wiring-empty]')).toBeHidden();
    await expect(page.locator('[data-board-problems]')).toBeHidden();
    await expect(page.locator('[data-board-practice-steps] li').nth(1)).toContainText('터치 센서를 마우스나 손가락으로 누르고 있거나');

    await run(page);
    await expect(consoleBox(page)).toContainText('Touch value: 0', { timeout: 30_000 });
    const ones = async () => count(await consoleText(page), 'Touch value: 1');

    if (test.info().project.name === 'mobile') {
      // 손가락: 터치 화면 입력(CDP)으로 누르고 있다가 뗀다 — 부품이 받는 것은 pointerType touch
      await touch.scrollIntoViewIfNeeded();
      const box = await touch.boundingBox();
      expect(box).not.toBeNull();
      const client = await page.context().newCDPSession(page);
      const point = { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) };
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await expect(touch).toHaveAttribute('aria-pressed', 'true');
      await expect(touch).toHaveAttribute('data-visual-pressed', 'true');
      await expect.poll(ones, { timeout: 10_000 }).toBeGreaterThan(0);
      await expect(header(page, 17)).toHaveAttribute('data-high', 'true');
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(touch).toHaveAttribute('aria-pressed', 'false');
    } else {
      // 마우스로 누르고 있기
      await touch.hover();
      await page.mouse.down();
      await expect(touch).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(ones, { timeout: 10_000 }).toBeGreaterThan(0);
      await expect(header(page, 17)).toHaveAttribute('data-high', 'true');
      await expect(page.locator('[data-board-pin="17"]')).toContainText('터치 센서');
      await page.mouse.up();
      await expect(touch).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('[data-board-pin="17"]')).toHaveAttribute('data-level', '0', { timeout: 10_000 });
      // 키보드: 초점을 옮겨 Space를 누르고 있는 동안
      const before = await ones();
      await touch.focus();
      await page.keyboard.down('Space');
      await expect(touch).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(ones, { timeout: 10_000 }).toBeGreaterThan(before);
      await page.keyboard.up('Space');
      await expect(touch).toHaveAttribute('aria-pressed', 'false');
    }
    // 떼면 다시 0이 나온다
    const zerosAfterRelease = count(await consoleText(page), 'Touch value: 0');
    await expect.poll(async () => count(await consoleText(page), 'Touch value: 0'), { timeout: 10_000 }).toBeGreaterThan(zerosAfterRelease);
    await stop(page);
    expect(errors).toEqual([]);
  });

  test('f052: 문자 LCD는 아직 없는 부품이라 "주의"가 보이고, 2번 줄에서 한국어 안내가 든 ImportError로 끝난다(P3-04 전)', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번만 본다.');
    test.skip(lcdEmulated(), '문자 LCD·SoftI2C 흉내(P3-04)가 생겨 f052가 끝까지 도는 것은 그 구역의 spec이 확인해요.');
    await openExample(page, 'esp32/u2/2-1-2-adv-touch-lcd-counter.py');
    const warning = page.locator('[data-board-problems] li[data-code="unknown-part"]');
    await expect(warning).toHaveAttribute('data-level', 'warning');
    await expect(warning).toContainText('주의:');
    await expect(warning).toContainText('문자 LCD(16×2)');
    await expect(part(page, 'touch-digital')).toHaveCount(1);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 60_000)).toBe('error');
    await expect(consoleBox(page)).toContainText('machine.SoftI2C은(는) 가상 보드에 아직 없어요');
  });

  test('진동 알림 새 예제: 터치하면 진동 모터가 두 번 떨리고 멈추며, 사이트 배정 핀 안내와 조절 막대가 있다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '예제 동작은 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openExample(page, 'esp32/04-touch-vibration-alert.py');
    await expect(labRoot(page)).toHaveAttribute('data-example', '04-touch-vibration-alert');
    const notice = page.locator('[data-board-problems] li[data-code="site-assigned"]');
    await expect(notice).toHaveAttribute('data-level', 'info');
    await expect(notice).toContainText('참고:');
    await expect(notice).toContainText('GPIO19는 원고에 핀 번호가 없어서 사이트가 정한 핀');
    await expect(page.locator('[data-board-wire="signal:vibration-motor:sig"]')).toHaveAttribute('data-gpio', '19');
    await expect(page.locator('[data-lab-param="buzz_time"]')).toHaveCount(1);
    const motor = part(page, 'vibration-motor');
    await expect(motor).toHaveAttribute('role', 'img');
    await expect(motor).toHaveAttribute('data-visual-on', 'false');
    const motorSequence = await recordAttribute(page, '[data-board-part="vibration-motor"]', 'data-visual-on');

    await run(page);
    const touch = part(page, 'touch-digital');
    await touch.hover();
    await page.mouse.down();
    await expect(consoleBox(page)).toContainText('알림!', { timeout: 20_000 });
    await expect(motor).toHaveAttribute('data-visual-on', 'true', { timeout: 10_000 });
    await expect(motor).toHaveAttribute('data-visual-motion', 'shake');
    await expect(motor).toHaveAttribute('aria-label', /진동 모터\(GPIO19\): 진동 중/u);
    await expect(header(page, 19)).toHaveAttribute('data-high', 'true');
    await page.mouse.up();
    // 두 번 떨고(켜짐 → 멈춤 → 켜짐 → 멈춤) 멈춘다 — 모은 차례로 확인(0.2초 쉼을 놓치지 않게)
    await expect.poll(motorSequence, { timeout: 15_000 }).toBe('false,true,false,true,false');
    await expect(motor).toHaveAttribute('data-visual-on', 'false');
    expect(count(await consoleText(page), '알림!')).toBe(1);
    await stop(page);
    expect(await consoleText(page)).not.toMatch(/Traceback|\[알림\]/u);
    expect(errors).toEqual([]);
  });

  test('움직임 줄이기 설정이면 진동 모터가 떨지 않고 "진동 중" 표시만 한다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번만 본다.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openExample(page, 'esp32/04-touch-vibration-alert.py');
    await run(page);
    await part(page, 'touch-digital').hover();
    await page.mouse.down();
    const motor = part(page, 'vibration-motor');
    await expect(motor).toHaveAttribute('data-visual-on', 'true', { timeout: 20_000 });
    await expect(motor).toHaveAttribute('data-visual-motion', 'still');
    await expect(motor).toContainText('진동 중');
    const animations = await motor.evaluate((element) => element.getAnimations({ subtree: true }).length);
    expect(animations).toBe(0);
    await page.mouse.up();
    await stop(page);
  });
});

test.describe('ESP32 실습실 — 배선 오류를 한국어로 알린다(P3-02)', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ serviceWorkers: 'block' });

  test('화면 검사: 스트래핑 핀·한 핀에 입력과 출력 부품·입력 전용 핀의 출력 부품·아직 없는 부품', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번만 본다.');
    // 진동 알림 예제의 배선을 일부러 틀리게 바꾼 페이지를 받는다(실습실 예제 목록 JSON만 바꿈)
    await page.route(
      (url) => url.pathname.endsWith('/labs/esp32/'),
      async (route) => {
        const response = await route.fetch();
        const html = await response.text();
        const patched = html.replace(/(<script[^>]*data-lab-examples[^>]*>)([\s\S]*?)(<\/script>)/u, (_whole, open: string, json: string, close: string) => {
          const examples = JSON.parse(json) as { id: string; parts?: unknown[] }[];
          const target = examples.find((example) => example.id === '04-touch-vibration-alert');
          if (target) {
            target.parts = [
              { part: 'touch-digital', pin: 5 },
              { part: 'vibration-motor', pin: 5 },
              { part: 'vibration-motor', id: 'motor-2', pin: 34 },
              // 아직 없는 부품: 앞으로도 생기지 않을 시험용 이름(부품 구역이 부품을 더해도 이 검사가 바뀌지 않게)
              { part: 'demo-not-emulated', pins: { sda: 21, scl: 22 }, label: '시험용 모듈 XY' },
            ];
          }
          return `${open}${JSON.stringify(examples).replace(/</gu, '\\u003c')}${close}`;
        });
        // 본문 길이가 바뀌었으니 원래 content-length는 버린다(미리 보기 서버는 길이를 적어 보낸다)
        const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => name.toLowerCase() !== 'content-length'));
        await route.fulfill({ response, body: patched, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
      },
    );
    await openExample(page, 'esp32/04-touch-vibration-alert.py');
    const problems = page.locator('[data-board-problems]');
    await expect(problems).toBeVisible();
    await expect(problems.locator('li[data-code="input-output-same-pin"]')).toContainText('오류: GPIO5에 값을 보내는 부품(터치 센서)과 보드가 움직이는 부품(진동 모터)이 함께 이어져 있어요');
    await expect(problems.locator('li[data-code="input-only-output"]')).toContainText('34~39번은 입력 전용이라 부품을 움직일 수 없어요');
    await expect(problems.locator('li[data-code="strapping"]')).toContainText('주의: GPIO5은(는) 전원을 켤 때 부팅 방식을 정하는 스트래핑 핀이에요');
    await expect(problems.locator('li[data-code="unknown-part"]')).toContainText('"시험용 모듈 XY"은(는) 가상 보드에 아직 없어서');
    // 오류가 주의보다 먼저 보인다
    const levels = await problems.locator('li').evaluateAll((items) => items.map((item) => item.getAttribute('data-level')));
    expect(levels.indexOf('warning')).toBeGreaterThan(levels.lastIndexOf('error'));
    // 그림: GPIO5 핀 머리에 선 두 개, 핀 머리가 있는 34번에도 선
    await expect(page.locator('[data-board-wire][data-gpio="5"]')).toHaveCount(2);
    await expect(header(page, 34)).toHaveAttribute('data-wired', 'true');
  });

  test('파이썬 검사: 입력 부품 핀을 출력으로·출력 부품 핀을 입력으로·출력으로 정하지 않고 쓰기·부품 없는 핀을 출력으로 정하면 콘솔에 알린다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 한 번만 본다.');
    await openExample(page, 'esp32/04-touch-vibration-alert.py');
    await setEditorCode(
      page,
      ['from machine import Pin', 'Pin(17, Pin.OUT)', 'motor = Pin(19, Pin.IN)', 'motor.on()', 'Pin(18, Pin.OUT).on()', "print('끝')"].join('\n'),
    );
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 60_000)).toBe('ok');
    const text = await consoleText(page);
    expect(text).toContain('17번 핀에는 터치 센서(값을 보내는 부품)이(가) 이어져 있는데 출력(Pin.OUT)으로 정했어요');
    expect(text).toContain('19번 핀에는 진동 모터(보드가 움직이는 부품)이(가) 이어져 있는데 입력(Pin.IN)으로 정했어요');
    expect(text).toContain('출력(Pin.OUT)으로 정하지 않아서 값을 써도 신호가 나가지 않아요');
    expect(text).toContain('18번 핀을 출력으로 정했는데, 이 예제의 배선도에는 18번 핀에 이은 부품이 없어요');
    expect(text).toContain('끝');
    // 입력 모드로 on()을 부른 진동 모터는 떨지 않는다(실물처럼 신호가 나가지 않음)
    await expect(part(page, 'vibration-motor')).toHaveAttribute('data-visual-on', 'false');
  });
});

test.describe('ESP32 실습실 — [그림 크게 보기](P3-02)', () => {
  test('좁은 화면: 그림을 넓게 펴 가로로 밀어 보고 페이지는 넘치지 않으며, 고른 값을 새로고침 뒤에도 기억한다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '모바일 프로젝트에서 본다.');
    await page.goto(ESP32_PATH);
    await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
    const stage = page.locator('[data-board-stage]');
    const button = page.getByRole('button', { name: '그림 크게 보기' });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    const fitWidth = await stage.locator('svg').evaluate((svg) => svg.getBoundingClientRect().width);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(stage).toHaveAttribute('data-board-zoom-level', 'large');
    const largeWidth = await stage.locator('svg').evaluate((svg) => svg.getBoundingClientRect().width);
    expect(largeWidth).toBeGreaterThan(fitWidth * 1.8);
    expect(await stage.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.reload();
    await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
    await expect(page.locator('[data-board-stage]')).toHaveAttribute('data-board-zoom-level', 'large');
    await page.getByRole('button', { name: '그림 크게 보기' }).click();
    await expect(page.locator('[data-board-stage]')).toHaveAttribute('data-board-zoom-level', 'fit');
  });
});
