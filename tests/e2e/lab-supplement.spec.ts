// 보충 V1~V5 예제 브라우저 테스트(PLAN §8.2 P2-07 완료 기준 "다섯 예제가 가짜 카메라·샘플 이미지로 끝까지 돈다").
//
// 확인하는 것
//  1. examples/vision/supplement/ 의 다섯 예제가 [예제 불러오기] 목록에 있고, 가짜 카메라(playwright.config.ts의 합성 영상 640×480)로
//     끝까지 돌아 출력 창에 그림이 그려지며, 화면 [q] 키로 정상 종료(outcome ok)된다. 콘솔에 오류·초기화 알림이 없다.
//  2. 카메라가 없는 컴퓨터를 위한 샘플 입력(움직이는 도형)으로도 다섯 예제가 똑같이 돈다.
//  3. 예제마다 조절 값(# @slider·@select)이 하나씩 실제로 먹는다 — 값을 움직이면 코드 글자가 바뀌고, 출력 픽셀이나 콘솔 글이 달라진다.
//  4. 차시 페이지(/learn/u1/v1~v5/)에 예제 코드 블록·확인 퀴즈 3문항·안내 상자·그림이 보이고, [실습실에서 열기] 링크가
//     ?example=vision/supplement/…를 가지며, 좁은 화면(375px)에서도 가로로 밀리지 않는다(실습실과 실제로 이어 주는 것은 P2-14).
//     이 검사만 모바일 화면에서도 돈다 — 워커·JSPI·카메라가 필요 없기 때문이다.
//  5. 다섯 예제를 돌리는 동안 사이트 밖으로 간 요청은 Pyodide·휠을 받는 jsDelivr뿐이다(SPEC §2 "서버 제로": 학생 영상은
//     브라우저 밖으로 나가지 않는다). 예제가 카메라 프레임을 numpy로 계산만 하고 아무 데도 보내지 않는 것을 요청 기록으로 확인한다.
//
// 실행: PW_BASE_URL=http://localhost:4403/ai-physical-computing/ npx playwright test tests/e2e/lab-supplement.spec.ts --project=desktop
// Pyodide(약 6MB)와 numpy·OpenCV 휠(약 14MB)을 jsDelivr에서 받으므로 첫 실행은 느리다.
import { expect, test, type Page } from '@playwright/test';
import { ALLOWED_REMOTE_ORIGINS } from '../../src/lab/runtime/config.ts';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, waitDone } from './helpers/lab.ts';
import { FRAME_TIMEOUT, averageWhiteRatio, collectRequests, openVisionLab, waitFrames } from './helpers/vision.ts';

/** 한 바퀴 평균 흰 픽셀 비율이 이만큼은 달라져야 "조절 값이 먹었다"고 본다(scenario-a.spec.ts와 같은 값). */
const MIN_RATIO_CHANGE = 0.0005;

/** 다섯 예제(계단 순서). window는 첫 cv2.imshow의 창 이름(출력 탭에서 보이는 창)이다. */
const SUPPLEMENTS = [
  {
    label: 'V1',
    id: 'supplement-v1-pixel-numbers',
    file: 'vision/supplement/v1-pixel-numbers.py',
    lesson: 'v1',
    window: 'zoom',
    hiddenWindow: 'camera',
    params: ['x', 'y', 'cells'],
    codeMark: 'INTER_NEAREST',
  },
  {
    label: 'V2',
    id: 'supplement-v2-color-gray',
    file: 'vision/supplement/v2-color-gray.py',
    lesson: 'v2',
    window: 'result',
    hiddenWindow: null,
    params: ['mode', 'show_values'],
    codeMark: 'cv2.split(frame)',
  },
  {
    label: 'V3',
    id: 'supplement-v3-threshold',
    file: 'vision/supplement/v3-threshold.py',
    lesson: 'v3',
    window: 'binary',
    hiddenWindow: 'gray',
    params: ['threshold', 'invert'],
    codeMark: 'cv2.threshold',
  },
  {
    label: 'V4',
    id: 'supplement-v4-blur-edge',
    file: 'vision/supplement/v4-blur-edge.py',
    lesson: 'v4',
    window: 'edges',
    hiddenWindow: 'blurred',
    params: ['blur_size', 'low', 'high'],
    codeMark: 'cv2.Canny',
  },
  {
    label: 'V5',
    id: 'supplement-v5-contours-shapes',
    file: 'vision/supplement/v5-contours-shapes.py',
    lesson: 'v5',
    window: 'shapes',
    hiddenWindow: 'binary',
    params: ['threshold', 'min_area', 'draw'],
    codeMark: 'findContours',
  },
] as const;

