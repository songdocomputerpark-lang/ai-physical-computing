// ESP32 실습실 — 구역 C(PLAN §8.3 P3-05 네오픽셀·UART·MP3·보드 콘솔 입력) 브라우저 테스트. 부품은 src/lab/modules/board/parts/{neopixel,uart,mp3}/,
// 콘솔 입력은 src/lab/modules/board-console/, 팬 라이브러리는 examples/esp32/lib/third-party/gorillacell_dcmotors.py.
// 원본 예제 파일을 그대로(?example=) 열어 본다.
//  1. 네오픽셀: f064는 write()를 불러야 링이 바뀐다(첫 write에서 15개가 한꺼번에), f065 무지개 색이 GRB로 보냈다 풀어도 (255, 94, 0) 그대로,
//     [정지]하면 꺼진 모습.
//  2. MP3: f070 곡 재생 → 곡 끝(sleep(5) 도중 약 3.6초에 멈춤 — 미해결 177) → 코드 끝(ok), f071 볼륨 10, f072 터치 패드(키보드로 누르고 있기)로 다음 곡·정지.
//  3. UART(f001·f007): 시리얼 창에 보드가 보낸 hello world, 글자·바이트 값 보내기로 RGB LED 색, 16진수 보기, 속도 다름 안내, 실행 전 보내기 안내,
//     키보드만으로 보내기(Tab 순서).
//  4. 보드 콘솔 input()(f076·f077)과 팬 라이브러리 PWM판(f075 속도 30·70).
//  5. 휴대폰(375px): 시리얼 창·링·MP3가 가로로 넘치지 않는다.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, waitDone } from './helpers/lab.ts';

const ESP32_PATH = withBase('labs/esp32/');
const OFF = '000000';

function board(page: Page): Locator {
  return page.locator('[data-board-io]');
}

function part(page: Page, id: string): Locator {
  return page.locator(`[data-board-part="${id}"]`);
}

function consoleBox(page: Page): Locator {
  return page.locator('[data-lab-console]');
}

function serialWindow(page: Page): Locator {
  return page.locator('[data-board-part-controls="uart"]');
}

function pinRow(page: Page, gpio: number): Locator {
  return page.locator(`[data-board-pin="${gpio}"]`);
}

