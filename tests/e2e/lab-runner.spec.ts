/**
 * 러너 공통 모듈(src/lab/modules/runtime-extras/, P2-10)의 브라우저 테스트.
 *
 * 확인하는 것(CODE_MAPPING §3.3 RUN·IN·FS·FONT):
 *  1. 가상 파일 — 사이트가 직접 그린 mask.png(assets/mask.svg → 브라우저가 PNG로)가 작업 폴더에 들어가고 cv2.imread가 투명도까지 읽는다(f039),
 *     코드가 저장한 파일은 파일 패널에서 [내려받기]로 진짜 파일이 된다. 사이트 자신·jsDelivr 밖 요청은 0건.
 *  2. f039 사이트판 — 교과서 원본의 파이썬 3중 반복과 사이트판의 numpy 한 줄이 같은 그림을 만들고, 사이트판이 훨씬 빠르다(실측 시간을 콘솔에 남김).
 *  3. exit()·quit()·sys.exit()·__name__ == '__main__' — 브라우저 Pyodide에 이미 있어 러너가 따로 넣을 것이 없다(CODE_MAPPING §3.3 RUN).
 *  4. input() — 콘솔에 안내글이 보이고 입력줄에 넣은 값이 파이썬으로 간다(f084). 제한 모드(?limited=1)는 한국어로 안내한다.
 *  5. [파일 넣기] — 넣은 파일을 코드가 읽고, 라이브러리 이름을 가리는 파일(cv2.py)은 넣지 않고 한국어로 알린다.
 *  6. 정지 2단계(파이썬 다시 시작) 뒤에도 사이트 파일과 넣어 둔 파일이 작업 폴더에 다시 들어간다.
 *  7. 콘솔 오래된 줄 접기 — 수백 줄을 찍어도 화면이 짧게 유지되고 [펼치기]로 볼 수 있으며 [콘솔 지우기]가 함께 지운다.
 *  8. 글꼴 경로 연결 — 'C:/Windows/Fonts/malgun.ttf'처럼 없는 경로를 사이트 글꼴 파일로 바꿔 PIL이 연다(f043의 5·13·14·54~58행).
 *     사이트 글꼴이 아직 없으면 멈추지 않고 한국어로 알린다.
 *
 * 개발용 시험 페이지(/labs/dev/runtime/, labId 'dev')에서 돌린다 — 이 모듈은 labs '*'라 모든 실습실에 붙고, 카메라가 없어도 되는 이 페이지가 빠르다.
 * 병렬 제작: ASTRO_DEV_BACKGROUND=1 npm run dev -- --port 4405 뒤
 *   PW_BASE_URL=http://localhost:4405/ai-physical-computing/ npx playwright test tests/e2e/lab-runner.spec.ts --project=desktop
 * (Astro 7은 한 프로젝트에 개발 서버를 하나만 띄우므로, 다른 사람이 먼저 띄웠으면 그 포트를 함께 쓴다.
 *  여러 사람이 동시에 돌릴 때는 --output=<내 폴더>를 줘야 서로의 test-results/를 지우지 않는다.)
 */
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { SITE_FONT_FILE } from '../../src/lab/modules/runtime-extras/assets.ts';
import { labRoot, openLabAndWaitReady, runCode, waitDone } from './helpers/lab.ts';
import { collectRequests } from './helpers/vision.ts';

/** OpenCV·Pillow 휠까지 받는 시간 */
const PACKAGES_TIMEOUT = 150_000;
/** 시험용 진짜 글꼴 파일(설치된 playwright-core의 codicon.ttf). 없으면 글꼴 연결 검사는 건너뛴다. */

const consoleBox = (page: Page) => page.locator('[data-lab-console]');
const filesPanel = (page: Page) => page.locator('[data-lab-module-panel="runtime-extras"]');
const fileItem = (page: Page, name: string) => page.locator(`[data-runtime-extras-file="${name}"]`);

