// 시나리오 B(SPEC §13 "하드웨어 없는 학교"): 가상 ESP32에서 블록으로 "버튼 누르면 LED" 완성 → 코드 모드로 전환해 한 줄 수정 → 즉시 반영.
// PLAN §8.3 P3-06·§8.7 B, PD-34: 기본 입력은 디지털 터치 센서(GPIO17, 누르는 동안 1) + 내장 LED(GPIO2).
// BOOT 버튼(GPIO0, 누르면 0)판은 "거꾸로 동작하는 버튼" 바꿔보기로 돈다.
//
// 학생처럼 한다: 실습실 → [블록] → 빈 작업판 → 도구 상자에서 블록 5개를 마우스로 끌어 이어 붙인다(계속 반복하기 · 만약/아니면 ·
// 터치 센서 누르고 있나요? · 내장 LED 켜기 · 내장 LED 끄기) → 편집칸에 생긴 코드 확인 → [실행] → 보드의 터치 센서를 마우스로 누르고 있기 →
// LED 켜짐 → 떼면 꺼짐 → [정지] → [코드로 바꾸기] → 편집칸에서 한 줄(== 1 → == 0) 고치기 → [실행] → 누르지 않아도 LED 켜짐(반영).
// 끌어 놓는 자리만 작업판의 Blockly 좌표로 계산하고(tests/e2e/helpers/blocks.ts), 누르기·끌기·입력은 실제 마우스·키보드다.
// 걸린 시간을 test.info() 주석으로 남긴다(PROGRESS 기록용).
import { expect, test } from '@playwright/test';
import {
  blocksRoot,
  boardPart,
  dragFromToolbox,
  editLineEnd,
  editorCode,
  labRoot,
  loadPreset,
  openEsp32Lab,
  pressPart,
  recordAttribute,
  runLab,
  stopLab,
  switchToBlocks,
} from './helpers/blocks.ts';

/** 블록 5개로 만든 "터치 센서를 누르면 LED" 코드(블록 모드가 만드는 그대로) */
const TOUCH_LED_CODE = [
  '# 블록으로 만든 코드',
  '# @part touch-digital 17',
  'from machine import Pin',
  '',
  'led = Pin(2, Pin.OUT)',
  'touch = Pin(17, Pin.IN)',
  '',
  'while True:',
  '    if touch.value() == 1:',
  '        led.on()',
  '    else:',
  '        led.off()',
].join('\n');

const LED = '[data-board-part="builtin-led"]';

