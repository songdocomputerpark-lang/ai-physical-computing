// ESP32 실습실 — 구역 A(PLAN §8.3 P3-03 PWM·ADC 부품) 브라우저 테스트. 규약은 src/lab/README.md 7.5·7.9, 부품은 src/lab/modules/board/parts/.
// 완료 기준 "f058~f063, f067~f069, f073, f078~f081이 돈다"를 원본 예제 파일 그대로(?example=) 열어 부품 모습(data-visual-*)·콘솔·키보드 조작으로 본다.
//  1. RGB LED(f060 PWM 밝기·f061 차례로 켜기)와 레이저(f063): 밝기 %·색 이름·빛줄기, 핀 표 "PWM 출력", [정지] 뒤 꺼짐.
//  2. 버저(f068 음계·f067 켜기 끄기·f069 터치로 울리기): Hz 차례, Web Audio 발진기 상태(data-buzzer-audio), [소리 켜짐/꺼짐] 단추.
//  3. 4채널 터치(f059): 조작 칸 단추(키보드 Space·Enter, 마우스)·그림 속 패드·값 막대(키보드 End·Home) → ADC 값과 원본 판정 줄.
//  4. 팬 모터(f073): 정회전 → 역회전 → 멈춤, 돌 때 애니메이션, 움직임 줄이기면 돌지 않음.
//  5. 서보(f078·f081·f080): 복원한 servo_library로 0° → 약 89° → 180°, 펄스 폭 글, 콘솔 입력으로 각도 바꾸기, 두 서보.
//  6. 실물과 같은 오류 문구(범위 밖 duty·ADC 핀)와 repr.
//  7. 휴대폰(375px): 패드 단추를 손가락으로 누르고 있기, 가로 넘침 없음.
//  8. 사이트판(PLAN PD-10): f059·f058 판정 구간(원고 152쪽)·f062 g 핀 줄(원고 146쪽)을 고친 …-site.py.
// f058(4채널 터치 + OLED + RGB LED)은 OLED(구역 B 부품 폴더 oled-i2c)가 있을 때만 끝까지 돌려 본다(없으면 배선도까지).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, runCode, waitDone } from './helpers/lab.ts';

const ESP32_PATH = withBase('labs/esp32/');
/** 병렬 제작(2026-09-18): OLED 부품(구역 B)이 작업 폴더에 있는지 */
const OLED_READY = fs.existsSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'lab', 'modules', 'board', 'parts', 'oled-i2c', 'ssd1306.py'));

function board(page: Page) {
  return page.locator('[data-board-io]');
}

function part(page: Page, id: string) {
  return page.locator(`[data-board-part="${id}"]`);
}

function consoleBox(page: Page) {
  return page.locator('[data-lab-console]');
}

async function consoleText(page: Page): Promise<string> {
  return (await consoleBox(page).textContent()) ?? '';
}

/**
 * 요소의 속성 값이 바뀌는 차례를 페이지 안에서 빠짐없이 모은다(같은 값이 이어지면 한 번만) — 짧게 바뀌는 모습을 expect 폴링 사이에 놓치지 않게(README 4.6).
 * 돌려주는 함수를 부르면 지금까지 모은 값을 쉼표로 이어 준다.
 */
async function recordAttribute(page: Page, selector: string, attribute: string): Promise<() => Promise<string>> {
  const key = `__zoneA_${attribute}_${Math.random().toString(36).slice(2)}`;
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
  return () => page.evaluate((storeKey) => ((window as unknown as Record<string, string[]>)[storeKey] ?? []).join(','), key);
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

async function stop(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).click();
  expect(await waitDone(page, 30_000)).toBe('stopped');
}

