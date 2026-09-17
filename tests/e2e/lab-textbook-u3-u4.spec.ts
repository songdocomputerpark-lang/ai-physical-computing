// 교과서 3단원 3-1-4·4단원 4-1-1~4-1-3의 PC 쪽 예제(f090~f097)가 영상처리 실습실에서 **고치지 않고** 도는지 본다
// (PLAN §8.2 P2-09·P2-11·P2-12 완료 기준의 예제 목록 — 2026-09-17 Phase 2 검토 반영으로 이관).
//
// 예제 스모크(examples-smoke.spec.ts)는 "파이썬 오류로 끝나지 않는다"만 본다. 여기서는 예제마다 **하려던 일이 실제로 일어나는지**까지 본다:
//   f090 손동작으로 화면 캡처 → 창에 손 뼈대가 그려지고, 엄지가 검지보다 올라가면 screenshot.png가 '내 파일'에 생김
//   f091 검지로 커서 움직이기 → 가상 데스크톱 커서가 처음 자리(960, 540)에서 움직임
//   f092 웹캠 켜기 → 창이 뜨고 q로 끝남
//   f093 얼굴 그물망 → 초록 선이 그려짐
//   f094 눈·코 점 → refine_landmarks=True의 468·473번까지 빨간 점이 찍힘(IndexError 없음)
//   f095 코로 커서 움직이기 → 화면 크기 1920×1080을 읽고, 기준점을 잡은 뒤 커서가 움직임
//   f096 눈 깜박임 표시 → 창에 글자·점이 그려지고 q로 끝남
//   f097 두 눈 깜박임으로 오른쪽 클릭 → 재생 입력 '눈 깜빡이기'에서 "우클릭 실행!"이 콘솔에 나옴
// 카메라 없이 합성 재생 입력(PD-30)만 쓴다. 모델 파일(.task)이 없어도 돈다.
//
// 실행: PW_BASE_URL=http://localhost:4501/ai-physical-computing/ npx playwright test tests/e2e/lab-textbook-u3-u4.spec.ts --project=desktop
import { expect, test, type Page } from '@playwright/test';
import { labRoot, waitDone } from './helpers/lab.ts';
import { FRAME_TIMEOUT, openVisionLab, waitFrames } from './helpers/vision.ts';

async function chooseSource(page: Page, id: string): Promise<void> {
  await page.locator('[data-vision-source-select]').selectOption(id);
  await expect(labRoot(page)).toHaveAttribute('data-vision-source', id);
}

async function chooseSequence(page: Page, id: string): Promise<void> {
  await page.locator('[data-mediapipe-sequence]').selectOption(id);
  await expect(labRoot(page)).toHaveAttribute('data-mediapipe-replay', id);
}

/** [예제 불러오기]로 예제를 올린다(사이드카 packages — f090의 Pillow — 도 함께 받도록 목록에서 고른다). */
async function loadExample(page: Page, id: string): Promise<void> {
  await page.locator('[data-lab-example-select]').selectOption(id);
  await page.locator('[data-lab-example-load]').click();
  await expect(labRoot(page)).toHaveAttribute('data-example', id);
  await page.getByRole('button', { name: '콘솔 지우기', exact: true }).click();
}

async function run(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
}

/** 출력 화면에 초점을 두고 키를 눌러 예제의 반복문을 끝낸다. */
async function pressStopKey(page: Page, key: string): Promise<void> {
  await page.locator('[data-vision-output-stage]').focus();
  await page.keyboard.press(key);
}

async function consoleText(page: Page): Promise<string> {
  return (await page.locator('[data-lab-console]').textContent()) ?? '';
}