/** 콘솔에서 접기 요소를 뺀 출력 조각 수 */
function visibleChunks(page: Page): Promise<number> {
  return consoleBox(page).evaluate(
    (box) => Array.from(box.children).filter((child) => !('runtimeExtrasFold' in (child as HTMLElement).dataset) && !('runtimeExtrasFoldToggle' in (child as HTMLElement).dataset)).length,
  );
}

test.describe('러너 공통(가상 파일·input()·콘솔 접기·글꼴)', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI 동작은 데스크톱 Chromium에서 확인한다');
  test.describe.configure({ timeout: 300_000 });

  test('사이트가 그린 mask.png를 cv2가 읽고, 코드가 저장한 파일을 내려받는다(허용 주소 밖 요청 0건)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests = collectRequests(page);
    await openLabAndWaitReady(page);

    // 모듈이 붙고 파일 패널이 열렸다. 사이트 파일 mask.png가 작업 폴더에 들어가 있다(그림이라 작은 미리 보기도 보인다).
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /\bruntime-extras\b/u);
    await expect(filesPanel(page)).toBeVisible();
    await expect(fileItem(page, 'mask.png')).toBeVisible();
    await expect(fileItem(page, 'mask.png')).toHaveAttribute('data-kind', 'provided');
    await expect(fileItem(page, 'mask.png').locator('img.file__thumb')).toHaveCount(1);

    await runCode(
      page,
      [
        'import cv2',
        'mask = cv2.imread("mask.png", cv2.IMREAD_UNCHANGED)',
        'print("가면", mask.shape, int(mask[:, :, 3].max()), int(mask[0, 0, 3]))',
        'small = cv2.resize(mask, (40, 50))',
        'cv2.imwrite("결과.png", small)',
        'print("저장 끝")',
      ].join('\n'),
    );
    expect(await waitDone(page, PACKAGES_TIMEOUT)).toBe('ok');
    // f039가 쓰는 모양 그대로: 세로 500 × 가로 400, 알파 채널 있음(가면 안은 불투명, 모서리는 투명)
    await expect(consoleBox(page)).toContainText('가면 (500, 400, 4) 255 0');
    await expect(consoleBox(page)).toContainText("코드가 '결과.png'");

    // 코드가 저장한 파일이 패널에 생기고 진짜 파일로 내려받아진다.
    const saved = fileItem(page, '결과.png');
    await expect(saved).toBeVisible();
    await expect(saved).toHaveAttribute('data-kind', 'saved');
    const [download] = await Promise.all([page.waitForEvent('download'), saved.getByRole('button', { name: /내려받기/u }).click()]);
    expect(download.suggestedFilename()).toBe('결과.png');
    const downloadedPath = await download.path();
    const bytes = fs.readFileSync(downloadedPath);
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // PNG 머리
    expect(bytes.length).toBeGreaterThan(50);

    // 학생 영상·파일은 브라우저 밖으로 나가지 않는다: 사이트 자신과 Pyodide CDN 말고는 요청이 없다.
    const allowed = new Set([new URL(page.url()).origin, 'https://cdn.jsdelivr.net']);
    expect([...requests.origins].filter((origin) => !allowed.has(origin))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('f039 사이트판의 numpy 합성이 교과서 원본의 3중 반복과 같은 그림을 훨씬 빨리 만든다', async ({ page }) => {
    // 얼굴 인식(mediapipe)은 다른 묶음(P2-08·P2-09)이라 여기서는 합성 부분만 본다: 사이트가 넣어 준 mask.png를 읽어
    // ① 교과서 원본(1-3-3-adv-face-mask.py 43~51행)의 파이썬 3중 반복과 ② 사이트판(…-site.py)의 numpy 한 줄이 같은 결과인지.
    await openLabAndWaitReady(page);
    await runCode(
      page,
      [
        'import cv2, numpy as np, time',
        'mask = cv2.resize(cv2.imread("mask.png", cv2.IMREAD_UNCHANGED), (200, 250))  # 얼굴 크기 만한 가면',
        'base = np.full((480, 640, 3), 30, dtype="uint8")',
        'top_left_x, top_left_y = 150, 100',
        '',
        '# ① 교과서 원본 방식',
        'frame1 = base.copy()',
        't0 = time.perf_counter()',
        'for y in range(mask.shape[0]):',
        '    for x in range(mask.shape[1]):',
        '        if top_left_y + y < frame1.shape[0] and top_left_x + x < frame1.shape[1]:',
        '            alpha = mask[y, x, 3] / 255.0',
        '            for c in range(3):',
        '                frame1[top_left_y + y, top_left_x + x, c] = (alpha * mask[y, x, c] + (1 - alpha) * frame1[top_left_y + y, top_left_x + x, c])',
        'loop_ms = (time.perf_counter() - t0) * 1000',
        '',
        '# ② 사이트판(벡터 합성)',
        'frame2 = base.copy()',
        't0 = time.perf_counter()',
        'y1, x1 = top_left_y + mask.shape[0], top_left_x + mask.shape[1]',
        'alpha = mask[:, :, 3:4].astype("float32") / 255.0',
        'background = frame2[top_left_y:y1, top_left_x:x1].astype("float32")',
        'frame2[top_left_y:y1, top_left_x:x1] = (alpha * mask[:, :, :3] + (1 - alpha) * background).astype("uint8")',
        'vector_ms = (time.perf_counter() - t0) * 1000',
        '',
        'print("최대 차이", int(np.abs(frame1.astype("int32") - frame2.astype("int32")).max()))',
        'print("원본 %.0fms / 사이트판 %.0fms" % (loop_ms, vector_ms))',
        'print("빠르기", int(loop_ms / max(vector_ms, 0.001)), "배")',
        'cv2.imwrite("합성.png", frame2)',
      ].join('\n'),
    );
    expect(await waitDone(page, PACKAGES_TIMEOUT)).toBe('ok');
    // 반올림 방식이 조금 달라 1까지는 같은 그림으로 본다(원본은 float64, 사이트판은 float32).
    await expect(consoleBox(page)).toContainText(/최대 차이 [01]$/mu);
    const timing = await consoleBox(page).textContent();
    const speedup = Number(/빠르기 (\d+) 배/u.exec(timing ?? '')?.[1] ?? '0');
    // 브라우저 실측값을 기록에 남긴다(Node 측정은 484ms → 6ms, 약 80배).
    console.log(`[f039 합성] ${/원본 .*$/mu.exec(timing ?? '')?.[0] ?? ''} (${speedup}배)`);
    expect(speedup).toBeGreaterThanOrEqual(10);
    await expect(fileItem(page, '합성.png')).toHaveAttribute('data-kind', 'saved');
  });

  test('exit()·quit()·sys.exit()로 끝나고 학생 코드는 __main__으로 돈다(러너가 따로 넣을 것이 없다)', async ({ page }) => {
    // CODE_MAPPING §3.3 RUN: "Pyodide에 exit 내장이 있는지는 미확인 → 없으면 러너가 넣는다" — 브라우저 Pyodide 314.0.7에 이미 있다.
    await openLabAndWaitReady(page);
    await runCode(page, ['print("이름", __name__)', 'print("exit", callable(exit), "quit", callable(quit))', 'if __name__ == "__main__":', '    print("주 프로그램")'].join('\n'));
    expect(await waitDone(page)).toBe('ok');
    await expect(consoleBox(page)).toContainText('이름 __main__');
    await expect(consoleBox(page)).toContainText('exit True quit True');
    await expect(consoleBox(page)).toContainText('주 프로그램');

    // f028처럼 카메라가 없을 때 부르는 exit()은 오류가 아니라 정상 종료다(콘솔에 빨간 오류가 나지 않는다).
    await runCode(page, ['print("전")', 'exit()', 'print("뒤")'].join('\n'));
    expect(await waitDone(page)).toBe('ok');
    await expect(consoleBox(page)).toContainText('전');
    await expect(consoleBox(page)).not.toContainText('뒤');

    await runCode(page, ['import sys', 'sys.exit(3)'].join('\n'));
    expect(await waitDone(page)).toBe('ok');
    await expect(labRoot(page)).not.toHaveAttribute('data-outcome', 'error');
  });

  test('input()이 콘솔 안내글과 입력줄로 값을 받고, 제한 모드에서는 한국어로 알린다', async ({ page }) => {
    await openLabAndWaitReady(page);
    await runCode(page, ['name = input("이름이 뭐예요? ")', 'print("안녕,", name + "!")', 'print(input("나이는? "), "살")'].join('\n'));

    // 안내글은 콘솔에, 입력칸은 콘솔 아래에 열린다.
    await expect(consoleBox(page)).toContainText('이름이 뭐예요?');
    const inputField = page.locator('[data-lab-input]');
    await expect(inputField).toBeVisible();
    await inputField.fill('민수');
    await inputField.press('Enter');
    await expect(consoleBox(page)).toContainText('안녕, 민수!');
    // 두 번째 input()도 같은 줄로 받는다.
    await expect(consoleBox(page)).toContainText('나이는?');
    await inputField.fill('17');
    await inputField.press('Enter');
    expect(await waitDone(page)).toBe('ok');
    await expect(consoleBox(page)).toContainText('17 살');
    await expect(page.locator('[data-lab-input-form]')).toBeHidden();

    // 제한 모드(JSPI 없는 브라우저 흉내): 기다릴 수 없으니 한국어로 이유를 알린다.
    await openLabAndWaitReady(page, '?limited=1');
    await expect(labRoot(page)).toHaveAttribute('data-limited', 'yes');
    await runCode(page, 'name = input("이름? ")');
    expect(await waitDone(page)).toBe('error');
    await expect(consoleBox(page)).toContainText('RuntimeError');
    await expect(consoleBox(page)).toContainText('브라우저');
  });

  test('[파일 넣기]로 넣은 파일을 코드가 읽고, 라이브러리 이름을 가리는 파일은 넣지 않는다', async ({ page }) => {
    await openLabAndWaitReady(page);
    await filesPanel(page).locator('[data-runtime-extras-file-input]').setInputFiles([
      { name: '내메모.txt', mimeType: 'text/plain', buffer: Buffer.from('안녕 파일!', 'utf8') },
      { name: 'cv2.py', mimeType: 'text/x-python', buffer: Buffer.from('VALUE = 1\n', 'utf8') },
    ]);

    // 넣은 파일은 목록에 "내가 넣음"으로, 가리는 파일은 거절 안내로
    await expect(fileItem(page, '내메모.txt')).toHaveAttribute('data-kind', 'uploaded');
    await expect(fileItem(page, 'cv2.py')).toHaveCount(0);
    await expect(consoleBox(page)).toContainText("'cv2.py'은(는) 파이썬 라이브러리 이름 'cv2'과(와) 같아서");
    await expect(filesPanel(page).locator('[data-runtime-extras-status]')).toContainText('my_cv2.py');

    // 코드가 그 파일을 읽는다(작업 폴더가 현재 폴더라 이름만 적으면 된다). 가리는 이름의 파일을 코드가 만들면 다음 실행에서 경고한다.
    await runCode(page, ['print(open("내메모.txt", encoding="utf-8").read())', 'open("numpy.py", "w", encoding="utf-8").write("x = 1\\n")'].join('\n'));
    expect(await waitDone(page)).toBe('ok');
    await expect(consoleBox(page)).toContainText('안녕 파일!');
    await expect(fileItem(page, 'numpy.py')).toHaveAttribute('data-kind', 'saved');

    await runCode(page, 'print("두 번째 실행")');
    expect(await waitDone(page)).toBe('ok');
    await expect(consoleBox(page)).toContainText("작업 폴더의 'numpy.py'");
  });

  test('파이썬을 다시 시작해도(정지 2단계) 사이트 파일과 넣어 둔 파일이 작업 폴더에 다시 들어간다', async ({ page }) => {
    await openLabAndWaitReady(page);
    await filesPanel(page).locator('[data-runtime-extras-file-input]').setInputFiles([
      { name: '내메모.txt', mimeType: 'text/plain', buffer: Buffer.from('다시 들어와요', 'utf8') },
    ]);
    await expect(fileItem(page, '내메모.txt')).toHaveAttribute('data-kind', 'uploaded');

    // 양보하지 않는 반복문이라 [정지] 1단계로는 멈추지 않는다 → 1초 뒤 워커를 끝내고 다시 띄운다(정지 2단계).
    await runCode(page, 'while True:\n    pass');
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running');
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page)).toBe('killed');
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: 90_000 });

    // 다시 뜬 파이썬의 작업 폴더에 사이트 파일과 내가 넣은 파일이 도로 들어가 있다(코드가 저장했던 것은 사라진다).
    await runCode(page, ['import os', 'print(open("내메모.txt", encoding="utf-8").read())', 'print("가면", os.path.getsize("mask.png") > 0)'].join('\n'));
    expect(await waitDone(page, PACKAGES_TIMEOUT)).toBe('ok');
    await expect(consoleBox(page)).toContainText('다시 들어와요');
    await expect(consoleBox(page)).toContainText('가면 True');
  });

  test('콘솔이 길어지면 오래된 줄을 접고 [펼치기]·[콘솔 지우기]가 된다', async ({ page }) => {
    await openLabAndWaitReady(page);
    await runCode(page, ['for i in range(500):', '    print("줄", i)'].join('\n'));
    expect(await waitDone(page)).toBe('ok');

    const toggle = page.locator('[data-runtime-extras-fold-toggle]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText(/이전 출력 [\d,]+줄 접힘 — 펼치기/u);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-runtime-extras-fold]')).toBeHidden();
    // 접고 나면 화면에 남는 조각은 상한(300) 언저리이고, 마지막 줄은 그대로 보인다.
    expect(await visibleChunks(page)).toBeLessThanOrEqual(310);
    await expect(consoleBox(page)).toContainText('줄 499');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-runtime-extras-fold]')).toBeVisible();
    await expect(consoleBox(page)).toContainText('줄 0'); // 접혀 있던 첫 줄
    await toggle.click();
    await expect(page.locator('[data-runtime-extras-fold]')).toBeHidden();

    await page.getByRole('button', { name: '콘솔 지우기' }).click();
    await expect(toggle).toHaveCount(0);
    expect(await visibleChunks(page)).toBe(0);
    await expect(consoleBox(page)).not.toContainText('줄 499');
  });

  test('PC 글꼴 경로를 사이트 글꼴 파일로 바꿔 PIL이 연다(글꼴이 없으면 멈추지 않고 알린다)', async ({ page }) => {
    // f043(examples/vision/u1/1-4-2-adv-posture-korean.py)의 글꼴·한글 출력 부분 그대로: 5·13·14행과 54~58행.
    const fontCode = [
      'import cv2, numpy as np',
      'from PIL import ImageFont, ImageDraw, Image',
      'fontpath = "C:/Windows/Fonts/malgun.ttf"',
      'font = ImageFont.truetype(fontpath, 30)',
      'image = np.zeros((120, 400, 3), dtype=np.uint8)',
      'pil_img = Image.fromarray(image)',
      'draw = ImageDraw.Draw(pil_img)',
      'draw.text((30, 50), "자세가 틀어졌습니다!", font=font, fill=(0, 255, 0))',
      'draw.text((5, 5), "ab", font=font, fill=(0, 255, 0))',
      'image = np.array(pil_img)',
      'print("글꼴", type(font).__name__, int(font.size), "그린 픽셀", int((image > 0).sum()))',
    ].join('\n');

    // 사이트가 실제로 싣는 정적 글꼴(public/vendor/pretendard/Pretendard-Regular.otf — 빌드 때 npm 패키지에서 복사, P2-14)로:
    // 파이썬이 부탁하면 화면이 같은 사이트에서 받아 파일로 넣어 준다.
    await openLabAndWaitReady(page);
    await runCode(page, fontCode);
    expect(await waitDone(page, PACKAGES_TIMEOUT)).toBe('ok');
    await expect(consoleBox(page)).toContainText('맑은 고딕');
    await expect(consoleBox(page)).toContainText('Pretendard');
    await expect(consoleBox(page)).toContainText(/글꼴 FreeTypeFont 30 그린 픽셀 \d+/u);
  });

  test('사이트 글꼴 파일을 받지 못해도 멈추지 않고 "한글은 빈칸"이라고 알린다', async ({ page }) => {
    // 느린 망·빌드 실수로 글꼴 파일을 못 받는 경우. 서비스 워커가 캐시에서 먼저 줄 수 있으므로
    // 브라우저 문맥에서, 그리고 **첫 방문 전에** 막는다(캐시에 들어간 뒤에는 막아도 소용없다).
    await page.context().route(`**/${SITE_FONT_FILE}`, (route) => route.fulfill({ status: 404, body: '' }));
    await openLabAndWaitReady(page);
    await runCode(
      page,
      [
        'import numpy as np',
        'from PIL import ImageFont, ImageDraw, Image',
        'font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 30)',
        'pil_img = Image.fromarray(np.zeros((120, 400, 3), dtype=np.uint8))',
        'draw = ImageDraw.Draw(pil_img)',
        'draw.text((30, 50), "자세가 틀어졌습니다!", font=font, fill=(0, 255, 0))',
        'draw.text((5, 5), "ab", font=font, fill=(0, 255, 0))',
        'print("글꼴", type(font).__name__, int(font.size), "그린 픽셀", int((np.array(pil_img) > 0).sum()))',
      ].join('\n'),
    );
    expect(await waitDone(page, PACKAGES_TIMEOUT)).toBe('ok');
    await expect(consoleBox(page)).toContainText('한글은 빈칸');
    await expect(consoleBox(page)).toContainText(/글꼴 \w+ 30 그린 픽셀 \d+/u);
  });
});