/** 화면 [q] 버튼(cv2.waitKey에 113을 보낸다) */
const SCREEN_KEY_Q = '[data-vision-key="113"]';

interface CanvasStats {
  /** 픽셀 수 */
  readonly pixels: number;
  /** 밝은(200 초과) 픽셀 비율 */
  readonly white: number;
  /** 채널별 평균 */
  readonly meanRed: number;
  readonly meanGreen: number;
  readonly meanBlue: number;
  /** 빨강 채널의 가장 어두운 값·가장 밝은 값(빈 화면인지 보려고) */
  readonly minRed: number;
  readonly maxRed: number;
  /** 파란 선(사이트 파랑 계열) 픽셀 비율 — V1의 모눈 선 수를 재는 데 쓴다 */
  readonly blueLine: number;
}

/**
 * 출력 창 캔버스의 통계. helpers/vision.ts의 whiteRatio와 달리 숨은 창(탭이 눌리지 않은 창)도 잴 수 있고
 * 채널 평균·파란 선 비율까지 한 번에 돌려준다(getImageData는 숨은 캔버스에서도 된다).
 */
async function canvasStats(page: Page, windowName: string): Promise<CanvasStats> {
  return page.locator(`canvas[data-vision-window="${windowName}"]`).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) {
      return { pixels: 0, white: 0, meanRed: 0, meanGreen: 0, meanBlue: 0, minRed: 0, maxRed: 0, blueLine: 0 };
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = canvas.width * canvas.height;
    let white = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    let blueLine = 0;
    let minRed = 255;
    let maxRed = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (r > 200) {
        white += 1;
      }
      if (b > 140 && b - r > 60) {
        blueLine += 1;
      }
      if (r < minRed) {
        minRed = r;
      }
      if (r > maxRed) {
        maxRed = r;
      }
      red += r;
      green += g;
      blue += b;
    }
    return {
      pixels,
      white: white / pixels,
      meanRed: red / pixels,
      meanGreen: green / pixels,
      meanBlue: blue / pixels,
      minRed,
      maxRed,
      blueLine: blueLine / pixels,
    };
  });
}

/** 출력 창이 여러 장 그려질 만큼 기다린다(합성 영상은 15fps로 온다). */
async function waitMoreFrames(page: Page, windowName: string, extra = 3): Promise<void> {
  const before = await framesOf(page);
  await waitFrames(page, windowName, before + extra);
}

async function framesOf(page: Page): Promise<number> {
  const text = (await page.locator('[data-vision-output-status]').textContent()) ?? '';
  const match = /(\d+)장/u.exec(text);
  return match ? Number(match[1]) : 0;
}

/** [예제 불러오기] 목록에서 예제를 골라 불러온다. */
async function loadExample(page: Page, id: string): Promise<void> {
  await page.locator('[data-lab-example-select]').selectOption(id);
  await page.getByRole('button', { name: '예제 불러오기', exact: true }).click();
  await expect(labRoot(page)).toHaveAttribute('data-example', id);
}

/** 조절 막대를 움직인다(패널이 코드 글자도 함께 바꾼다). */
async function setSlider(page: Page, name: string, value: string): Promise<void> {
  await page.locator(`[data-lab-param="${name}"] input[type="range"]`).fill(value);
  await expect(page.locator(`[data-lab-param="${name}"]`)).toHaveAttribute('data-value', value);
}

/**
 * 에디터에 그 글자가 보이는지 본다. CodeMirror는 화면에 보이는 줄만 그리므로(창 밖으로 나간 줄은 DOM에 없다)
 * 먼저 에디터를 화면 안으로 되돌린 뒤 본다(2026-09-16: 조절 패널로 스크롤한 뒤 위쪽 줄이 사라져 실패).
 */
async function expectCodeContains(page: Page, text: string): Promise<void> {
  // 창 스크롤로 에디터 윗부분이 화면 밖에 있으면 CodeMirror가 그 줄들을 그리지 않는다 → 에디터 맨 위를 화면 맨 위에 맞춘다.
  await page.locator('[data-lab-editor]').evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
  });
  await page.locator('[data-lab-editor] .cm-scroller').evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page.locator('[data-lab-editor] .cm-content')).toContainText(text);
}

