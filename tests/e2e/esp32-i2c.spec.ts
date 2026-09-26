// ESP32 실습실 — 구역 B(PLAN §8.3 P3-04 I2C 표시 장치) 브라우저 테스트. 규약은 src/lab/README.md 7.5·7.9, 부품은 src/lab/modules/board/parts/{lcd-i2c,oled-i2c}/.
// 완료 기준 "f047~f057, f144가 돈다 · LCD 글자가 화면에 보인다(글자 칸을 DOM 글자로도)"를 원본 예제 파일 그대로(?example=) 열어 본다.
//  1. 문자 LCD(f047): 글자 칸 32개(<tspan data-lcd-cell>)에 Hello LCD!, 백라이트·화면 낭독기 설명(<desc>)·배선·핀 표(오픈 드레인).
//  2. f050(move_to 별칭) Count 0→5, f052 터치(키보드 Space)로 Counter 2, f051 RTC 시계가 1초마다.
//  3. f049 콘솔 입력 → LCD, 19자 줄 넘김 덮어쓰기(원본 커서 규칙), 라이브러리 함수(사용자 정의 글자·깜빡이는 커서 — 움직임 줄이기면 멈춤·백라이트 끄기).
//  4. OLED(f054·f057·f056, 원고 이름 sh1106): 글자 설명·켜진 점 수·반전.
//  5. 실물과 같은 오류: 주소가 다르면 OSError: [Errno 19] ENODEV + 한국어 안내, SDA·SCL 바뀜, 배선도에 없는 OLED.
//  6. 휴대폰(375px): LCD·OLED가 보이고 [그림 크게 보기]에서도 가로로 넘치지 않는다.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, setEditorCode, waitDone } from './helpers/lab.ts';

const ESP32_PATH = withBase('labs/esp32/');
/** 빈 글자 칸에 넣는 줄바꿈 없는 공백(U+00A0) */
const NBSP = String.fromCharCode(0xa0);

function board(page: Page): Locator {
  return page.locator('[data-board-io]');
}

function part(page: Page, id: string): Locator {
  return page.locator(`[data-board-part="${id}"]`);
}

function consoleBox(page: Page): Locator {
  return page.locator('[data-lab-console]');
}

async function consoleText(page: Page): Promise<string> {
  return (await consoleBox(page).textContent()) ?? '';
}

/** LCD 한 줄을 DOM 글자 칸(16개 tspan)에서 읽는다 — 빈칸(NBSP)은 공백으로 */
async function lcdRow(lcd: Locator, row: number): Promise<string> {
  const cells = await lcd.locator(`[data-lcd-line="${row}"] [data-lcd-cell]`).allTextContents();
  return cells.map((text) => text.replaceAll(NBSP, ' ')).join('');
}

/** 요소 속성 값이 바뀌는 차례를 페이지 안에서 빠짐없이 모은다(같은 값이 이어지면 한 번만). 돌려주는 함수는 모은 값 목록을 준다. */
/**
 * 부품이 스크립트로 돌리는 움직임(element.animate()가 만든 Animation — 떨림·회전·깜빡임) 수. 두 화면 갱신을 기다린 뒤,
 * CSS가 만든 애니메이션(CSSTransition·CSSAnimation)은 빼고 센다.
 * 왜(PROGRESS 미해결 182 — 2026-09-26 구역 F 재현): 움직임 줄이기 규칙(src/styles/global.css)은 모든 요소에 transition-duration 0.01ms를 둔다.
 * 그래서 부품 그림의 SVG 속성이 바뀌면(예: 진동 모터 떨림 표시 곡선 `<g opacity>`) 다음 스타일 계산에서 0.01ms짜리 CSS 전환이 생긴다.
 * getAnimations()는 스스로 스타일을 계산하므로, 바뀐 뒤 화면 갱신이 한 번도 없었으면(컴퓨터가 바쁠 때) 그 전환이 running으로 목록에 잡힌다 —
 * CDP로 CPU를 4배 느리게 한 Edge에서 4번 가운데 1번 `CSSTransition opacity`(떨림 곡선 g)를 재현했고, 두 화면 갱신 뒤에는 늘 0이었다.
 * 그림의 움직임은 모두 Web Animations라 이 수가 "움직이는지"다(움직임 줄이기면 0, 아니면 켜진 부품마다 1).
 */