test.describe('시나리오 B — 블록으로 "터치 센서를 누르면 LED" → 코드 한 줄 수정 → 즉시 반영', () => {
  test.describe.configure({ timeout: 300_000 });

  test('블록을 끌어 놓아 완성하고, 가상 터치로 LED를 켠 뒤, 코드로 바꿔 한 줄 고치면 바로 반영된다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const started = Date.now();
    const marks: string[] = [];
    const mark = (label: string) => marks.push(`${label} ${((Date.now() - started) / 1000).toFixed(1)}초`);

    // 1. 실습실을 열고 [블록]으로 바꾼다(처음 블록 모드에는 "내장 LED 깜빡이기" 예시가 있어 빈 작업판을 불러온다)
    await openEsp32Lab(page);
    mark('실습실 준비');
    await switchToBlocks(page);
    mark('블록 모드 준비');
    await loadPreset(page, 'empty');
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-block-count', '0');

    // 2. 블록 5개를 도구 상자에서 끌어 이어 붙인다
    await dragFromToolbox(page, { category: '반복·조건', type: 'apc_forever', to: 'free' });
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-block-count', '1');
    await dragFromToolbox(page, { category: '반복·조건', type: 'controls_if', pick: { hasInput: 'ELSE' }, to: { block: 'apc_forever', input: 'DO' } });
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-block-count', '2');
    await dragFromToolbox(page, { category: '센서', type: 'apc_touch_pressed', to: { block: 'controls_if', input: 'IF0' } });
    await dragFromToolbox(page, { category: '보드', type: 'apc_builtin_led', pick: { field: ['STATE', 'on'] }, to: { block: 'controls_if', input: 'DO0' } });
    await dragFromToolbox(page, { category: '보드', type: 'apc_builtin_led', pick: { field: ['STATE', 'off'] }, to: { block: 'controls_if', input: 'ELSE' } });
    mark('블록 5개 완성');

    // 3. 블록 = 코드: 편집칸에 MicroPython 코드가 바로 생기고, 가상 보드에 터치 센서(GPIO17)가 그려진다
    await expect.poll(() => editorCode(page), { timeout: 10_000 }).toBe(TOUCH_LED_CODE);
    await expect(blocksRoot(page)).toHaveAttribute('data-blocks-block-count', '5');
    await expect(boardPart(page, 'touch-digital')).toBeVisible();
    await expect(page.locator('[data-board-wire^="signal:touch-digital"]').first()).toBeAttached();

    // 4. [실행] → 누르기 전 꺼짐 → 터치 센서를 누르고 있으면 켜짐 → 떼면 꺼짐
    const ledChanges = await recordAttribute(page, LED, 'data-visual-lit');
    await runLab(page);
    mark('실행');
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false');
    const release = await pressPart(page, 'touch-digital');
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'true', { timeout: 15_000 });
    mark('터치 → LED 켜짐');
    await release();
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false', { timeout: 15_000 });
    expect(await ledChanges()).toMatch(/false,true,false/u);
    await stopLab(page);

    // 5. [코드로 바꾸기] → 코드 모드(편집칸을 고칠 수 있음), 코드는 그대로이고 배선도도 남는다
    await page.getByRole('button', { name: '코드로 바꾸기', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'code');
    await expect(page.locator('[data-blocks-area]')).toBeHidden();
    expect(await editorCode(page)).toBe(TOUCH_LED_CODE);
    await expect(boardPart(page, 'touch-digital')).toBeVisible();
    mark('코드로 바꾸기');

    // 6. 한 줄 고치기: == 1 → == 0 (누르지 않을 때 켜지게)
    await editLineEnd(page, '    if touch.value() == 1:', 2, '0:');
    await expect.poll(() => editorCode(page)).toBe(TOUCH_LED_CODE.replace('touch.value() == 1:', 'touch.value() == 0:'));
    await expect(labRoot(page)).toHaveAttribute('data-save-state', /^(pending|saved)$/u);

    // 7. [실행] → 누르지 않아도 LED 켜짐 → 누르면 꺼짐(고친 줄이 바로 반영)
    await runLab(page);
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'true', { timeout: 15_000 });
    mark('고친 코드 반영');
    const releaseAgain = await pressPart(page, 'touch-digital');
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false', { timeout: 15_000 });
    await releaseAgain();
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'true', { timeout: 15_000 });
    await stopLab(page);

    expect(errors).toEqual([]);
    test.info().annotations.push({ type: '시나리오 B 걸린 시간', description: marks.join(' → ') });
  });

  test('BOOT 버튼판: "거꾸로 동작하는 버튼" — 누르면 LED, 코드에서 == 0을 == 1로 바꾸면 반대로 동작한다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '같은 흐름을 데스크톱에서 한 번 본다(휴대폰 끌어 놓기는 첫 검사가 본다).');
    await openEsp32Lab(page);
    await switchToBlocks(page);
    await loadPreset(page, 'boot-led');
    await expect.poll(() => editorCode(page)).toContain('    if button.value() == 0:');
    // 거꾸로 동작하는 버튼이라는 설명이 블록 도구 상자와 툴팁에 있다
    await expect.poll(() => editorCode(page)).toContain('button = Pin(0, Pin.IN)');

    await runLab(page);
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false');
    const release = await pressPart(page, 'boot-button');
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'true', { timeout: 15_000 });
    await release();
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false', { timeout: 15_000 });
    await stopLab(page);

    await page.getByRole('button', { name: '코드로 바꾸기', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'code');
    await editLineEnd(page, '    if button.value() == 0:', 2, '1:');
    await runLab(page);
    // 누르지 않았는데 켜짐(평소 1) → 누르면 꺼짐(0)
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'true', { timeout: 15_000 });
    const releaseAgain = await pressPart(page, 'boot-button');
    await expect(boardPart(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false', { timeout: 15_000 });
    await releaseAgain();
    await stopLab(page);
  });
});
