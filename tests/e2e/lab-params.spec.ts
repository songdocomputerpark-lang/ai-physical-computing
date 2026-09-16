// 조절 패널 브라우저 테스트(PLAN §8.2 P2-04): 개발용 시험 페이지(/labs/dev/runtime/, LabShell 공통 틀)에서 코드의 # @slider·@select·@toggle
// 규약이 조절 패널이 되고, 값을 바꾸면 코드의 글자가 바뀌며, 실행 중에는 다음 입력 확인 지점에서 파이썬 전역 변수에 들어가는지 확인한다.
// 키보드(화살표)·화면 낭독기 값(aria-valuetext)·잘못된 규약의 한국어 경고·제한 모드 안내도 본다.
// 카메라 영상 픽셀이 실제로 달라지는 것은 tests/e2e/scenario-a.spec.ts.
import { expect, test } from '@playwright/test';
import { editorContent, labRoot, openLabAndWaitReady, setEditorCode, waitDone } from './helpers/lab.ts';

const PARAMS_CODE = [
  'threshold = 100  # @slider 0 255 1 테두리 기준',
  'ratio = 0.5  # @slider 0 1 0.1',
  'mode = "edge"  # @select edge blur gray',
  'show_fps = True  # @toggle fps 보이기',
  'bad = 300  # @slider 0 255 1',
  '',
].join('\n');

test.describe('조절 패널(코드의 # @slider 규약)', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI 동작은 데스크톱 Chromium에서 확인한다');
  test.describe.configure({ timeout: 180_000 });

  test('규약 줄마다 슬라이더·선택 상자·토글이 생기고, 조작하면 코드의 그 자리 글자가 바뀌며, 잘못된 줄은 한국어 경고가 붙는다', async ({ page }) => {
    await openLabAndWaitReady(page);
    const panel = page.locator('[data-lab-params]');
    // 시험 예제(print('안녕'))에는 규약이 없어 빈 안내가 보인다.
    await expect(panel).toHaveAttribute('data-count', '0');
    await expect(page.locator('[data-lab-params-empty]')).toBeVisible();

    await setEditorCode(page, PARAMS_CODE);
    await expect(panel).toHaveAttribute('data-count', '4');
    await expect(panel).toHaveAttribute('data-warnings', '1');
    await expect(page.locator('[data-lab-params-empty]')).toBeHidden();
    await expect(page.locator('[data-lab-params-warnings]')).toContainText('5번 줄');
    await expect(page.locator('[data-lab-params-warnings]')).toContainText('벗어나요');
    const names = await page.locator('[data-lab-param]').evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.labParam));
    expect(names).toEqual(['threshold', 'ratio', 'mode', 'show_fps']);

    // 슬라이더: 이름·설명·값·범위 글, 키보드 화살표로 한 칸씩
    const threshold = page.locator('[data-lab-param="threshold"]');
    await expect(threshold).toContainText('threshold');
    await expect(threshold).toContainText('테두리 기준');
    await expect(threshold).toContainText('0 ~ 255');
    const slider = threshold.locator('input[type="range"]');
    await expect(slider).toHaveValue('100');
    await expect(slider).toHaveAttribute('aria-valuetext', '100 (0부터 255까지)');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('101');
    await expect(slider).toHaveAttribute('aria-valuetext', '101 (0부터 255까지)');
    await expect(threshold).toHaveAttribute('data-value', '101');
    await expect(editorContent(page)).toContainText('threshold = 101  # @slider 0 255 1 테두리 기준');
    await page.keyboard.press('ArrowLeft');
    await expect(editorContent(page)).toContainText('threshold = 100  # @slider');
    await slider.fill('42');
    await expect(editorContent(page)).toContainText('threshold = 42  # @slider');
    // 소수 슬라이더는 자릿수대로 적힌다.
    await page.locator('[data-lab-param="ratio"] input[type="range"]').fill('0.7');
    await expect(editorContent(page)).toContainText('ratio = 0.7  # @slider 0 1 0.1');
    // 선택 상자와 토글은 따옴표·True/False를 지킨다.
    await page.locator('[data-lab-param="mode"] select').selectOption('blur');
    await expect(editorContent(page)).toContainText('mode = "blur"  # @select edge blur gray');
    const toggle = page.locator('[data-lab-param="show_fps"] input[type="checkbox"]');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(editorContent(page)).toContainText('show_fps = False  # @toggle fps 보이기');
    await expect(page.locator('[data-lab-param="show_fps"]')).toHaveAttribute('data-value', 'False');
    // 코드를 직접 고치면 패널이 따라온다(값만 바뀐 요소는 그대로, 규약을 지우면 요소가 사라진다).
    await setEditorCode(page, 'threshold = 7  # @slider 0 255 1 테두리 기준\nprint(threshold)\n');
    await expect(panel).toHaveAttribute('data-count', '1');
    await expect(panel).toHaveAttribute('data-warnings', '0');
    await expect(slider).toHaveValue('7');
    await expect(page.locator('[data-lab-params-warnings]')).toBeHidden();
    // 바꾼 값은 자동 저장된다(다음에 열면 그대로).
    await expect(labRoot(page)).toHaveAttribute('data-save-state', 'saved', { timeout: 5_000 });
  });

  test('실행 중에 슬라이더를 움직이면 다음 입력 확인 지점(time.sleep)에서 파이썬 전역 변수가 바뀐다', async ({ page }) => {
    await openLabAndWaitReady(page);
    await setEditorCode(page, ['import time', 'threshold = 100  # @slider 0 255 1', 'for i in range(400):', "    print('값', threshold)", '    time.sleep(0.05)', ''].join('\n'));
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('[data-lab-console]')).toContainText('값 100', { timeout: 30_000 });
    await page.locator('[data-lab-param="threshold"] input[type="range"]').fill('120');
    await expect(editorContent(page)).toContainText('threshold = 120');
    await expect(page.locator('[data-lab-console]')).toContainText('값 120', { timeout: 10_000 });
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, 10_000)).toBe('stopped');
    // 멈춘 뒤에도 패널은 코드와 같은 값을 보이고 조작할 수 있다.
    await page.locator('[data-lab-param="threshold"] input[type="range"]').fill('30');
    await expect(editorContent(page)).toContainText('threshold = 30');
  });

  test('제한 모드(?limited=1)에서는 "다음 [실행] 때 반영" 안내가 보이고 값은 코드에 적힌다', async ({ page }) => {
    await openLabAndWaitReady(page, '?limited=1');
    await expect(labRoot(page)).toHaveAttribute('data-limited', 'yes');
    await expect(page.locator('[data-lab-params-note]')).toHaveAttribute('data-limited', 'yes');
    await expect(page.locator('[data-lab-params-note]')).toContainText('다음 [실행] 때 반영');
    await setEditorCode(page, "gain = 3  # @slider 0 10 1\nprint('gain', gain)\n");
    await page.locator('[data-lab-param="gain"] input[type="range"]').fill('8');
    await expect(editorContent(page)).toContainText('gain = 8');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 30_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('gain 8');
  });
});
