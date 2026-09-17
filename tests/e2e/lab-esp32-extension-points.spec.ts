// ESP32 실습실 — 부품 단계 확장 자리(병렬 제작 준비 2026-09-17) 브라우저 테스트.
// 구역 A·B·C(P3-03~P3-05)가 보드 핵심을 고치지 않고 쓰는 자리가 실제 화면까지 이어지는지, 부품 없이 파이썬 쪽 확장 API를 직접 불러 확인한다.
//  1. PWM: apc_board.BOARD.set_pwm(2, 0.4, 1000) → board.state 핀 항목 mode 'pwm'·duty → 내장 LED 밝기 40, 핀 표 "PWM 출력".
//  2. 부품 장치: apc_board.set_device_state(…) → 'board.device' 이벤트가 화면에 닿는다(data-board-devices).
//  3. 보드 라이브러리 폴더 /board/lib가 sys.path에 있고, 화면이 넣은 라이브러리 수(data-board-libraries)가 목록과 같다.
//  4. 아직 없는 모듈(NOT_YET_MODULES 표의 이름 — 시험용 이름을 잠깐 더해 본다)은 한국어 안내가 든 ModuleNotFoundError로 멈춘다.
//  5. 소리 부품·조작 칸 부품이 없는 예제에서는 [소리 켜짐] 단추와 "부품 조작" 칸이 숨어 있다.
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, runCode, waitDone } from './helpers/lab.ts';

const ESP32_PATH = withBase('labs/esp32/');

function board(page: Page) {
  return page.locator('[data-board-io]');
}

async function consoleText(page: Page): Promise<string> {
  return (await page.locator('[data-lab-console]').textContent()) ?? '';
}

test.describe('ESP32 실습실 — 부품 단계 확장 자리', () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '파이썬·화면 이음만 보는 검사라 데스크톱에서 한 번 돌린다.');

  test('PWM 세기·부품 장치 상태·보드 라이브러리 폴더·아직 없는 모듈 안내가 화면까지 이어진다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(ESP32_PATH);
    expect(response?.status()).toBe(200);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 30_000 });

    // 소리·조작 칸 부품이 없는 첫 예제: 단추와 칸이 숨어 있다
    await expect(page.locator('[data-board-sound]')).toBeHidden();
    await expect(page.locator('[data-board-controls]')).toBeHidden();
    // 라이브러리는 파이썬이 준비될 때 넣는다(지금 저장소의 examples/esp32/lib/ 파일 수)
    await expect(board(page)).toHaveAttribute('data-board-libraries', /^\d+$/u, { timeout: 30_000 });

    await runCode(
      page,
      [
        'import apc_board, sys, os, time',
        'apc_board.BOARD.set_pwm(2, 0.4, 1000)',
        "apc_board.set_device_state('builtin-led', 'builtin-led', {'note': 'hello'})",
        'time.sleep_ms(50)',
        "print('lib', '/board/lib' in sys.path, os.path.isdir('/board/lib'))",
        'time.sleep_ms(50)',
      ].join('\n'),
    );
    expect(await waitDone(page, 60_000)).toBe('ok');
    expect(await consoleText(page)).toContain('lib True True');
    const led = page.locator('[data-board-part="builtin-led"]');
    await expect(led).toHaveAttribute('data-visual-lit', 'true');
    await expect(led).toHaveAttribute('data-visual-brightness', '40');
    const row = page.locator('[data-board-pin="2"]');
    await expect(row).toHaveAttribute('data-mode', 'pwm');
    await expect(row).toContainText('PWM 출력');
    await expect(board(page)).toHaveAttribute('data-board-devices', '1');
    await expect(board(page)).toHaveAttribute('data-board-device-last', 'builtin-led');

    // 다음 실행(보드를 새로 켬)은 지난 장치 상태를 지운다. 아직 없는 모듈은 한국어 안내와 함께 멈춘다
    // (neopixel 같은 실제 이름은 부품 구역이 파일을 더하면 import되므로 시험용 이름을 표에 잠깐 더해 본다).
    await runCode(page, ['import apc_board', "apc_board.NOT_YET_MODULES['zz_demo_firmware'] = 'firmware'", 'import zz_demo_firmware'].join('\n'));
    expect(await waitDone(page, 60_000)).toBe('error');
    await expect(board(page)).toHaveAttribute('data-board-devices', '0');
    const text = await consoleText(page);
    expect(text).toContain('ModuleNotFoundError');
    expect(text).toContain('가상 보드에 아직 없어요');
    expect(errors).toEqual([]);
  });
});