/** 출력 창에서 조건에 맞는 픽셀 수 */
async function countPixels(page: Page, windowName: string, kind: 'drawn' | 'green' | 'red'): Promise<number> {
  return page.locator(`canvas[data-vision-window="${windowName}"]`).evaluate((element, which) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) {
      return -1;
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (which === 'drawn' ? r > 40 || g > 40 || b > 40 : which === 'green' ? g > 200 && r < 80 && b < 80 : r > 200 && g < 60 && b < 60) {
        count += 1;
      }
    }
    return count;
  }, kind);
}

/** 가상 데스크톱 커서 글("커서 (960, 540) · 모니터 1920×1080")의 좌표 */
async function cursorPosition(page: Page): Promise<[number, number] | null> {
  const text = (await page.locator('[data-desktop-cursor]').textContent()) ?? '';
  const match = /커서 \((\d+), (\d+)\)/u.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

test.describe('교과서 3·4단원 PC 쪽 예제(f090~f097) — 재생 입력', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI·재생 입력 동작은 데스크톱에서 확인한다(같은 파이썬·같은 흉내 모듈)');
  test.describe.configure({ timeout: 360_000 });

  test('3-1-4 손으로 컴퓨터 조작(f090 화면 캡처·f091 검지 커서)', async ({ page }) => {
    const leaked: string[] = [];
    page.on('pageerror', (error) => leaked.push(error.message));
    await openVisionLab(page, `?example=${encodeURIComponent('vision/u3/3-1-4-hand-screenshot.py')}`);
    await chooseSource(page, 'replay');

    // f090: 손 뼈대가 그려지고, 재생 동작 '손가락 0~5개 펴기'에서 엄지 끝이 검지 끝보다 올라가는 순간 가상 데스크톱 화면을 찍어
    // screenshot.png를 저장한다('내 파일' 목록에 [내려받기]로 올라옴). 원본의 종료 키 q로 끝난다.
    await expect(labRoot(page)).toHaveAttribute('data-example', 'u3-3-1-4-hand-screenshot');
    await chooseSequence(page, 'count');
    await run(page);
    await waitFrames(page, 'Hand Gesture Screenshot', 3);
    expect(await countPixels(page, 'Hand Gesture Screenshot', 'drawn')).toBeGreaterThan(100);
    await expect(page.locator('[data-desktop-file-list]'), '손동작으로 화면을 찍지 않았어요').toContainText('screenshot.png', { timeout: 30_000 });
    const files = (await page.locator('[data-desktop-file-list]').textContent()) ?? '';
    console.log(`[u3] f090 캡처 파일 목록: ${files.replace(/\s+/gu, ' ').trim()}`);
    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000), 'f090').toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');

    // f091: 검지 끝을 화면 크기에 곱해 커서를 옮긴다 → 가상 데스크톱 커서가 처음 자리에서 움직인다.
    await loadExample(page, 'u3-3-1-4-adv-finger-mouse');
    await chooseSequence(page, 'draw');
    await run(page);
    await waitFrames(page, 'Mouse Control', 3);
    await expect
      .poll(async () => {
        const position = await cursorPosition(page);
        return position !== null && (position[0] !== 960 || position[1] !== 540);
      }, { timeout: FRAME_TIMEOUT, message: '가상 커서가 움직이지 않았어요' })
      .toBe(true);
    console.log(`[u3] f091 커서 ${JSON.stringify(await cursorPosition(page))}`);
    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000), 'f091').toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
    expect(leaked).toEqual([]);
  });

  test('4-1-1 얼굴 인식(f092 웹캠 켜기·f093 그물망·f094 눈코 점)', async ({ page }) => {
    const leaked: string[] = [];
    page.on('pageerror', (error) => leaked.push(error.message));
    await openVisionLab(page, `?example=${encodeURIComponent('vision/u4/4-1-1-camera-test.py')}`);

    // f092: 샘플 입력으로 창이 뜨고 q로 끝난다.
    await chooseSource(page, 'sample');
    await run(page);
    await waitFrames(page, 'Camera Feed', 3);
    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000), 'f092').toBe('ok');

    // f093: 재생 얼굴에 초록 그물망(FACEMESH_TESSELATION)이 그려진다.
    await chooseSource(page, 'replay');
    await loadExample(page, 'u4-4-1-1-face-mesh-net');
    await chooseSequence(page, 'face-turn');
    await run(page);
    await waitFrames(page, 'Camera Feed', 3);
    await expect.poll(() => countPixels(page, 'Camera Feed', 'green'), { timeout: FRAME_TIMEOUT }).toBeGreaterThan(500);
    console.log(`[u4] f093 초록 그물 ${await countPixels(page, 'Camera Feed', 'green')}픽셀`);
    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000), 'f093').toBe('ok');

    // f094: refine_landmarks=True라 468·473번(눈 가운데)까지 있어 IndexError 없이 빨간 점 세 개가 찍힌다.
    await loadExample(page, 'u4-4-1-1-adv-eye-nose-points');
    await run(page);
    await waitFrames(page, 'Camera Feed', 3);
    await expect.poll(() => countPixels(page, 'Camera Feed', 'red'), { timeout: FRAME_TIMEOUT }).toBeGreaterThan(60);
    console.log(`[u4] f094 빨간 점 ${await countPixels(page, 'Camera Feed', 'red')}픽셀`);
    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000), 'f094').toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
    expect(leaked).toEqual([]);
  });

  test('4-1-2·4-1-3 얼굴로 마우스 조작(f095 코 커서·f096 눈 깜박임·f097 깜박임 클릭)', async ({ page }) => {
    const leaked: string[] = [];
    page.on('pageerror', (error) => leaked.push(error.message));
    await openVisionLab(page, `?example=${encodeURIComponent('vision/u4/4-1-2-adv-nose-mouse.py')}`);
    await chooseSource(page, 'replay');

    // f095: 가상 모니터 크기를 읽고, 처음 30장으로 기준점을 잡은 뒤 코가 움직인 만큼 커서를 옮긴다.
    await chooseSequence(page, 'face-turn');
    await run(page);
    await expect(page.locator('[data-lab-console]')).toContainText('내 컴퓨터 화면 크기: 1920 x 1080', { timeout: FRAME_TIMEOUT });
    await waitFrames(page, 'Nose Mouse Control', 3);
    await expect
      .poll(async () => {
        const position = await cursorPosition(page);
        return position !== null && (position[0] !== 960 || position[1] !== 540);
      }, { timeout: FRAME_TIMEOUT, message: '기준점을 잡은 뒤에도 가상 커서가 움직이지 않았어요' })
      .toBe(true);
    console.log(`[u4] f095 커서 ${JSON.stringify(await cursorPosition(page))}`);
    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000), 'f095').toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('프로그램이 종료되었습니다.');

    // f096: 눈 깜박임(EAR) 글자와 점이 창에 그려지고 q로 끝난다.
    await loadExample(page, 'u4-4-1-3-blink-ear');
    await chooseSequence(page, 'face-blink');
    await run(page);
    await waitFrames(page, 'Nose Mouse Control + Eye Blink Detection', 3);
    expect(await countPixels(page, 'Nose Mouse Control + Eye Blink Detection', 'drawn')).toBeGreaterThan(200);
    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000), 'f096').toBe('ok');

    // f097: 재생 입력의 '눈 깜빡이기'는 두 눈을 함께 감으므로(EAR 0.1 이하) 오른쪽 클릭이 일어난다.
    await loadExample(page, 'u4-4-1-3-adv-blink-click');
    await chooseSequence(page, 'face-blink');
    await run(page);
    await waitFrames(page, 'Nose Mouse Control + Eye Blink Detection', 3);
    await expect
      .poll(async () => (await consoleText(page)).includes('우클릭 실행!'), { timeout: 30_000, message: '두 눈을 감아도 오른쪽 클릭이 일어나지 않았어요' })
      .toBe(true);
    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000), 'f097').toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
    expect(leaked).toEqual([]);
  });
});