test.describe('ESP32 실습실 — PWM·ADC 부품(P3-03)', () => {
  test.describe.configure({ timeout: 240_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '예제 동작은 화면 크기와 상관없어 데스크톱에서 한 번만 본다(휴대폰은 아래 따로).');

  test('RGB LED·레이저: f060 PWM으로 빨강 밝기(%)가 오르내리고, f061은 빨강·초록·파랑 차례, f063 레이저는 1초마다 켜졌다 꺼진다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await openExample(page, 'esp32/u2/2-1-4-rgb-pwm-fade.py');
    const rgb = part(page, 'rgb-led');
    await expect(rgb).toHaveAttribute('role', 'img');
    await expect(rgb).toHaveAttribute('aria-label', /RGB LED\(GPIO27·GPIO32·GPIO33\): 꺼짐/u);
    await expect(rgb).toContainText('1이면 켜짐');
    await expect(page.locator('[data-board-wire="signal:rgb-led:r"]')).toHaveAttribute('data-gpio', '27');
    await expect(page.locator('[data-board-wire="signal:rgb-led:b"]')).toHaveAttribute('data-gpio', '33');
    await expect(page.locator('[data-board-practice-steps] li')).toHaveCount(3);
    const red = await recordAttribute(page, '[data-board-part="rgb-led"]', 'data-visual-r');
    await run(page);
    // 0 → 100 %까지 한 칸씩 오르고(중간 값이 여러 개) 다시 내려간다
    await expect
      .poll(
        async () => {
          const values = (await red()).split(',').map(Number);
          const top = values.indexOf(100);
          return top > 0 && values.slice(1, top).filter((value) => value > 0 && value < 100).length > 5 && values.slice(top + 1).some((value) => value < 100);
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const row = page.locator('[data-board-pin="27"]');
    await expect(row).toHaveAttribute('data-mode', 'pwm');
    await expect(row).toContainText('PWM 출력');
    await expect(row).toContainText('RGB LED(빨강)');
    await stop(page);
    await expect(rgb).toHaveAttribute('data-visual-lit', 'false');

    await openExample(page, 'esp32/u2/2-1-4-rgb-check.py');
    const names = await recordAttribute(page, '[data-board-part="rgb-led"]', 'data-visual-name');
    await run(page);
    await expect.poll(names, { timeout: 20_000 }).toContain('빨강,꺼짐,초록,꺼짐,파랑,꺼짐');
    await expect(consoleBox(page)).toContainText('2');
    await stop(page);

    await openExample(page, 'esp32/u2/2-1-4-laser-check.py');
    const laser = part(page, 'laser');
    await expect(laser).toContainText('눈에 비추지 않기');
    const lit = await recordAttribute(page, '[data-board-part="laser"]', 'data-visual-lit');
    const pin = await recordAttribute(page, '[data-board-header][data-gpio="21"]', 'data-high');
    await run(page);
    await expect.poll(lit, { timeout: 20_000 }).toContain('false,true,false,true');
    await expect.poll(pin, { timeout: 5_000 }).toContain('true,false,true');
    await expect(laser).toHaveAttribute('aria-label', /레이저\(GPIO21\): (켜짐|꺼짐)/u);
    await stop(page);
    await expect(laser).toHaveAttribute('data-visual-lit', 'false');
    expect(await consoleText(page)).not.toContain('Traceback');
    expect(errors).toEqual([]);
  });

  test('버저: f068 음계가 262~523Hz 차례로 Web Audio로 울리고 끝나며, f067 [소리 꺼짐]이면 소리를 내지 않고, f069 터치(키보드)로 짧게 울린다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await openExample(page, 'esp32/u2/2-2-1-buzzer-scale.py');
    const soundButton = page.locator('[data-board-sound]');
    await expect(soundButton).toBeVisible();
    await expect(soundButton).toHaveAttribute('aria-pressed', 'true');
    await expect(soundButton).toHaveText('소리 켜짐');
    const buzzer = part(page, 'buzzer');
    await expect(page.locator('[data-board-problems] li[data-code="strapping"]')).toContainText('GPIO15');
    const tones = await recordAttribute(page, '[data-board-part="buzzer"]', 'data-visual-tone-hz');
    const audio = await recordAttribute(page, '[data-board-part="buzzer"] [data-buzzer-audio]', 'data-buzzer-audio');
    await run(page);
    await expect(consoleBox(page)).toContainText('도(높은)', { timeout: 30_000 });
    expect(await waitDone(page, 30_000)).toBe('ok');
    expect(await tones()).toContain('262,294,330,349,392,440,494,523,0');
    // 소리를 낸 적이 있고(발진기가 돌았고) 끝나면 조용하다
    expect((await audio()).split(',')).toContain('playing');
    await expect(buzzer.locator('[data-buzzer-audio]')).toHaveAttribute('data-buzzer-audio', 'silent');
    await expect(buzzer).toHaveAttribute('data-visual-sounding', 'false');

    await openExample(page, 'esp32/u2/2-2-1-buzzer-check.py');
    const mark = part(page, 'buzzer').locator('[data-buzzer-audio]');
    await run(page);
    await expect(part(page, 'buzzer')).toHaveAttribute('data-visual-sounding', 'true', { timeout: 20_000 });
    await expect(part(page, 'buzzer')).toHaveAttribute('data-visual-tone-hz', '1000');
    await expect(part(page, 'buzzer')).toHaveAttribute('data-visual-source', 'digital');
    await expect(mark).toHaveAttribute('data-buzzer-audio', 'playing', { timeout: 10_000 });
    // [소리 꺼짐]: 다음 삐 소리부터 발진기를 쓰지 않는다(muted), 이 컴퓨터에 기억
    await page.locator('[data-board-sound]').click();
    await expect(page.locator('[data-board-sound]')).toHaveAttribute('aria-pressed', 'false');
    await expect(board(page)).toHaveAttribute('data-board-sound-state', 'off');
    await expect(mark).toHaveAttribute('data-buzzer-audio', 'muted', { timeout: 10_000 });
    // 다음 삐 소리 때 그림 글에도 "(소리 꺼짐)"이 붙는다
    await expect(part(page, 'buzzer')).toContainText('소리 꺼짐', { timeout: 10_000 });
    expect(await page.evaluate(() => window.localStorage.getItem('ai-physical-computing:module:board:sound'))).toBe('off');
    await page.locator('[data-board-sound]').click();
    await expect(mark).toHaveAttribute('data-buzzer-audio', 'playing', { timeout: 10_000 });
    await stop(page);
    await expect(mark).toHaveAttribute('data-buzzer-audio', 'silent');

    await openExample(page, 'esp32/u2/2-2-1-adv-touch-buzzer.py');
    const sounding = await recordAttribute(page, '[data-board-part="buzzer"]', 'data-visual-sounding');
    await run(page);
    const touch = part(page, 'touch-digital');
    await touch.focus();
    await page.keyboard.down('Space');
    await expect(consoleBox(page)).toContainText('buzzer on', { timeout: 20_000 });
    await page.keyboard.up('Space');
    await expect(consoleBox(page)).toContainText('buzzer off', { timeout: 10_000 });
    await expect.poll(sounding, { timeout: 5_000 }).toContain('false,true,false');
    await stop(page);
    expect(errors).toEqual([]);
  });

  test('4채널 터치(f059): 조작 칸 단추(키보드·마우스)·그림 속 패드·값 막대로 ADC 값이 688·1535·2381·3263·4095로 바뀌고 원본 판정 줄이 나온다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openExample(page, 'esp32/u2/2-1-3-adv-touch4-check.py');
    const controls = page.locator('[data-board-part-controls="touch-analog-4ch"]');
    await expect(page.locator('[data-board-controls]')).toBeVisible();
    await expect(controls.getByRole('heading')).toHaveText('4채널 터치 센서 조작');
    await expect(controls.locator('[data-touch4-pad]')).toHaveCount(4);
    const touch = part(page, 'touch-analog-4ch');
    // (P3-11) 부품이 만든 상태 글(visual.summary)이 화면 낭독기 이름에 들어간다 — 패드 번호·값까지 읽어 준다
    await expect(touch).toHaveAttribute('aria-label', /4채널 터치 센서\(GPIO32\): 패드 누르지 않음 · 값 0/u);
    await run(page);
    await expect(consoleBox(page)).toContainText('ADC: 0 → No touch', { timeout: 30_000 });

    // 키보드: Tab으로 닿는 단추에서 Space를 누르고 있는 동안
    const pad2 = controls.locator('[data-touch4-pad="2"]');
    await pad2.focus();
    await page.keyboard.down('Space');
    await expect(pad2).toHaveAttribute('aria-pressed', 'true');
    await expect(touch).toHaveAttribute('data-visual-pad', '2');
    await expect(touch).toContainText('패드 2 · 값 약 1535');
    await expect(consoleBox(page)).toContainText('ADC: 1535 → Button 2', { timeout: 10_000 });
    await page.keyboard.up('Space');
    await expect(pad2).toHaveAttribute('aria-pressed', 'false');
    await expect(touch).toHaveAttribute('data-visual-pad', '0');

    // Enter도 누르고 있는 동안 — 패드 4(3263)는 원본 판정 구간이 겹쳐 Button 3
    const pad4 = controls.locator('[data-touch4-pad="4"]');
    await pad4.focus();
    await page.keyboard.down('Enter');
    await expect(consoleBox(page)).toContainText('ADC: 3263 → Button 3', { timeout: 10_000 });
    await page.keyboard.up('Enter');

    // 마우스로 단추 누르고 있기
    const pad1 = controls.locator('[data-touch4-pad="1"]');
    await pad1.hover();
    await page.mouse.down();
    await expect(consoleBox(page)).toContainText('ADC: 688 → Button 1', { timeout: 10_000 });
    await page.mouse.up();
    await expect(pad1).toHaveAttribute('aria-pressed', 'false');

    // 그림 속 패드 3을 마우스로 — 2381도 원본 구간에서는 Button 2
    await page.locator('[data-board-part="touch-analog-4ch"] [data-touch4-svg-pad="3"]').hover();
    await page.mouse.down();
    await expect(touch).toHaveAttribute('data-visual-pad', '3');
    await expect(consoleBox(page)).toContainText('ADC: 2381 → Button 2', { timeout: 10_000 });
    await page.mouse.up();
    await expect(touch).toHaveAttribute('data-visual-pad', '0');

    // 값 막대: 키보드 End(4095) → Button 4, Home(0) → No touch
    const slider = controls.locator('[data-touch4-rest]');
    await slider.focus();
    await page.keyboard.press('End');
    await expect(controls).toHaveAttribute('data-touch4-value', '4095');
    await expect(consoleBox(page)).toContainText('ADC: 4095 → Button 4', { timeout: 10_000 });
    await expect(page.locator('[data-board-pin="32"]')).toHaveAttribute('data-level', '1');
    const zeros = (await consoleText(page)).split('ADC: 0 → No touch').length;
    await page.keyboard.press('Home');
    await expect.poll(async () => (await consoleText(page)).split('ADC: 0 → No touch').length, { timeout: 10_000 }).toBeGreaterThan(zeros);
    await stop(page);
    expect(await consoleText(page)).not.toContain('Traceback');
    expect(errors).toEqual([]);

    // f058: 4채널 터치 + OLED + RGB LED(12·5·4) 배선도 — 원고 그대로인 스트래핑 핀 12·5에 "주의"
    await openExample(page, 'esp32/u2/2-1-3-adv-touch4-oled-rgb.py');
    await expect(part(page, 'touch-analog-4ch')).toHaveCount(1);
    await expect(part(page, 'rgb-led')).toHaveCount(1);
    await expect(page.locator('[data-board-wire="signal:rgb-led:r"]')).toHaveAttribute('data-gpio', '12');
    const strapping = page.locator('[data-board-problems] li[data-code="strapping"]');
    await expect(strapping).toHaveCount(2);
    await expect(strapping.first()).toContainText('주의:');
  });

  test('사이트판(PD-10): f059는 패드 3·4가 Button 3·4, f062는 레이저와 빨강·파랑이 번갈아 켜지고, f058은 패드마다 RGB LED 색과 OLED 글이 바뀐다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // f059 사이트판: 원고 152쪽 구간 — 원본에서 Button 2·3으로 잘못 나오던 패드 3·4
    await openExample(page, 'esp32/u2/2-1-3-adv-touch4-check-site.py');
    await expect(page.locator('[data-lab-example-select] option:checked')).toContainText('(사이트판)');
    const controls = page.locator('[data-board-part-controls="touch-analog-4ch"]');
    await run(page);
    await expect(consoleBox(page)).toContainText('ADC: 0 → No touch', { timeout: 30_000 });
    const pad3 = controls.locator('[data-touch4-pad="3"]');
    await pad3.focus();
    await page.keyboard.down('Space');
    await expect(consoleBox(page)).toContainText('ADC: 2381 → Button 3', { timeout: 10_000 });
    await page.keyboard.up('Space');
    const pad4 = controls.locator('[data-touch4-pad="4"]');
    await pad4.focus();
    await page.keyboard.down('Enter');
    await expect(consoleBox(page)).toContainText('ADC: 3263 → Button 4', { timeout: 10_000 });
    await page.keyboard.up('Enter');
    await stop(page);

    // f062 사이트판: TypeError 없이 레이저 켜짐 + 빨강 ↔ 레이저 꺼짐 + 파랑
    await openExample(page, 'esp32/u2/2-1-4-laser-rgb-site.py');
    const names = await recordAttribute(page, '[data-board-part="rgb-led"]', 'data-visual-name');
    const lit = await recordAttribute(page, '[data-board-part="laser"]', 'data-visual-lit');
    await run(page);
    await expect.poll(names, { timeout: 20_000 }).toMatch(/빨강,(꺼짐,)?파랑,(꺼짐,)?빨강/u);
    await expect.poll(lit, { timeout: 5_000 }).toContain('true,false,true');
    await stop(page);
    expect(await consoleText(page)).not.toContain('Traceback');

    if (OLED_READY) {
      // f058 사이트판: 패드 1~4 → 빨강·초록·파랑·흰색, 떼면 꺼짐. OLED 셋째 줄에 누른 버튼
      await openExample(page, 'esp32/u2/2-1-3-adv-touch4-oled-rgb-site.py');
      const rgb = part(page, 'rgb-led');
      const oled = part(page, 'oled'); // 사이드카의 부품 id(id: oled) — data-board-part는 배선의 id
      await run(page);
      await expect(oled).toHaveAttribute('data-visual-lit', 'true', { timeout: 30_000 });
      for (const [pad, name] of [
        ['1', '빨강'],
        ['2', '초록'],
        ['3', '파랑'],
        ['4', '흰색'],
      ] as const) {
        await page.locator(`[data-board-part-controls="touch-analog-4ch"] [data-touch4-pad="${pad}"]`).focus();
        await page.keyboard.down('Space');
        await expect(rgb).toHaveAttribute('data-visual-name', name, { timeout: 10_000 });
        await expect(oled).toHaveAttribute('data-visual-text', new RegExp(`Button ${pad}`, 'u'), { timeout: 10_000 });
        await page.keyboard.up('Space');
        await expect(rgb).toHaveAttribute('data-visual-name', '꺼짐', { timeout: 10_000 });
      }
      await stop(page);
      expect(await consoleText(page)).not.toContain('Traceback');
    }
    expect(errors).toEqual([]);
  });

  test('팬 모터(f073): 정회전 → 역회전 → 멈춤을 되풀이하고 돌 때 애니메이션이 있으며, 움직임 줄이기면 돌지 않고 글만 바뀐다', async ({ page }) => {
    await openExample(page, 'esp32/u2/2-2-3-fan-direction.py');
    const fan = part(page, 'fan-motor');
    await expect(fan).toContainText('손 조심');
    await expect(page.locator('[data-board-wire="signal:fan-motor:ina"]')).toHaveAttribute('data-gpio', '25');
    await expect(page.locator('[data-board-wire="signal:fan-motor:inb"]')).toHaveAttribute('data-gpio', '26');
    const directions = await recordAttribute(page, '[data-board-part="fan-motor"]', 'data-visual-direction');
    await run(page);
    await expect(fan).toHaveAttribute('data-visual-direction', 'cw', { timeout: 20_000 });
    await expect(fan).toHaveAttribute('data-visual-motion', 'spin');
    await expect(fan).toContainText('정회전');
    await expect(fan).toHaveAttribute('aria-label', /팬 모터\(GPIO25·GPIO26\)/u);
    expect(await fan.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
    await expect.poll(async () => /cw(,stop)?,ccw.*,stop/u.test(await directions()), { timeout: 15_000 }).toBe(true);
    await stop(page);
    await expect(fan).toHaveAttribute('data-visual-direction', 'stop');
    // 회전은 Web Animations다. 멈춘 뒤에는 그것만 없으면 된다 — 방금 바뀐 모양의 CSS 전환은 세지 않는다(lab-esp32-parts 진동 모터 검사 참고).
    expect(await fan.evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSTransition)).length)).toBe(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openExample(page, 'esp32/u2/2-2-3-fan-direction.py');
    await run(page);
    await expect(part(page, 'fan-motor')).toHaveAttribute('data-visual-direction', 'cw', { timeout: 20_000 });
    await expect(part(page, 'fan-motor')).toHaveAttribute('data-visual-motion', 'still');
    await expect(part(page, 'fan-motor')).toContainText('정회전');
    // 움직임 줄이기 규칙(global.css)이 모든 요소에 0.01ms CSS 전환을 두므로 전환은 빼고 센다(바쁜 컴퓨터에서 다음 화면 갱신까지 남음).
    expect(
      await part(page, 'fan-motor').evaluate(
        (element) => element.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSTransition)).length,
      ),
    ).toBe(0);
    await stop(page);
  });

  test('서보(f078·f081·f080): 복원한 servo_library로 0° → 약 89° → 180°(servo40 기준·펄스 폭 글), 콘솔 입력으로 각도, 서보 2개', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openExample(page, 'esp32/u2/2-2-4-servo-angles.py');
    const servo = part(page, 'servo');
    await expect(servo).toContainText('신호 없음');
    const angles = await recordAttribute(page, '[data-board-part="servo"]', 'data-visual-angle');
    await run(page);
    expect(await waitDone(page, 40_000)).toBe('ok');
    const seen = (await angles()).split(',');
    const at = (value: string) => seen.indexOf(value);
    expect(at('0')).toBeGreaterThan(0);
    expect(at('89')).toBeGreaterThan(at('0'));
    expect(at('180')).toBeGreaterThan(at('89'));
    await expect(servo).toHaveAttribute('data-visual-profile', 'servo40');
    await expect(servo).toContainText('약 180° · 2.25ms');
    await expect(page.locator('[data-board-pin="25"]')).toContainText('PWM 출력');
    expect(await consoleText(page)).not.toContain('Traceback');

    await openExample(page, 'esp32/u2/2-2-4-servo-keyboard.py');
    await run(page);
    const input = page.locator('[data-lab-input]');
    await expect(page.locator('[data-lab-input-form]')).toBeVisible({ timeout: 30_000 });
    await expect(part(page, 'servo')).toHaveAttribute('data-visual-angle', '89');
    await input.fill('2');
    await page.keyboard.press('Enter');
    await expect(part(page, 'servo')).toHaveAttribute('data-visual-angle', '0', { timeout: 10_000 });
    await expect(consoleBox(page)).toContainText('서보모터가 0도로 이동했습니다.', { timeout: 10_000 });
    await expect(page.locator('[data-lab-input-form]')).toBeVisible({ timeout: 10_000 });
    await input.fill('1');
    await page.keyboard.press('Enter');
    await expect(part(page, 'servo')).toHaveAttribute('data-visual-angle', '180', { timeout: 10_000 });
    await stop(page);
    await expect(part(page, 'servo')).toHaveAttribute('data-visual-signal', 'no-signal');

    await openExample(page, 'esp32/u2/2-2-4-servo-two.py');
    await expect(part(page, 'servo-1')).toHaveAttribute('aria-label', /서보모터 1\(GPIO25\)/u);
    await expect(part(page, 'servo-2')).toHaveAttribute('aria-label', /서보모터 2\(GPIO26\)/u);
    await run(page);
    await expect(part(page, 'servo-1')).toHaveAttribute('data-visual-angle', '180', { timeout: 20_000 });
    await expect(part(page, 'servo-2')).toHaveAttribute('data-visual-angle', '180', { timeout: 10_000 });
    await stop(page);
    expect(errors).toEqual([]);
  });

  test('실물과 같은 오류 문구: 범위 밖 duty는 ValueError, ADC를 못 쓰는 핀은 invalid pin, repr은 실물 모양', async ({ page }) => {
    await openExample(page, 'esp32/01-first-blink.py');
    await runCode(page, ['from machine import Pin, PWM, ADC', 'led = PWM(Pin(2), freq=50, duty=77)', 'print(led)', 'print(ADC(Pin(32)))', 'led.duty(2000)'].join('\n'));
    expect(await waitDone(page, 60_000)).toBe('error');
    const text = await consoleText(page);
    expect(text).toContain('PWM(Pin(2), freq=50, duty=77)');
    expect(text).toContain('ADC(Pin(32), atten=3)');
    expect(text).toContain('ValueError: duty must be from 0 to 1023');
    // 내장 LED가 PWM 밝기로 보인다(오류로 끝나면 마지막 모습)
    await expect(part(page, 'builtin-led')).toHaveAttribute('data-visual-brightness', '8');

    await runCode(page, ['from machine import ADC, Pin', 'ADC(Pin(5))'].join('\n'));
    expect(await waitDone(page, 60_000)).toBe('error');
    await expect(consoleBox(page)).toContainText('ValueError: invalid pin');
  });
});