async function openExample(page: Page, file: string): Promise<void> {
  const response = await page.goto(`${ESP32_PATH}?example=${encodeURIComponent(file)}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 30_000 });
}

async function run(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(board(page)).toHaveAttribute('data-board-phase', /^(run|idle|end)$/u, { timeout: 60_000 });
}

async function stop(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).click();
  expect(await waitDone(page, 30_000)).toBe('stopped');
}

/** 요소 속성 값이 바뀌는 차례를 페이지 안에서 빠짐없이 모은다(같은 값이 이어지면 한 번만) */
async function recordAttribute(page: Page, selector: string, attribute: string): Promise<() => Promise<string[]>> {
  const key = `__zoneC_${attribute}_${Math.random().toString(36).slice(2)}`;
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

/** RGB LED 세 핀(23·25·26)의 값이 [r, g, b]가 될 때까지 */
async function expectRgb(page: Page, levels: [number, number, number]): Promise<void> {
  const [r, g, b] = levels;
  await expect(pinRow(page, 23)).toHaveAttribute('data-level', String(r), { timeout: 10_000 });
  await expect(pinRow(page, 25)).toHaveAttribute('data-level', String(g), { timeout: 10_000 });
  await expect(pinRow(page, 26)).toHaveAttribute('data-level', String(b), { timeout: 10_000 });
}

/** 입력 부품 단추를 키보드(Space)로 누르고 있다가 뗀다 */
async function holdWithKeyboard(page: Page, button: Locator, ms: number): Promise<void> {
  await button.focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(ms);
  await page.keyboard.up('Space');
}

/** 부품 그림 안의 글이 모듈 판(첫 rect) 안에 들어가고 SD 카드 그림과 겹치지 않는지 — 휴대폰 글꼴에서 글이 그림에 겹쳐 보였던 것(2026-09-18) */
async function mp3TextFits(mp3: Locator): Promise<{ inside: boolean; overlapsCard: boolean }> {
  return mp3.evaluate((element) => {
    const content = element.querySelector('.board-part__content');
    const moduleRect = content?.querySelector('rect')?.getBoundingClientRect();
    const card = [...(content?.querySelectorAll('rect') ?? [])][3]?.getBoundingClientRect();
    const texts = [...(content?.querySelectorAll('text') ?? [])].filter((text) => (text.textContent ?? '') !== '' && text.textContent !== 'SD').map((text) => text.getBoundingClientRect());
    if (!moduleRect || !card) {
      return { inside: false, overlapsCard: true };
    }
    const inside = texts.every((box) => box.right <= moduleRect.right + 0.5 && box.left >= moduleRect.left - 0.5);
    const overlapsCard = texts.some((box) => box.left < card.right && box.right > card.left && box.top < card.bottom && box.bottom > card.top);
    return { inside, overlapsCard };
  });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('ESP32 실습실 — 네오픽셀·UART·MP3·보드 콘솔(P3-05)', () => {
  test.describe.configure({ timeout: 240_000 });

  test.describe('예제 동작', () => {
    test.skip(({ isMobile }) => Boolean(isMobile), '예제 동작은 화면 크기와 상관없어 데스크톱에서 한 번만 본다(휴대폰은 아래 따로).');

    test('네오픽셀 f064: write()를 불러야 링이 바뀌고(첫 write에서 15개가 한꺼번에) f065 무지개 색이 GRB를 거쳐도 그대로, [정지]하면 꺼진다', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/u2/2-1-5-neopixel-check.py');
      const ring = part(page, 'neopixel');
      await expect(ring).toHaveAttribute('data-part', 'neopixel');
      await expect(ring).toHaveAttribute('role', 'img');
      await expect(ring.locator('[data-neopixel-led]')).toHaveCount(16);
      // 링 밖(밝은 브레드보드 위)의 핀 글은 짙은 색이어야 읽힌다
      await expect(ring.locator('.board-part__label')).toHaveText('DIN IO23');
      expect(await ring.locator('.board-part__label').evaluate((element) => getComputedStyle(element).fill)).toBe('rgb(31, 41, 51)');
      await expect(page.locator('[data-board-wire="signal:neopixel:din"]')).toHaveAttribute('data-gpio', '23');
      await expect(page.locator('[data-board-practice-steps] li')).toHaveCount(3);
      await expect(page.locator('[data-board-practice-steps]')).not.toContainText('준비 중');
      await expect(ring).toHaveAttribute('data-visual-count', '0');

      await run(page);
      const counts = await recordAttribute(page, '[data-board-part="neopixel"]', 'data-visual-count');
      // 첫 반복문(1.6초)은 write()가 없어 링이 그대로다
      await page.waitForTimeout(1000);
      await expect(ring).toHaveAttribute('data-visual-writes', '0');
      await expect(ring).toHaveAttribute('data-visual-lit', 'false');
      // 둘째 반복문의 첫 write()에서 빨강 15개(원고의 (100, 0, 0)), 그 뒤 하나씩 꺼진다
      await expect.poll(async () => (await counts()).filter((value) => value !== '0'), { timeout: 10_000 }).toEqual(expect.arrayContaining(['15', '14']));
      const seen = (await counts()).filter((value) => value !== '0');
      expect(seen[0], `켜진 LED 수 차례: ${seen.join(',')}`).toBe('15');
      await expect(ring.locator('[data-neopixel-led="0"] title')).toHaveText('0번 LED: (100, 0, 0)');
      await ring.screenshot({ path: test.info().outputPath('neopixel-f064.png') });
      await stop(page);
      await expect(ring).toHaveAttribute('data-visual-lit', 'false');
      await expect(ring).toHaveAttribute('data-visual-colors', OFF.repeat(16));

      await openExample(page, 'esp32/u2/2-1-5-neopixel-rainbow.py');
      await run(page);
      const colors = await recordAttribute(page, '[data-board-part="neopixel"]', 'data-visual-colors');
      // 빨강으로 16칸이 차고, 15번부터 주황 (255, 94, 0) — 링 흉내가 GRB로 받은 바이트를 RGB로 되돌린다
      await expect.poll(async () => (await colors()).includes('ff0000'.repeat(16)), { timeout: 15_000 }).toBe(true);
      await expect.poll(async () => (await colors()).some((value) => value.endsWith('ff5e00')), { timeout: 10_000 }).toBe(true);
      await expect(ring.locator('[data-neopixel-led="15"] title')).toHaveText('15번 LED: (255, 94, 0)');
      await expect(ring).toContainText(/켜진 LED \d+개/u);
      await expect(ring).toHaveAttribute('aria-label', /^네오픽셀 링\(GPIO23\): 켜짐 — /u);
      await ring.screenshot({ path: test.info().outputPath('neopixel-f065.png') });
      await stop(page);
      await expect(ring).toHaveAttribute('data-visual-count', '0');
      expect(await consoleBox(page).textContent()).not.toContain('Traceback');
      expect(errors).toEqual([]);
    });

    test('MP3 f070: 1번 곡을 재생하고 곡이 끝나면 멈춤, 코드가 끝난다 · f071 볼륨 10 · 소리 단추가 보인다', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/u2/2-2-2-mp3-check.py');
      const mp3 = part(page, 'mp3');
      await expect(mp3).toHaveAttribute('data-part', 'mp3');
      await expect(page.locator('[data-board-wire="signal:mp3:rx"]')).toHaveAttribute('data-gpio', '17');
      await expect(page.locator('[data-board-wire="signal:mp3:tx"]')).toHaveAttribute('data-gpio', '16');
      await expect(page.locator('[data-board-sound]')).toBeVisible();
      await expect(mp3).toContainText('명령을 기다려요');

      const statuses = await recordAttribute(page, '[data-board-part="mp3"]', 'data-visual-status');
      // 모습이 바뀐 순간의 시각과 실습실 상태도 함께 적는다: 곡 끝(약 3.6초)의 "멈춤"이 sleep(5)가 끝나기 전(코드가 도는 중)에 와야 한다
      // (미해결 177 — 전에는 sleep이 끝난 5초 뒤에야 멈췄다)
      const statusKey = `__zoneF_mp3_${Math.random().toString(36).slice(2)}`;
      await page.locator('[data-board-part="mp3"]').evaluate((element, storeKey) => {
        const values: { status: string; state: string; at: number }[] = [];
        (window as unknown as Record<string, unknown>)[storeKey] = values;
        const root = document.querySelector<HTMLElement>('[data-lab]');
        new MutationObserver(() => {
          const status = String(element.getAttribute('data-visual-status'));
          if (values[values.length - 1]?.status !== status) {
            values.push({ status, state: root?.dataset.state ?? '', at: performance.now() });
          }
        }).observe(element, { attributes: true, attributeFilter: ['data-visual-status'] });
      }, statusKey);
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect(mp3).toHaveAttribute('data-visual-status', 'playing', { timeout: 60_000 });
      await expect(mp3).toHaveAttribute('data-visual-track', '1');
      await expect(mp3).toContainText('1번 곡 재생 중');
      // 소리를 들을 수는 없으니 예약한 음 수를 본다(Web Audio가 되는 브라우저 — 1번 곡은 쉼을 뺀 9음)
      await expect(mp3.locator('[data-mp3-notes]')).toHaveAttribute('data-mp3-notes', '9');
      expect(await mp3TextFits(mp3)).toEqual({ inside: true, overlapsCard: false });
      await mp3.screenshot({ path: test.info().outputPath('mp3-f070-playing.png') });
      expect(await waitDone(page, 30_000)).toBe('ok');
      await expect(mp3).toHaveAttribute('data-visual-status', 'stopped');
      expect(await statuses()).toEqual(expect.arrayContaining(['playing', 'stopped']));
      const changes = await page.evaluate(
        (storeKey) => [...(((window as unknown as Record<string, unknown>)[storeKey] as { status: string; state: string; at: number }[] | undefined) ?? [])],
        statusKey,
      );
      const playing = changes.findIndex((change) => change.status === 'playing');
      const stopped = changes.find((change, index) => index > playing && change.status === 'stopped');
      expect(playing, JSON.stringify(changes)).toBeGreaterThanOrEqual(0);
      expect(stopped?.state, '곡이 끝나 멈춘 모습이 코드가 끝나기 전에 와야 해요').toBe('running');
      // 1번 곡 3.6초 — sleep(5)가 끝나는 5초보다 먼저(느린 컴퓨터의 타이머 늦음을 1초까지 봐준다)
      expect((stopped?.at ?? Infinity) - (changes[playing]?.at ?? 0)).toBeLessThan(4_600);
      await expect(mp3).toHaveAttribute('data-visual-commands', '2');
      expect(await consoleBox(page).textContent()).not.toContain('Traceback');

      await openExample(page, 'esp32/u2/2-2-2-mp3-announcement.py');
      await run(page);
      await expect(mp3).toHaveAttribute('data-visual-volume', '10', { timeout: 10_000 });
      await expect(mp3).toHaveAttribute('data-visual-status', 'playing', { timeout: 10_000 });
      await expect(consoleBox(page)).toContainText('안내 방송 출력');
      await expect(mp3).toContainText('볼륨 10/30');
      await stop(page);
      await expect(mp3).toHaveAttribute('data-visual-status', 'stopped');
      await expect(mp3.locator('[data-mp3-notes]')).toHaveAttribute('data-mp3-notes', '0');
      expect(errors).toEqual([]);
    });

    test('MP3 f072 + 네오픽셀 f066: 4채널 터치 패드를 키보드로 누르고 있으면 다음 곡·정지, 무드등 색이 바뀐다', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/u2/2-2-2-adv-touch4-mp3-player.py');
      const mp3 = part(page, 'mp3');
      await run(page);
      await expect(consoleBox(page)).toContainText('ADC 값:', { timeout: 30_000 });
      await holdWithKeyboard(page, page.locator('[data-touch4-pad="1"]'), 400);
      await expect(mp3).toHaveAttribute('data-visual-status', 'playing', { timeout: 10_000 });
      await expect(mp3).toHaveAttribute('data-visual-track', '2');
      await expect(consoleBox(page)).toContainText('▶ 다음 곡: 2');
      await page.waitForTimeout(700);
      await holdWithKeyboard(page, page.locator('[data-touch4-pad="1"]'), 400);
      await expect(mp3).toHaveAttribute('data-visual-track', '3', { timeout: 10_000 });
      await page.waitForTimeout(700);
      await holdWithKeyboard(page, page.locator('[data-touch4-pad="2"]'), 400);
      await expect(mp3).toHaveAttribute('data-visual-status', 'stopped', { timeout: 10_000 });
      await expect(consoleBox(page)).toContainText('⏹ 정지');
      await stop(page);

      await openExample(page, 'esp32/u2/2-1-5-adv-touch4-mood-light.py');
      const ring = part(page, 'neopixel');
      await run(page);
      await page.waitForTimeout(500);
      await holdWithKeyboard(page, page.locator('[data-touch4-pad="2"]'), 500);
      await expect(ring).toHaveAttribute('data-visual-colors', '00ff00'.repeat(16), { timeout: 10_000 });
      await expect(consoleBox(page)).toContainText('→ Button 2');
      await page.waitForTimeout(400);
      await holdWithKeyboard(page, page.locator('[data-touch4-pad="4"]'), 500);
      await expect(ring).toHaveAttribute('data-visual-lit', 'false', { timeout: 10_000 });
      await expect(ring).toHaveAttribute('data-visual-writes', '2');
      await stop(page);
      expect(await consoleBox(page).textContent()).not.toContain('Traceback');
      expect(errors).toEqual([]);
    });

    test('UART f001: 시리얼 창에 hello world, 글자 1~4로 RGB LED 색, 바이트 값·16진수 보기·속도 다름·실행 전 안내', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/hw/uart2-rgb-text.py');
      const converter = part(page, 'uart');
      const serial = serialWindow(page);
      await expect(converter).toHaveAttribute('data-part', 'uart');
      await expect(page.locator('[data-board-wire="signal:uart:rx"]')).toHaveAttribute('data-gpio', '17');
      await expect(page.locator('[data-board-wire="signal:uart:tx"]')).toHaveAttribute('data-gpio', '16');
      await expect(page.locator('[data-board-controls]')).toBeVisible();
      await expect(serial.getByRole('heading', { name: 'USB-UART 변환기 조작' })).toBeVisible();
      await expect(serial.locator('[data-uart-status]')).toContainText('[실행]하면 보드와 이어져요');
      await expect(serial.locator('[data-uart-wiring]')).toContainText('변환기 TX → GPIO16(보드 RX), 변환기 RX → GPIO17(보드 TX)');
      // 0x33 같은 16진수가 0×33으로 그려지지 않게(Pretendard 문맥 대체) 시리얼 창은 합자를 끈다
      expect(await serial.evaluate((element) => getComputedStyle(element).fontVariantLigatures)).toBe('none');
      const input = serial.getByLabel('보낼 글자');
      const received = serial.getByLabel('보드가 보낸 글자');
      // 실행 전: [보내기]는 aria-disabled(초점은 받음)이고, 보내려 하면 까닭을 알린다
      await expect(serial.getByRole('button', { name: '보내기' })).toHaveAttribute('aria-disabled', 'true');
      await input.fill('1');
      await input.press('Enter');
      await expect(serial.locator('[data-uart-send-error]')).toHaveText('먼저 [실행]을 눌러요. 보드가 코드를 돌리는 동안 보낸 것만 보드가 받아요.');
      await expect(input).toHaveAttribute('aria-invalid', 'true');

      await run(page);
      await expect(received).toHaveValue('hello world', { timeout: 30_000 });
      await expect(serial.locator('[data-uart-status]')).toHaveText('보드 UART와 이어졌어요(9600bps).');
      await expect(converter).toHaveAttribute('data-visual-connected', 'true');
      await expect(converter).toHaveAttribute('data-visual-rx', '11');
      await expect(serial.locator('[data-uart-send-error]')).toBeHidden();

      // 글자 '2'(바이트 50) → 빨강
      await input.fill('2');
      await input.press('Enter');
      await expectRgb(page, [1, 0, 0]);
      await expect(consoleBox(page)).toContainText('50');
      await expect(input).toHaveValue('');
      await expect(converter).toHaveAttribute('data-visual-tx', '1');
      await expect(converter).toHaveAttribute('data-visual-reached', '1');
      await expect(serial.locator('[data-uart-counts]')).toHaveText('보낸 바이트 1개 · 받은 바이트 11개');
      await board(page).screenshot({ path: test.info().outputPath('uart-f001-red.png') });

      // 바이트 값 4는 글자 '4'(52)가 아니라서 색이 그대로
      await serial.locator('[data-uart-mode]').selectOption('bytes');
      await expect(serial.getByLabel('보낼 바이트 값(쉼표로 나눠요)')).toBeVisible();
      await serial.getByLabel('보낼 바이트 값(쉼표로 나눠요)').fill('4');
      await serial.getByLabel('보낼 바이트 값(쉼표로 나눠요)').press('Enter');
      await expect(converter).toHaveAttribute('data-visual-tx', '2');
      await expect(consoleBox(page)).toContainText(/\b4\b/u);
      await expectRgb(page, [1, 0, 0]);
      // 틀린 바이트 값은 보내지 않고 알린다
      await serial.getByLabel('보낼 바이트 값(쉼표로 나눠요)').fill('300');
      await serial.getByLabel('보낼 바이트 값(쉼표로 나눠요)').press('Enter');
      await expect(serial.locator('[data-uart-send-error]')).toContainText('"300"은(는) 바이트 값이 아니에요');
      await expect(converter).toHaveAttribute('data-visual-tx', '2');

      // 글자 '4' → 파랑
      await serial.locator('[data-uart-mode]').selectOption('text');
      await input.fill('4');
      await input.press('Enter');
      await expectRgb(page, [0, 0, 1]);

      // 16진수 보기
      await serial.getByRole('button', { name: '16진수로 보기' }).click();
      await expect(serial.getByRole('button', { name: '16진수로 보기' })).toHaveAttribute('aria-pressed', 'true');
      await expect(received).toHaveValue('68 65 6C 6C 6F 20 77 6F 72 6C 64');

      // 속도를 115200으로 바꾸면 보드 UART(9600)와 달라 안내한다
      await serial.locator('[data-uart-baud]').selectOption('115200');
      await expect(serial.locator('[data-uart-status]')).toContainText('주의: 속도가 달라요. 보드 UART는 9600bps, 이 창은 115200bps');
      await expect(converter).toHaveAttribute('data-visual-mismatch', 'true');
      await expect(converter).toContainText('속도 다름');
      await serial.locator('[data-uart-baud]').selectOption('auto');
      await expect(converter).toHaveAttribute('data-visual-mismatch', 'false');

      await stop(page);
      await expect(converter).toHaveAttribute('data-visual-phase', 'stopped');
      await expect(serial.locator('[data-uart-status]')).toContainText('[실행]하면 보드와 이어져요');
      // [정지] 뒤에도 받은 글자는 남는다(실물 시리얼 프로그램처럼)
      await expect(received).toHaveValue('68 65 6C 6C 6F 20 77 6F 72 6C 64');
      expect(await consoleBox(page).textContent()).not.toContain('Traceback');
      expect(errors).toEqual([]);
    });

    test('UART f007: 키보드만으로 바이트 값을 보내 RGB LED 색을 바꾸고, 새 실행이면 받은 글자를 비운다', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/hw/uart2-rgb-bytes.py');
      const serial = serialWindow(page);
      await run(page);
      await expect(serial.getByLabel('보드가 보낸 글자')).toHaveValue('hello world', { timeout: 30_000 });
      // 보내는 모양을 키보드로 고른다
      await serial.locator('[data-uart-mode]').focus();
      await serial.locator('[data-uart-mode]').selectOption('bytes');
      const input = serial.locator('[data-uart-send-input]');
      await input.focus();
      await page.keyboard.type('3');
      await page.keyboard.press('Enter');
      await expectRgb(page, [0, 1, 0]);
      await expect(input).toBeFocused();
      // Tab 순서: 보낼 칸 → [보내기] → 보내는 모양
      await page.keyboard.press('Tab');
      await expect(serial.locator('[data-uart-send]')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(serial.locator('[data-uart-mode]')).toBeFocused();
      await input.focus();
      await page.keyboard.type('0x01');
      await page.keyboard.press('Enter');
      // 16진수로 적은 바이트 값 1 → 흰색
      await expectRgb(page, [1, 1, 1]);
      await stop(page);

      // 새 실행: 지난 실행의 글자를 비우고 새로 받은 것만
      await run(page);
      await expect(serial.getByLabel('보드가 보낸 글자')).toHaveValue('hello world', { timeout: 30_000 });
      await expect(serial.locator('[data-uart-counts]')).toHaveText('보낸 바이트 0개 · 받은 바이트 11개');
      await stop(page);
      expect(errors).toEqual([]);
    });

    test('보드 콘솔 input() f076·f077: 입력줄에 적은 값으로 팬 라이브러리(PWM판)가 돌고, q면 끝난다 · f075 속도 30·70', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/u2/2-2-3-fan-keyboard.py');
      // 실습실 틀이 공개 lab.prompt를 주면 live(기다리는 동안 보드가 돎), 아니면 fallback(러너 공통 input)
      await expect(labRoot(page)).toHaveAttribute('data-board-console', /^(live|fallback)$/u);
      const fan = part(page, 'fan-motor');
      await run(page);
      const form = page.locator('[data-lab-input-form]');
      const field = page.locator('[data-lab-input]');
      await expect(form).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-lab-input-label]')).toHaveText('입력(1/0/q):');
      await field.fill('1');
      await field.press('Enter');
      await expect(fan).toHaveAttribute('data-visual-direction', 'cw', { timeout: 10_000 });
      await expect(fan).toHaveAttribute('data-visual-speed', '100');
      await expect(consoleBox(page)).toContainText('[Fan] on (CW, speed = 100)');
      await expect(pinRow(page, 25)).toHaveAttribute('data-mode', 'pwm');
      await expect(form).toBeVisible();
      await field.fill('0');
      await field.press('Enter');
      await expect(fan).toHaveAttribute('data-visual-direction', 'stop', { timeout: 10_000 });
      await field.fill('x');
      await field.press('Enter');
      await expect(consoleBox(page)).toContainText('잘못된 입력입니다. 1/0/q 중에서 입력하세요.');
      await field.fill('q');
      await field.press('Enter');
      expect(await waitDone(page, 30_000)).toBe('ok');
      await expect(consoleBox(page)).toContainText('프로그램을 종료합니다.');

      await openExample(page, 'esp32/u2/2-2-3-fan-keyboard-speed.py');
      await run(page);
      await expect(form).toBeVisible({ timeout: 30_000 });
      await field.fill('2');
      await field.press('Enter');
      await expect(fan).toHaveAttribute('data-visual-speed', '70', { timeout: 10_000 });
      await expect(consoleBox(page)).toContainText('[Fan] 중풍 (speed=70)');
      await stop(page);
      await expect(form).toBeHidden();

      await openExample(page, 'esp32/u2/2-2-3-fan-speed.py');
      await run(page);
      const speeds = await recordAttribute(page, '[data-board-part="fan-motor"]', 'data-visual-speed');
      await expect.poll(async () => await speeds(), { timeout: 15_000 }).toEqual(expect.arrayContaining(['30', '70']));
      await fan.screenshot({ path: test.info().outputPath('fan-f075.png') });
      await stop(page);
      expect(await consoleBox(page).textContent()).not.toContain('Traceback');
      expect(errors).toEqual([]);
    });
  });

  test.describe('콘솔 입력을 쓰는 다른 구역 예제', () => {
    test.skip(({ isMobile }) => Boolean(isMobile), '데스크톱에서 한 번만 본다.');

    test('f049(LCD)·f056(OLED)·f081(서보)이 콘솔 입력으로 돌고, f074 원본 파일은 원고 줄 번호 때문에 SyntaxError', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const form = page.locator('[data-lab-input-form]');
      const field = page.locator('[data-lab-input]');

      for (const [file, partId, line] of [
        ['esp32/u2/2-1-2-lcd-keyboard-check.py', 'lcd', 'data-visual-line1'],
        ['esp32/u2/2-1-3-oled-keyboard-check.py', 'oled', null],
      ] as const) {
        await openExample(page, file);
        await run(page);
        await expect(form).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('[data-lab-input-label]')).toHaveText('name:');
        await field.fill('Mina');
        await field.press('Enter');
        expect(await waitDone(page, 30_000), file).toBe('ok');
        if (line) {
          await expect(part(page, partId)).toHaveAttribute(line, /^Hello, Mina/u);
        }
        expect(await consoleBox(page).textContent(), file).not.toContain('Traceback');
      }

      await openExample(page, 'esp32/u2/2-2-4-servo-keyboard.py');
      await run(page);
      await expect(form).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-lab-input-label]')).toHaveText('서보 제어 (1: 180도, 2: 0도):');
      await field.fill('1');
      await field.press('Enter');
      await expect(consoleBox(page)).toContainText('서보모터가 180도로 이동했습니다.', { timeout: 10_000 });
      await expect(form).toBeVisible();
      await field.fill('3');
      await field.press('Enter');
      await expect(consoleBox(page)).toContainText('잘못된 입력입니다. 1 또는 2를 입력하세요.');
      await stop(page);

      await openExample(page, 'esp32/u2/2-2-3-fan-library.py');
      await page.getByRole('button', { name: '실행', exact: true }).click();
      expect(await waitDone(page, 60_000)).toBe('error');
      await expect(consoleBox(page)).toContainText('SyntaxError');
      expect(errors).toEqual([]);
    });
  });

  test.describe('휴대폰 화면', () => {
    test.skip(({ isMobile }) => !isMobile, '휴대폰(375px) 배치만 본다.');

    test('시리얼 창·네오픽셀 링·MP3 모듈이 375px에서 가로로 넘치지 않고, 손가락으로 보내기가 된다', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await openExample(page, 'esp32/hw/uart2-rgb-text.py');
      const serial = serialWindow(page);
      await expect(serial).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      const box = await serial.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375 + 1);
      // 누르는 자리 44px 이상(보내기 단추·입력칸)
      expect((await serial.locator('[data-uart-send]').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
      expect((await serial.locator('[data-uart-send-input]').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
      await run(page);
      await expect(serial.getByLabel('보드가 보낸 글자')).toHaveValue('hello world', { timeout: 30_000 });
      await serial.getByLabel('보낼 글자').tap();
      await serial.getByLabel('보낼 글자').fill('3');
      await serial.locator('[data-uart-send]').tap();
      await expectRgb(page, [0, 1, 0]);
      await serial.screenshot({ path: test.info().outputPath('uart-mobile.png') });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      await stop(page);

      await openExample(page, 'esp32/u2/2-1-5-adv-touch4-mood-light.py');
      await expect(part(page, 'neopixel')).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      await openExample(page, 'esp32/u2/2-2-2-mp3-check.py');
      await expect(part(page, 'mp3')).toBeVisible();
      expect(await mp3TextFits(part(page, 'mp3'))).toEqual({ inside: true, overlapsCard: false });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      await board(page).screenshot({ path: test.info().outputPath('mp3-mobile.png') });
      expect(errors).toEqual([]);
    });
  });
});