/** 출력 창이 빈 화면이 아니라 실제로 그림이 그려졌는지 본다(밝기가 고르지 않다). */
function expectDrawn(stats: CanvasStats, label: string): void {
  expect(stats.pixels, `${label} 창 크기`).toBeGreaterThan(0);
  expect(stats.maxRed - stats.minRed, `${label} 밝기 폭(빈 화면이면 0)`).toBeGreaterThan(30);
  expect(stats.maxRed, `${label} 가장 밝은 값`).toBeGreaterThan(60);
}

test.describe('보충 V1~V5 예제(가짜 카메라·샘플 입력)', () => {
  test.describe.configure({ timeout: 900_000 });

  test('다섯 예제가 가짜 카메라로 끝까지 돌고(출력 창에 그림, [q]로 정상 종료) 조절 값이 하나씩 먹는다', async ({ page, isMobile }) => {
    // 워커·JSPI·카메라 동작은 데스크톱에서만 확인한다(차시 페이지 검사는 모바일에서도 돈다).
    test.skip(isMobile, '워커·JSPI·카메라 동작은 데스크톱 Chromium에서 확인한다');
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const requests = collectRequests(page);
    await openVisionLab(page, `?example=${encodeURIComponent(SUPPLEMENTS[0].file)}`);
    await expect(labRoot(page)).toHaveAttribute('data-jspi', 'yes');

    for (const example of SUPPLEMENTS) {
      const startedAt = Date.now();
      await test.step(`보충 ${example.label} — ${example.file}`, async () => {
        if ((await labRoot(page).getAttribute('data-example')) !== example.id) {
          await loadExample(page, example.id);
        }
        await expectCodeContains(page, example.codeMark);
        // 조절 값 규약이 경고 없이 패널이 된다.
        await expect(page.locator('[data-lab-params]')).toHaveAttribute('data-count', String(example.params.length));
        await expect(page.locator('[data-lab-params]')).toHaveAttribute('data-warnings', '0');
        const names = await page
          .locator('[data-lab-param]')
          .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.labParam));
        expect(names).toEqual([...example.params]);

        await page.getByRole('button', { name: '실행', exact: true }).click();
        await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open', { timeout: FRAME_TIMEOUT });
        await waitFrames(page, example.window, 4);

        // 출력 창에 실제로 그림이 그려진다(빈 화면이 아니라 밝은 곳과 어두운 곳이 함께 있다).
        const stats = await canvasStats(page, example.window);
        expectDrawn(stats, `${example.label} ${example.window}`);
        console.log(
          `[lab-supplement] ${example.label} ${example.window}: 흰 픽셀 ${(stats.white * 100).toFixed(2)}% · 평균(R,G,B) ` +
            `${stats.meanRed.toFixed(0)},${stats.meanGreen.toFixed(0)},${stats.meanBlue.toFixed(0)}`,
        );
        if (example.hiddenWindow) {
          // 두 번째 cv2.imshow 창도 만들어진다(탭이 눌리지 않아 숨어 있어도 그림은 들어 있다).
          const second = await canvasStats(page, example.hiddenWindow);
          expect(second.pixels, `${example.label} ${example.hiddenWindow} 창`).toBeGreaterThan(0);
        }

        // 예제마다 조절 값 하나를 움직여 결과가 달라지는 것을 본다(실행 중 반영).
        await checkParamEffect(page, example.label);

        // 화면 [q] 버튼 → cv2.waitKey가 ord('q')를 받아 반복이 끝난다(정상 종료).
        await page.locator(SCREEN_KEY_Q).click();
        expect(await waitDone(page, 30_000), `${example.label} 종료 결과`).toBe('ok');
        await expect(page.locator('[data-lab-result]')).toHaveText('실행이 끝났어요.');
        console.log(`[lab-supplement] ${example.label} 한 바퀴 ${((Date.now() - startedAt) / 1000).toFixed(1)}초`);
      });
    }

    // 실행 준비(reset_for_run)나 흉내 모듈에서 오류가 나면 콘솔에 알림이 남는다(PROGRESS 미해결 25번).
    await expect(page.locator('[data-lab-console]')).not.toContainText('초기화 중 오류');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
    expect(pageErrors).toEqual([]);

    // 다섯 예제를 다 돌리는 동안 사이트 밖으로 간 요청은 jsDelivr(Pyodide·numpy·OpenCV 휠)뿐이다 — 카메라 영상은 나가지 않는다.
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of requests.origins) {
      expect([pageOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
    console.log(`[lab-supplement] 요청 ${requests.urls.length}건 · 주소 ${[...requests.origins].join(', ')}`);
  });

  test('카메라가 없어도 되는 샘플 입력(움직이는 도형)으로 다섯 예제가 끝까지 돈다', async ({ page, isMobile }) => {
    test.skip(isMobile, '워커·JSPI·카메라 동작은 데스크톱 Chromium에서 확인한다');
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await openVisionLab(page, `?example=${encodeURIComponent(SUPPLEMENTS[0].file)}`);

    // 입력 소스를 샘플로 바꾼다(웹캠 권한이 없는 교실 컴퓨터와 같은 상태).
    await page.locator('[data-vision-source-select]').selectOption('sample');
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'sample');

    for (const example of SUPPLEMENTS) {
      await test.step(`보충 ${example.label} — 샘플 입력`, async () => {
        if ((await labRoot(page).getAttribute('data-example')) !== example.id) {
          await loadExample(page, example.id);
        }
        await page.getByRole('button', { name: '실행', exact: true }).click();
        await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open', { timeout: FRAME_TIMEOUT });
        await waitFrames(page, example.window, 3);
        const stats = await canvasStats(page, example.window);
        expectDrawn(stats, `${example.label} 샘플 입력 ${example.window}`);
        console.log(`[lab-supplement] ${example.label} 샘플 입력 ${example.window}: 흰 픽셀 ${(stats.white * 100).toFixed(2)}% · 평균 ${stats.meanRed.toFixed(1)}`);
        await page.locator(SCREEN_KEY_Q).click();
        expect(await waitDone(page, 30_000), `${example.label} 샘플 입력 종료 결과`).toBe('ok');
      });
    }
    await expect(page.locator('[data-vision-source-select]')).toHaveValue('sample');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
    expect(pageErrors).toEqual([]);
  });

  test('차시 V1~V5 페이지에 예제 코드와 그림이 보이고 [실습실에서 열기] 링크가 ?example=을 가진다', async ({ page }) => {
    for (const example of SUPPLEMENTS) {
      await test.step(`차시 ${example.lesson}`, async () => {
        const response = await page.goto(withBase(`learn/u1/${example.lesson}/`));
        expect(response?.status()).toBe(200);
        // 따라하기 칸의 예제 코드 블록(파일 경로와 코드가 그대로 보인다)
        const figure = page.locator(`figure.lesson-example[data-example-file="${example.file}"]`);
        await expect(figure).toHaveCount(1);
        await expect(figure).toContainText(`examples/${example.file}`);
        await expect(figure.locator('pre.lesson-code')).toContainText(example.codeMark);
        // [실습실에서 열기] 링크(P2-14에서 "(준비 중)"을 뗀다)
        const link = figure.getByRole('link');
        await expect(link).toHaveCount(1);
        const href = (await link.getAttribute('href')) ?? '';
        expect(href).toContain(withBase('labs/vision/'));
        expect(href).toContain(`?example=${encodeURIComponent(example.file)}`);
        // 핵심 개념의 그림(사이트가 직접 그린 SVG)이 실제로 받아진다.
        const image = page.locator('img[src*="/images/lessons/supplement/"]').first();
        await expect(image).toHaveCount(1);
        // 차시 그림은 loading="lazy"라, Phase 5에서 "왜 배울까" 그림이 앞에 생긴 뒤로는 화면으로 끌어와야 받아진다(2026-09-25 통합).
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(
            () =>
              image.evaluate((element) => {
                const img = element as HTMLImageElement;
                return img.complete && img.naturalWidth > 0;
              }),
            { message: `${example.lesson} 그림` },
          )
          .toBe(true);
        await expect(image).toHaveAttribute('alt', /.{40,}/u);
        // 안내 상자 두 가지와 교사용 접기
        await expect(page.locator('[data-box="why"]')).toHaveCount(1);
        await expect(page.locator('[data-box="try"]')).toHaveCount(1);
        await expect(page.locator('[data-box="teacher"]')).toHaveCount(1);
        // 확인 퀴즈 3문항(SPEC §7.2 7번)
        await expect(page.locator('[data-quiz-item]')).toHaveCount(3);
        // 그림이 720 단위로 그려져 있어도 좁은 화면에서 페이지가 옆으로 밀리지 않는다(모바일 375px에서도 돈다).
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${example.lesson} 가로 넘침`).toBeLessThanOrEqual(0);
      });
    }
  });
});

/**
 * 예제마다 조절 값 하나를 움직여 "다음 프레임부터 반영"을 확인한다.
 * 합성 영상(15fps)은 장마다 도형이 조금씩 움직이므로, 값의 차이가 확실히 드러나는 지표만 본다.
 */
async function checkParamEffect(page: Page, label: string): Promise<void> {
  const console_ = page.locator('[data-lab-console]');
  switch (label) {
    case 'V1': {
      // 한 변에 볼 픽셀 수(cells)를 4 → 16으로 늘리면 모눈 선이 5줄에서 17줄로 늘어 파란 선 픽셀이 많아진다.
      await setSlider(page, 'cells', '4');
      await waitMoreFrames(page, 'zoom', 3);
      const few = await canvasStats(page, 'zoom');
      await setSlider(page, 'cells', '16');
      await waitMoreFrames(page, 'zoom', 3);
      const many = await canvasStats(page, 'zoom');
      console.log(`[lab-supplement] V1 모눈 선 픽셀: cells=4 ${(few.blueLine * 100).toFixed(2)}% → cells=16 ${(many.blueLine * 100).toFixed(2)}%`);
      expect(few.blueLine).toBeGreaterThan(0);
      expect(many.blueLine).toBeGreaterThan(few.blueLine * 1.5);
      await expectCodeContains(page, 'cells = 16');
      break;
    }
    case 'V2': {
      // mode를 red로 바꾸면 빨강 채널만 남아 파랑 평균이 거의 0이 된다(원본은 회색에 가까워 R≈B).
      const gray = await canvasStats(page, 'result');
      expect(Math.abs(gray.meanRed - gray.meanBlue)).toBeLessThan(20);
      await page.locator('[data-lab-param="mode"] select').selectOption('red');
      await expectCodeContains(page, 'mode = "red"');
      await waitMoreFrames(page, 'result', 4);
      const red = await canvasStats(page, 'result');
      console.log(`[lab-supplement] V2 평균 파랑: gray ${gray.meanBlue.toFixed(0)} → red ${red.meanBlue.toFixed(0)}`);
      expect(red.meanBlue).toBeLessThan(gray.meanBlue * 0.5);
      expect(red.meanRed).toBeGreaterThan(red.meanBlue + 30);
      break;
    }
    case 'V3': {
      // 기준을 220 → 40으로 내리면 흰 부분이 늘고, 콘솔에 바뀐 기준이 찍힌다.
      await setSlider(page, 'threshold', '220');
      await waitMoreFrames(page, 'binary', 4);
      const high = await canvasStats(page, 'binary');
      await setSlider(page, 'threshold', '40');
      await waitMoreFrames(page, 'binary', 4);
      const low = await canvasStats(page, 'binary');
      console.log(`[lab-supplement] V3 흰 픽셀: 기준 220 ${(high.white * 100).toFixed(1)}% → 기준 40 ${(low.white * 100).toFixed(1)}%`);
      expect(low.white).toBeGreaterThan(high.white + 0.05);
      await expect(console_).toContainText('기준 40');
      break;
    }
    case 'V4': {
      // 위 기준(high)을 250 → 40으로 내리면 희미한 밝기 차이도 테두리가 되어 흰 선이 늘어난다.
      // 합성 영상은 장마다 도형이 움직여 에지 픽셀이 ±0.06%쯤 흔들리고 이 차이가 한 장 비교(약 0.1%)와 비슷해서,
      // 한 장만 재면 결과가 뒤집힌다(2026-09-16 실측: 0.91% → 0.82%). 시나리오 A와 같이 한 바퀴 넘게 평균 내 비교한다.
      await setSlider(page, 'high', '250');
      await waitMoreFrames(page, 'edges', 4);
      const strict = await averageWhiteRatio(page, 'edges');
      await setSlider(page, 'high', '40');
      await waitMoreFrames(page, 'edges', 4);
      const loose = await averageWhiteRatio(page, 'edges');
      console.log(
        `[lab-supplement] V4 에지 픽셀(한 바퀴 평균): high=250 ${(strict * 100).toFixed(2)}% → high=40 ${(loose * 100).toFixed(2)}%`,
      );
      expect(loose, `high 40: ${loose} > 250: ${strict}`).toBeGreaterThan(strict + MIN_RATIO_CHANGE);
      expect(loose).toBeLessThan(0.5);
      await expectCodeContains(page, 'high = 40');
      break;
    }
    case 'V5': {
      // 무시할 최소 넓이를 크게 올리면 남는 덩어리가 없어져 콘솔에 "찾은 덩어리 0개"가 찍힌다.
      await expect(console_).toContainText('찾은 덩어리');
      await setSlider(page, 'min_area', '20000');
      await expect(console_).toContainText('찾은 덩어리 0개', { timeout: 30_000 });
      await expectCodeContains(page, 'min_area = 20000');
      break;
    }
    default:
      throw new Error(`조절 값 검사를 적지 않은 예제: ${label}`);
  }
}