test.describe('ESP32 실습실 — PWM·ADC 부품 휴대폰(P3-03)', () => {
  test.describe.configure({ timeout: 240_000 });

  test('휴대폰 375px: 4채널 터치 패드 단추를 손가락으로 누르고 있으면 값이 바뀌고, 조작 칸이 가로로 넘치지 않는다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '손가락 조작은 휴대폰 프로젝트에서 본다.');
    await openExample(page, 'esp32/u2/2-1-3-adv-touch4-check.py');
    const controls = page.locator('[data-board-part-controls="touch-analog-4ch"]');
    const pad3 = controls.locator('[data-touch4-pad="3"]');
    await pad3.scrollIntoViewIfNeeded();
    const box = await pad3.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await run(page);
    await expect(consoleBox(page)).toContainText('ADC: 0 → No touch', { timeout: 30_000 });
    await pad3.scrollIntoViewIfNeeded();
    const now = await pad3.boundingBox();
    const client = await page.context().newCDPSession(page);
    const point = { x: Math.round(now!.x + now!.width / 2), y: Math.round(now!.y + now!.height / 2) };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(pad3).toHaveAttribute('aria-pressed', 'true');
    await expect(consoleBox(page)).toContainText('ADC: 2381 → Button 2', { timeout: 10_000 });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(pad3).toHaveAttribute('aria-pressed', 'false');
    await expect(part(page, 'touch-analog-4ch')).toHaveAttribute('data-visual-pad', '0');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await stop(page);
  });
});
