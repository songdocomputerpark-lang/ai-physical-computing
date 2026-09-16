// 시나리오 A 자동 판정(SPEC §13, PLAN §8.7·§8.2 P2-04 완료 기준): 학생이 크롬만 있고 아무것도 모르는 상태에서
// 홈 → [카메라로 바로 해보기] → (가짜) 웹캠 에지 결과를 보고 → 슬라이더로 임계값을 바꿔 변화를 본다. 설명을 읽지 않아도 되는 흐름이라
// 버튼 누르기·슬라이더 움직이기만 한다. 홈을 연 순간부터 슬라이더 효과가 보일 때까지의 시간을 재서 5분 안인지 확인하고 콘솔·주석에 남긴다
// (P2-14가 첫 방문 전송량과 네트워크 속도 제한 측정을 더한다).
//
// 슬라이더 효과 판정: 가짜 카메라 영상(scripts/gen-test-video.mjs)에는 바탕보다 밝기가 20만 높은 희미한 네모가 있다. threshold를
// 100 → 20으로 내리면 그 네모의 테두리가 새로 나타나(흰 픽셀 비율이 늘고), 다시 100으로 올리면 사라진다(비율이 준다).
// 실제 OpenCV로 계산한 값(2026-09-16, Node Pyodide): 어느 장이든 threshold 20이 100보다 324픽셀(0.105%) 많고, 같은 임계값에서는
// 장마다 0.80~0.91%로 흔들린다 → 한 바퀴 넘게 평균 낸 비율을 비교한다(averageWhiteRatio).
// 실행: npx playwright test tests/e2e/scenario-a.spec.ts — Pyodide(약 6MB)와 numpy·OpenCV 휠(약 14MB)을 jsDelivr에서 받는다.
import { expect, test } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { editorContent, labRoot } from './helpers/lab.ts';
import { VISION_PATH, averageWhiteRatio, framesShown, waitFrames, waitVisionReady, whiteRatio } from './helpers/vision.ts';

/** 희미한 네모의 테두리(324픽셀 = 640×480의 0.105%)가 생기고 사라질 때 평균 비율이 이만큼은 달라져야 한다(계산값의 절반). */
const MIN_RATIO_CHANGE = 0.0005;
/** SPEC §13 시나리오 A: 5분 안에 */
const SCENARIO_LIMIT_MS = 5 * 60 * 1000;

test.describe('시나리오 A — 학생, 크롬만 있음, 아무것도 모름', () => {
  test.skip(({ isMobile }) => isMobile, '실습실은 데스크톱 Chromium(JSPI·카메라)에서 확인한다');
  test.describe.configure({ timeout: SCENARIO_LIMIT_MS + 60_000 });

  test('홈 → [카메라로 바로 해보기] → 웹캠 에지 결과 → 슬라이더로 임계값을 바꾸면 다음 프레임부터 결과가 달라진다(5분 안)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;

    // 1. 홈: 주요 버튼 하나만 누른다("준비 중" 표시가 없어야 한다).
    const home = await page.goto(withBase(''));
    expect(home?.status()).toBe(200);
    const button = page.locator('[data-home-action="camera"]');
    await expect(button).toContainText('카메라로 바로 해보기');
    await expect(button).not.toContainText('준비 중');
    await button.click();
    await expect(page).toHaveURL((url) => url.pathname === VISION_PATH);

    // 2. 실습실: 파이썬·OpenCV가 준비되고 첫 예제가 편집칸에 들어 있다.
    await waitVisionReady(page);
    const readyMs = elapsed();
    await expect(labRoot(page)).toHaveAttribute('data-example', 'first-edge');
    const slider = page.locator('[data-lab-param="threshold"] input[type="range"]');
    await expect(slider).toHaveValue('100');
    await expect(page.locator('[data-lab-param="blur_size"] input[type="range"]')).toHaveValue('5');

    // 3. [실행] → 웹캠(가짜 카메라)의 에지 결과가 출력 창에 그려진다.
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await waitFrames(page, 'edges', 4);
    const edgeMs = elapsed();
    expect(await whiteRatio(page, 'edges')).toBeGreaterThan(0);
    const base = await averageWhiteRatio(page, 'edges');

    // 4. 슬라이더를 20으로 → 코드의 숫자도 바뀌고, 다음 프레임부터 희미한 네모의 테두리가 나타나 흰 픽셀이 는다.
    let shown = await framesShown(page);
    await slider.fill('20');
    await expect(editorContent(page)).toContainText('threshold = 20');
    await expect(slider).toHaveAttribute('aria-valuetext', '20 (0부터 255까지)');
    await waitFrames(page, 'edges', shown + 3);
    const sliderMs = elapsed();
    const low = await averageWhiteRatio(page, 'edges');
    expect(low, `threshold 20: ${low} > 100: ${base}`).toBeGreaterThan(base + MIN_RATIO_CHANGE);

    // 5. 다시 100으로 → 테두리가 다시 사라진다(두 방향 모두 반영).
    shown = await framesShown(page);
    await slider.fill('100');
    await expect(editorContent(page)).toContainText('threshold = 100');
    await waitFrames(page, 'edges', shown + 3);
    const back = await averageWhiteRatio(page, 'edges');
    expect(back, `threshold 100 again: ${back} < 20: ${low}`).toBeLessThan(low - MIN_RATIO_CHANGE);

    const totalMs = elapsed();
    const seconds = (ms: number) => (ms / 1000).toFixed(1);
    const summary = `[scenario-a] 홈 → 실습실 준비 ${seconds(readyMs)}초 → 첫 에지 ${seconds(edgeMs)}초 → 슬라이더 효과 ${seconds(sliderMs)}초 (총 ${seconds(totalMs)}초) · 흰 픽셀 비율 100:${(base * 100).toFixed(2)}% → 20:${(low * 100).toFixed(2)}% → 100:${(back * 100).toFixed(2)}%`;
    console.log(summary);
    test.info().annotations.push({ type: 'scenario-a', description: summary });
    expect(totalMs).toBeLessThan(SCENARIO_LIMIT_MS);
    expect(errors).toEqual([]);

    // 정리: [정지]로 멈춘다(카메라 대기 지점에서 바로 멈춘다).
    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', /^(stopped|killed)$/u, { timeout: 10_000 });
  });
});