async function scriptedAnimationCount(target: Locator, subtree = true): Promise<number> {
  return target.evaluate(async (element, deep) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return element.getAnimations({ subtree: deep }).filter((animation) => !(animation instanceof CSSTransition) && !(animation instanceof CSSAnimation)).length;
  }, subtree);
}

async function recordAttribute(page: Page, selector: string, attribute: string): Promise<() => Promise<string[]>> {
  const key = `__zoneB_${attribute}_${Math.random().toString(36).slice(2)}`;
  await page.locator(selector).first().evaluate(
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
  return () => page.evaluate((storeKey) => [...((window as unknown as Record<string, string[]>)[storeKey] ?? [])], key);
}

async function openExample(page: Page, file: string): Promise<void> {
  const response = await page.goto(`${ESP32_PATH}?example=${encodeURIComponent(file)}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 30_000 });
}

async function run(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(board(page)).toHaveAttribute('data-board-phase', /^(run|end)$/u, { timeout: 60_000 });
}

async function runToEnd(page: Page, expected = 'ok'): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
  expect(await waitDone(page, 60_000)).toBe(expected);
}

async function stop(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).click();
  expect(await waitDone(page, 30_000)).toBe('stopped');
}

/** 브라우저 접근성 트리(Chromium CDP)가 요소에 매긴 역할·이름·설명 — 화면 낭독기가 받는 값 */
async function accessibleNode(page: Page, selector: string): Promise<{ role?: string; name?: string; description?: string }> {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('DOM.enable');
    await client.send('Accessibility.enable');
    const { root } = await client.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { node } = await client.send('DOM.describeNode', { nodeId });
    const { nodes } = await client.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false });
    const ax = nodes[0];
    return { role: ax?.role?.value as string | undefined, name: ax?.name?.value as string | undefined, description: ax?.description?.value as string | undefined };
  } finally {
    await client.detach();
  }
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('ESP32 실습실 — I2C 표시 장치(P3-04)', () => {
  test.describe.configure({ timeout: 240_000 });

  test.describe('예제 동작', () => {
    test.skip(({ isMobile }) => Boolean(isMobile), '예제 동작은 화면 크기와 상관없어 데스크톱에서 한 번만 본다(휴대폰은 아래 따로).');

    test('문자 LCD f047: 글자 칸 32개가 DOM 글자이고 Hello LCD!가 첫 줄에 보이며, 백라이트·화면 설명·배선·핀 표(오픈 드레인)가 맞다', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/u2/2-1-2-lcd-text-check.py');
      const lcd = part(page, 'lcd');
      await expect(lcd).toHaveAttribute('data-part', 'lcd-i2c');
      await expect(lcd).toHaveAttribute('role', 'img');
      await expect(lcd).toHaveAttribute('aria-label', /^문자 LCD\(16×2\)\(GPIO21·GPIO22\): 꺼짐 — /u);
      await expect(lcd.locator('[data-lcd-cell]')).toHaveCount(32);
      await expect(lcd.locator('desc[data-part-desc]')).toHaveText('문자 LCD 화면: 전원이 꺼져 있어요.');
      // 주소 글 "0x20"이 곱하기 기호(0×20)로 바뀌어 보이지 않게 합자를 끈다(Pretendard의 숫자 사이 x 대체)
      await expect(lcd.locator('.board-part__title')).toHaveText('문자 LCD 0x20');
      expect(await lcd.locator('.board-part__title').evaluate((element) => getComputedStyle(element).fontVariantLigatures)).toBe('none');
      await expect(page.locator('[data-board-wire="signal:lcd:sda"]')).toHaveAttribute('data-gpio', '21');
      await expect(page.locator('[data-board-wire="signal:lcd:scl"]')).toHaveAttribute('data-gpio', '22');
      await expect(page.locator('[data-board-practice-steps] li')).toHaveCount(3);
      await expect(page.locator('[data-board-practice-steps]')).not.toContainText('준비 중');

      await runToEnd(page);
      await expect(lcd).toHaveAttribute('data-visual-line1', 'Hello LCD!      ');
      await expect(lcd).toHaveAttribute('data-visual-line2', ' '.repeat(16));
      await expect(lcd).toHaveAttribute('data-visual-lit', 'true');
      await expect(lcd).toHaveAttribute('data-visual-display', 'true');
      await expect(lcd).toHaveAttribute('aria-label', /^문자 LCD\(16×2\)\(GPIO21·GPIO22\): 켜짐 — /u);
      // 글자는 칸마다 DOM 글자(tspan)로 — 화면 낭독기·검색·복사로도 읽힌다
      expect(await lcdRow(lcd, 0)).toBe('Hello LCD!      ');
      expect(await lcdRow(lcd, 1)).toBe(' '.repeat(16));
      await expect(lcd.locator('[data-lcd-cell="0-0"]')).toHaveText('H');
      await expect(lcd.locator('[data-lcd-cell="0-6"]')).toHaveText('L');
      await expect(lcd.locator('[data-lcd-cell="0-9"]')).toHaveText('!');
      await expect(lcd.locator('desc[data-part-desc]')).toHaveText('문자 LCD 화면: 1줄 "Hello LCD!", 2줄 비어 있음, 백라이트 켜짐.');
      // 화면 낭독기가 받는 값: 역할 그림, 이름은 부품 이름·핀·켜짐, 설명(<desc>)은 지금 화면 글자
      expect(await accessibleNode(page, '[data-board-part="lcd"]')).toEqual({
        role: 'image',
        name: expect.stringMatching(/^문자 LCD\(16×2\)\(GPIO21·GPIO22\): 켜짐 — /u),
        description: '문자 LCD 화면: 1줄 "Hello LCD!", 2줄 비어 있음, 백라이트 켜짐.',
      });
      await expect(lcd).toContainText('백라이트 켜짐 · 화면 켜짐');
      // I2C 선: 오픈 드레인 출력(풀업으로 1)
      for (const gpio of ['21', '22']) {
        const row = page.locator(`[data-board-pin="${gpio}"]`);
        await expect(row).toHaveAttribute('data-mode', 'open_drain');
        await expect(row).toContainText('출력(오픈 드레인)');
        await expect(row).toHaveAttribute('data-level', '1');
      }
      await lcd.screenshot({ path: test.info().outputPath('lcd-f047.png') });
      await board(page).screenshot({ path: test.info().outputPath('board-f047.png') });
      expect(await consoleText(page)).not.toContain('Traceback');
      expect(errors).toEqual([]);
    });

    test('f050 move_to로 Count 0→5, f052 터치 센서(키보드 Space)로 Counter 2, f051 RTC 시계가 11:00:00부터 1초마다 올라간다', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/u2/2-1-2-lcd-count.py');
      const counts = await recordAttribute(page, '[data-board-part="lcd"]', 'data-visual-line1');
      await runToEnd(page);
      const shownCounts = (await counts()).map((line) => line.trimEnd()).filter((line) => /^Count: \d$/u.test(line));
      expect([...new Set(shownCounts)]).toEqual(['Count: 0', 'Count: 1', 'Count: 2', 'Count: 3', 'Count: 4', 'Count: 5']);
      await expect(part(page, 'lcd')).toHaveAttribute('data-visual-line1', 'Count: 5        ');

      await openExample(page, 'esp32/u2/2-1-2-adv-touch-lcd-counter.py');
      const lcd = part(page, 'lcd');
      const touch = part(page, 'touch-digital');
      await run(page);
      await expect(lcd).toHaveAttribute('data-visual-line1', 'Counter: 0      ', { timeout: 20_000 });
      for (const count of [1, 2]) {
        await touch.focus();
        await page.keyboard.down('Space');
        await expect(touch).toHaveAttribute('aria-pressed', 'true');
        await expect(lcd).toHaveAttribute('data-visual-line1', `Counter: ${count}      `, { timeout: 10_000 });
        await page.keyboard.up('Space');
        await expect(page.locator('[data-board-pin="17"]')).toHaveAttribute('data-level', '0');
        // 원본의 디바운싱 sleep(0.3) + 확인 간격 0.05초가 지나야 다음 누름을 센다
        await page.waitForTimeout(600);
      }
      await expect(lcd.locator('desc[data-part-desc]')).toHaveText(/1줄 "Counter: 2"/u);
      await stop(page);
      // [정지] 뒤에는 보드 전원이 없는 모습
      await expect(lcd).toHaveAttribute('data-visual-lit', 'false');

      await openExample(page, 'esp32/u2/2-1-2-lcd-rtc-clock.py');
      const clock = await recordAttribute(page, '[data-board-part="lcd"]', 'data-visual-line1');
      await run(page);
      await expect.poll(async () => (await clock()).some((line) => line.startsWith('Time: 11:00:02')), { timeout: 30_000 }).toBe(true);
      const times = (await clock()).map((line) => line.trimEnd()).filter((line) => /^Time: \d\d:\d\d:\d\d$/u.test(line));
      expect(times.slice(0, 3)).toEqual(['Time: 11:00:00', 'Time: 11:00:01', 'Time: 11:00:02']);
      await stop(page);
      expect(await consoleText(page)).not.toContain('Traceback');
      expect(errors).toEqual([]);
    });

    test('f049 콘솔 입력으로 LCD에 이름, 라이브러리 함수: 사용자 정의 글자·깜빡이는 커서(움직임 줄이기면 멈춤)·백라이트 끄기', async ({ page }) => {
      await openExample(page, 'esp32/u2/2-1-2-lcd-keyboard-check.py');
      const lcd = part(page, 'lcd');
      await run(page);
      await expect(page.locator('[data-lab-input-form]')).toBeVisible({ timeout: 30_000 });
      await page.locator('[data-lab-input]').fill('Jimin');
      await page.keyboard.press('Enter');
      expect(await waitDone(page, 30_000)).toBe('ok');
      await expect(lcd).toHaveAttribute('data-visual-line1', 'Hello, Jimin    ');

      // 19자 줄 넘김 덮어쓰기(CODE_MAPPING f105 4-2-1의 둘째 줄 d_c:{:<5} r_c:{:<5}): 16칸을 넘친 3칸이 첫 줄 앞을 덮는다 — 원본 i2c_lcd.py 커서 규칙
      await setEditorCode(
        page,
        [
          'from machine import Pin, SoftI2C',
          'from i2c_lcd import I2cLcd',
          'lcd = I2cLcd(SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000), 0x20, 2, 16)',
          "lcd.putstr('X:1234 Y:5678')",
          'lcd.move_to(0, 1)',
          "lcd.putstr('d_c:{:<5} r_c:{:<5}'.format(1, 0))",
        ].join('\n'),
      );
      await runToEnd(page);
      expect(await lcdRow(lcd, 0)).toBe('   234 Y:5678   ');
      expect(await lcdRow(lcd, 1)).toBe('d_c:1     r_c:0 ');
      await expect(lcd.locator('desc[data-part-desc]')).toHaveText('문자 LCD 화면: 1줄 "   234 Y:5678", 2줄 "d_c:1     r_c:0", 백라이트 켜짐.');
      await lcd.screenshot({ path: test.info().outputPath('lcd-overflow-19.png') });

      const functionsCode = (extra: string[]) =>
        [
          'from machine import Pin, SoftI2C',
          'from i2c_lcd import I2cLcd',
          'lcd = I2cLcd(SoftI2C(scl=Pin(22), sda=Pin(21)), 0x20, 2, 16)',
          'happy = bytearray([0x00,0x0A,0x00,0x04,0x00,0x11,0x0E,0x00])',
          'lcd.custom_char(0, happy)',
          "lcd.putstr('Hi ')",
          'lcd.putchar(chr(0))',
          'lcd.blink_cursor_on()',
          ...extra,
        ].join('\n');

      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await setEditorCode(page, functionsCode([]));
      await runToEnd(page);
      await expect(lcd).toHaveAttribute('data-visual-line1', `Hi \u25af${' '.repeat(12)}`);
      await expect(lcd).toHaveAttribute('data-visual-cursor', '0,4');
      await expect(lcd).toHaveAttribute('data-visual-blink', 'true');
      // 웃는 얼굴 글자의 켜진 점 8개(0x0A 2개·0x04 1개·0x11 2개·0x0E 3개)를 칸 안에 그린다
      await expect(lcd.locator('[data-lcd-custom] rect')).toHaveCount(8);
      await expect(lcd.locator('desc[data-part-desc]')).toHaveText(/1줄 "Hi \u25af", 2줄 비어 있음, \u25af은 사용자 정의 글자, 커서 1줄 5칸, 백라이트 켜짐\./u);
      const block = lcd.locator('[data-lcd-cursor="block"]');
      await expect.poll(() => scriptedAnimationCount(block, false)).toBe(1);
      await lcd.screenshot({ path: test.info().outputPath('lcd-custom-blink.png') });

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setEditorCode(page, functionsCode(['lcd.backlight_off()']));
      await runToEnd(page);
      await expect(lcd).toHaveAttribute('data-visual-blink', 'true');
      await expect(lcd).toHaveAttribute('data-visual-lit', 'false');
      await expect(block).toHaveAttribute('opacity', '0.55');
      // 깜빡임은 Web Animations다. 움직임 줄이기 규칙이 모든 요소에 두는 0.01ms CSS 전환(방금 바뀐 opacity)은 세지 않는다(scriptedAnimationCount 머리말).
      expect(await scriptedAnimationCount(block, false)).toBe(0);
      await expect(lcd.locator('desc[data-part-desc]')).toHaveText(/백라이트 꺼짐\.$/u);
      await expect(lcd).toContainText('백라이트 꺼짐 · 화면 켜짐');
    });

    test('OLED: f054 두 줄 글자·f057 점 729개·f056 콘솔 입력, 원고 이름 sh1106으로 반전까지 화면 설명에 나온다', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/u2/2-1-3-oled-text-check.py');
      const oled = part(page, 'oled');
      await expect(oled).toHaveAttribute('data-part', 'oled-i2c');
      await expect(oled).toHaveAttribute('aria-label', /^OLED\(128×64\)\(GPIO21·GPIO22\): 꺼짐 — /u);
      await expect(page.locator('[data-board-wire="signal:oled:sda"]')).toHaveAttribute('data-gpio', '21');
      await runToEnd(page);
      await expect(oled).toHaveAttribute('data-visual-lit', 'true');
      await expect(oled).toHaveAttribute('data-visual-brightness', '100');
      await expect(oled).toHaveAttribute('data-visual-text', 'Hello, ESP32! | OLED Display!');
      await expect(oled).toHaveAttribute('data-visual-pixels', '305');
      await expect(oled).toHaveAttribute('aria-label', /^OLED\(128×64\)\(GPIO21·GPIO22\): 켜짐 — /u);
      await expect(oled.locator('path[data-oled-pixels]')).toHaveAttribute('d', /^M\d/u);
      await expect(oled.locator('desc[data-part-desc]')).toHaveText('OLED 화면: 글자 "Hello, ESP32!", "OLED Display!", 켜진 점 305개.');
      expect((await accessibleNode(page, '[data-board-part="oled"]')).description).toBe('OLED 화면: 글자 "Hello, ESP32!", "OLED Display!", 켜진 점 305개.');
      await oled.screenshot({ path: test.info().outputPath('oled-f054.png') });

      await openExample(page, 'esp32/u2/2-1-3-oled-triangle-dots.py');
      await runToEnd(page);
      await expect(part(page, 'oled')).toHaveAttribute('data-visual-pixels', '729');
      await expect(part(page, 'oled').locator('desc[data-part-desc]')).toHaveText('OLED 화면: 글자 없음, 켜진 점 729개.');
      await part(page, 'oled').screenshot({ path: test.info().outputPath('oled-f057.png') });

      await openExample(page, 'esp32/u2/2-1-3-oled-keyboard-check.py');
      await run(page);
      await expect(page.locator('[data-lab-input-form]')).toBeVisible({ timeout: 30_000 });
      await page.locator('[data-lab-input]').fill('Minho');
      await page.keyboard.press('Enter');
      expect(await waitDone(page, 30_000)).toBe('ok');
      await expect(part(page, 'oled')).toHaveAttribute('data-visual-text', 'Hello, | Minho');

      await setEditorCode(
        page,
        [
          'from machine import Pin',
          'from machine import SoftI2C',
          'from sh1106 import SH1106_I2C',
          'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
          'oled = SH1106_I2C(128, 64, i2c)',
          'oled.fill(0)',
          'oled.text("SH1106", 0, 0)',
          'oled.invert(1)',
          'oled.contrast(64)',
          'oled.show()',
        ].join('\n'),
      );
      await runToEnd(page);
      await expect(part(page, 'oled')).toHaveAttribute('data-visual-text', 'SH1106');
      await expect(part(page, 'oled')).toHaveAttribute('data-visual-brightness', '25');
      await expect(part(page, 'oled')).toHaveAttribute('aria-label', /: 켜짐\(밝기 25%\) — /u);
      await expect(part(page, 'oled').locator('desc[data-part-desc]')).toHaveText(/글자 "SH1106", 켜진 점 \d+개, 색 반전\./u);
      expect(await consoleText(page)).not.toContain('Traceback');
      expect(errors).toEqual([]);
    });

    test('실물과 같은 오류: 주소가 다르면 OSError: [Errno 19] ENODEV와 한국어 안내, SDA·SCL을 바꿔 적거나 배선도에 없는 OLED도 까닭을 알린다', async ({ page }) => {
      await openExample(page, 'esp32/u2/2-1-2-lcd-text-check.py');
      await setEditorCode(
        page,
        ['from machine import Pin, SoftI2C', 'from i2c_lcd import I2cLcd', 'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))', 'print(i2c.scan())', 'lcd = I2cLcd(i2c, 0x27, 2, 16)'].join('\n'),
      );
      await runToEnd(page, 'error');
      await expect(consoleBox(page)).toContainText('[32]');
      await expect(consoleBox(page)).toContainText('OSError: [Errno 19] ENODEV');
      await expect(consoleBox(page)).toContainText('I2C 주소 0x27(39)에 대답하는 장치가 없어요');
      await expect(consoleBox(page)).toContainText('문자 LCD(16×2)(주소 0x20)');
      await page.locator('[data-lab-console]').screenshot({ path: test.info().outputPath('console-enodev.png') });

      await setEditorCode(page, ['from machine import Pin, SoftI2C', "SoftI2C(scl=Pin(21), sda=Pin(22)).writeto(0x20, b'\\x00')"].join('\n'));
      await runToEnd(page, 'error');
      await expect(consoleBox(page)).toContainText('OSError: [Errno 19] ENODEV');
      await expect(consoleBox(page)).toContainText('SCL=GPIO21·SDA=GPIO22');

      await setEditorCode(page, ['from machine import Pin, SoftI2C', 'from ssd1306 import SSD1306_I2C', 'oled = SSD1306_I2C(128, 64, SoftI2C(scl=Pin(22), sda=Pin(21)))'].join('\n'));
      await runToEnd(page, 'error');
      await expect(consoleBox(page)).toContainText('OSError: [Errno 19] ENODEV');
      await expect(consoleBox(page)).toContainText('I2C 주소 0x3C(60)에 대답하는 장치가 없어요');
    });
  });

  test('휴대폰 375px: LCD 글자와 OLED가 보이고, [그림 크게 보기]에서도 페이지가 가로로 넘치지 않는다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '좁은 화면은 휴대폰 프로젝트에서 본다.');
    await openExample(page, 'esp32/u2/2-1-2-lcd-text-check.py');
    await runToEnd(page);
    const lcd = part(page, 'lcd');
    await lcd.scrollIntoViewIfNeeded();
    await expect(lcd).toBeVisible();
    await expect(lcd.locator('[data-lcd-cell="0-0"]')).toHaveText('H');
    const box = await lcd.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('mobile-lcd.png') });
    const zoom = page.locator('[data-board-zoom]');
    if (await zoom.isVisible()) {
      await zoom.click();
      await expect(page.locator('[data-board-stage]')).toHaveAttribute('data-board-zoom-level', 'large');
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await zoom.click();
    }

    await openExample(page, 'esp32/u2/2-1-3-oled-text-check.py');
    await runToEnd(page);
    const oled = part(page, 'oled');
    await oled.scrollIntoViewIfNeeded();
    await expect(oled).toBeVisible();
    await expect(oled).toHaveAttribute('data-visual-text', 'Hello, ESP32! | OLED Display!');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('mobile-oled.png') });
  });
});