test.describe('러너 공통 — 좁은 화면(375px)', () => {
  test.skip(({ isMobile }) => !isMobile, '모바일 화면(375px)에서만 확인한다');
  // 빌드 결과(astro preview)에서는 몇 초면 되지만, 병렬 제작에서 쓰는 개발 서버(PW_BASE_URL)는 이 페이지의 모듈을 처음 열 때
  // Vite가 그때그때 옮겨 30초를 넘을 수 있다(2026-09-16 실측 40초 이상) — 기본 30초로는 모자라 넉넉히 준다.
  test.describe.configure({ timeout: 180_000 });

  test('파일 패널이 넘치지 않고 [파일 넣기]가 손가락으로 누를 만큼 크다', async ({ page }) => {
    const response = await page.goto('labs/vision/', { timeout: 120_000 });
    expect(response?.status()).toBe(200);
    const panel = filesPanel(page);
    await expect(panel).toBeVisible({ timeout: 60_000 }); // 모듈이 붙으면 열린다(파이썬을 다 받기 전에도)
    const metrics = await page.evaluate(() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }));
    expect(metrics.overflow).toBe(0);
    // [파일 넣기]는 실습실의 다른 작은 버튼([콘솔 지우기])과 같은 크기이고, 손가락 최소 크기(24px, WCAG 2.2 목표 크기)보다 크다.
    const uploadBox = await panel.locator('[data-runtime-extras-upload]').boundingBox();
    const clearBox = await page.locator('[data-lab-console-clear]').boundingBox();
    expect(uploadBox?.height ?? 0).toBeGreaterThanOrEqual(24);
    expect(uploadBox?.height ?? 0).toBeGreaterThanOrEqual(clearBox?.height ?? 0);
    const panelBox = await panel.boundingBox();
    expect((panelBox?.width ?? 0) <= 375).toBe(true);
  });
});
