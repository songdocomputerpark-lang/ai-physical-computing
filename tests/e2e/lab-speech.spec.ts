// 음성 인식 흉내(P2-13, 선택 차시 1-4-3)의 브라우저 테스트.
// 판정 기준(PLAN §8.2 P2-13): ① 교과서 예제 f044·f045가 **글자 입력 방식**으로 끝까지 돈다
// ② 사이트 설정에서 켜지 않으면 "서버 인식" 선택지가 **DOM에 없다** ③ 내 기기 안 인식(온디바이스) 가능 여부가 보인다
// ④ 글자 입력 방식에서는 사이트·Pyodide CDN 밖으로 나가는 요청이 0건이다(SPEC §2 서버 제로, §10).
//
// 브라우저의 진짜 음성 인식은 자동 테스트에서 말을 시킬 수 없으므로, 선택지가 생기고 사라지는 규칙만
// 가짜 SpeechRecognition(addInitScript)으로 확인한다. 실제 마이크 인식은 운영자 확인 몫이다.
import { expect, test, type Page } from '@playwright/test';
import { ALLOWED_REMOTE_ORIGINS } from '../../src/lab/runtime/config.ts';
import { SERVER_RECOGNITION_KEY, SPEECH_MODE_KEY } from '../../src/lab/modules/speech/settings.ts';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, waitDone } from './helpers/lab.ts';
import { collectRequests, openVisionLab } from './helpers/vision.ts';

const SETTINGS_PATH = withBase('settings/');
const F044 = 'vision/u1/1-4-3-speech-once.py';
const F045 = 'vision/u1/1-4-3-adv-speech-keywords.py';

function panel(page: Page) {
  return page.locator('[data-lab-module-panel="speech"]');
}

/** 실습실을 열고 교과서 예제를 불러온다(차시 페이지의 [실습실에서 열기]와 같은 ?example= 주소). */
async function openSpeechLab(page: Page, file: string): Promise<void> {
  await openVisionLab(page, `?example=${file}`);
  await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /\bspeech\b/u);
  await expect(panel(page)).toBeVisible();
}

/** [실행]을 누르고 실행이 실제로 시작됐는지(run-count) 확인한다. */
async function startRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(labRoot(page)).toHaveAttribute('data-run-count', '1', { timeout: 30_000 });
}

/** 파이썬이 한 마디를 기다릴 때까지 기다렸다가 글자로 답한다. */
async function answerWithText(page: Page, text: string): Promise<void> {
  await expect(panel(page)).toHaveAttribute('data-speech-state', 'listening', { timeout: 90_000 });
  await panel(page).locator('[data-speech-input]').fill(text);
  await panel(page).getByRole('button', { name: '보내기', exact: true }).click();
}

/**
 * 가짜 음성 인식을 창에 심는다(진짜 마이크 없이 선택지 규칙만 보려고).
 * availability: SpeechRecognition.available()이 돌려줄 값. null이면 그 정적 메서드가 없는 옛 브라우저.
 */
async function fakeSpeechRecognition(page: Page, availability: string | null): Promise<void> {
  await page.addInitScript((status) => {
    class FakeSpeechRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      processLocally = false;
      onresult: unknown = null;
      onerror: unknown = null;
      onend: unknown = null;
      start(): void {}
      stop(): void {}
      abort(): void {}
      static available(): Promise<string> {
        return Promise.resolve(String(status));
      }
      static install(): Promise<boolean> {
        return Promise.resolve(true);
      }
    }
    if (status === null) {
      delete (FakeSpeechRecognition as unknown as { available?: unknown }).available;
      delete (FakeSpeechRecognition as unknown as { install?: unknown }).install;
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: FakeSpeechRecognition, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeSpeechRecognition, configurable: true });
  }, availability);
}

test.describe('음성 인식 흉내(글자 입력 방식)', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI가 필요한 실행은 데스크톱에서 확인한다');
  test.describe.configure({ timeout: 300_000 });

  test('f044 기본 실습이 글자 입력으로 끝까지 돌고, 서버 전송 선택지는 없으며, 밖으로 나가는 요청이 없다', async ({ page }) => {
    const requests = collectRequests(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await openSpeechLab(page, F044);
    await expect(labRoot(page)).toHaveAttribute('data-example', 'u1-1-4-3-speech-once');
    await expect(page.locator('[data-lab-editor] .cm-content')).toContainText('import speech_recognition as sr');

    // ② 교사가 켜지 않았으므로 "서버 인식" 선택지가 DOM에 없다. 기본은 글자 입력.
    await expect(panel(page)).toHaveAttribute('data-speech-server-allowed', 'no');
    await expect(panel(page).locator('option[value="server"]')).toHaveCount(0);
    await expect(panel(page).locator('[data-speech-mode-select]')).toHaveValue('text');
    await expect(panel(page)).toHaveAttribute('data-speech-mode-value', 'text');
    // ③ 내 기기 안 인식 가능 여부가 한 줄로 보인다.
    await expect(panel(page).locator('[data-speech-ondevice]')).toContainText('내 기기 안 인식:');

    // ① 실행 → 파이썬이 r.listen()에서 기다린다 → 글자를 보내면 그것이 인식 결과가 된다.
    await startRun(page);
    await expect(page.locator('[data-lab-console]')).toContainText('말씀하세요', { timeout: 90_000 });
    await answerWithText(page, '안녕하세요');
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('인식된 내용: 안녕하세요');
    await expect(panel(page).locator('[data-speech-last]')).toContainText('안녕하세요');

    // 브라우저 밖으로 나간 요청은 Pyodide를 받는 jsDelivr뿐이다(마이크도, 음성도 쓰지 않았다).
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of requests.origins) {
      expect([pageOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
    expect(requests.urls.filter((url) => /speech|voice|stt|recognize/iu.test(url) && !url.startsWith(pageOrigin))).toEqual([]);
    expect(errors).toEqual([]);
    await expect(page.locator('[data-lab-console]')).not.toContainText('초기화 중 오류');
  });

  test('f044에서 빈 문장이나 [안 들린 것으로 보내기]는 UnknownValueError 자리로 간다', async ({ page }) => {
    await openSpeechLab(page, F044);
    await startRun(page);
    await expect(panel(page)).toHaveAttribute('data-speech-state', 'listening', { timeout: 90_000 });
    await panel(page).getByRole('button', { name: '안 들린 것으로 보내기' }).click();
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('음성을 인식할 수 없습니다.');
  });

  test('f045 심화 실습: 시작 → 정지 → 종료 세 마디로 반복이 끝난다', async ({ page }) => {
    await openSpeechLab(page, F045);
    await expect(labRoot(page)).toHaveAttribute('data-example', 'u1-1-4-3-adv-speech-keywords');

    await startRun(page);
    await answerWithText(page, '시작');
    await expect(page.locator('[data-lab-console]')).toContainText('프로그램이 실행됩니다.', { timeout: 60_000 });
    await answerWithText(page, '정지');
    await expect(page.locator('[data-lab-console]')).toContainText('프로그램이 일시 정지되었습니다.', { timeout: 60_000 });
    await answerWithText(page, '종료');
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('프로그램을 종료합니다.');
  });

  test('제한 모드(기다릴 수 없는 브라우저)에서는 실행 전에 적어 둔 문장으로 f044가 돈다', async ({ page }) => {
    // ?limited=1은 JSPI가 없는 브라우저를 흉내 낸다(PLAN §4.5). 그 브라우저에서는 실행 중에 답을 기다릴 수 없으므로
    // 패널 칸에 미리 적어 둔 문장(setValue 'speech.text')을 쓴다.
    await openSpeechLab(page, `${F044}&limited=1`);
    await expect(labRoot(page)).toHaveAttribute('data-limited', 'yes');
    await panel(page).locator('[data-speech-input]').fill('미리 적어 둔 문장');
    await startRun(page);
    expect(await waitDone(page, 90_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('인식된 내용: 미리 적어 둔 문장');
    await expect(page.locator('[data-lab-console]')).toContainText('실행 중에 말을 받을 수 없어서');
  });

  test('[정지]를 누르면 기다리던 자리에서 멈추고 패널도 되돌아간다', async ({ page }) => {
    await openSpeechLab(page, F044);
    await startRun(page);
    await expect(panel(page)).toHaveAttribute('data-speech-state', 'listening', { timeout: 90_000 });
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, 30_000)).toBe('stopped');
    await expect(panel(page)).toHaveAttribute('data-speech-state', 'idle');
  });
});

test.describe('사이트 설정(교사용)', () => {
  // 실습실을 함께 여는 시험이 있어(파이썬·OpenCV 받기) 기본 30초로는 모자라다.
  test.describe.configure({ timeout: 300_000 });

  test('설정 페이지에서 켜고 끈 값이 이 브라우저에 남고, 실습실 선택지가 그에 따라 생겼다 사라진다', async ({ page }) => {
    await fakeSpeechRecognition(page, 'unavailable');
    const response = await page.goto(SETTINGS_PATH);
    expect(response?.status()).toBe(200);

    const setting = page.locator('[data-speech-setting]');
    await expect(setting).toHaveAttribute('data-speech-allowed', 'off');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('사이트 설정');
    await expect(setting).toContainText('14세 미만');
    await expect(setting).toContainText('브라우저 회사');
    // 온디바이스 확인 결과가 보인다(가짜 브라우저는 "안 됨").
    await expect(setting).toHaveAttribute('data-ondevice', 'unavailable', { timeout: 15_000 });
    await expect(setting.locator('[data-ondevice-status]')).toContainText('안 됨');

    // 켜기 → 이 브라우저에만 저장(localStorage)
    await setting.locator('[data-server-speech]').check();
    await expect(setting).toHaveAttribute('data-speech-allowed', 'on');
    await expect(setting.locator('[data-server-speech-saved]')).toContainText('저장했어요');
    expect(await page.evaluate((key) => window.localStorage.getItem(key), SERVER_RECOGNITION_KEY)).toBe('1');
    await page.reload();
    await expect(page.locator('[data-speech-setting] [data-server-speech]')).toBeChecked();

    // 실습실: 이제 "서버 인식" 선택지가 생긴다(고르면 저장된다)
    await openSpeechLab(page, F044);
    await expect(panel(page)).toHaveAttribute('data-speech-server-allowed', 'yes');
    await expect(panel(page).locator('option[value="server"]')).toHaveCount(1);
    await panel(page).locator('[data-speech-mode-select]').selectOption('server');
    await expect(panel(page)).toHaveAttribute('data-speech-mode-value', 'server');
    expect(await page.evaluate((key) => window.localStorage.getItem(key), SPEECH_MODE_KEY)).toBe('server');
    await expect(panel(page).locator('[data-speech-note]')).toContainText('서버로 전송');

    // 다시 끄기 → 선택지가 사라지고, 고른 방식도 글자 입력으로 되돌아간다
    await page.goto(SETTINGS_PATH);
    await page.locator('[data-speech-setting] [data-server-speech]').uncheck();
    await expect(page.locator('[data-speech-setting]')).toHaveAttribute('data-speech-allowed', 'off');
    await openSpeechLab(page, F044);
    await expect(panel(page).locator('option[value="server"]')).toHaveCount(0);
    await expect(panel(page)).toHaveAttribute('data-speech-mode-value', 'text');
  });

  test('내 기기 안 인식이 되는 브라우저에서는 그 선택지가 생기고, 설정 페이지에 "가능"이 보인다', async ({ page }) => {
    await fakeSpeechRecognition(page, 'available');
    await page.goto(SETTINGS_PATH);
    const setting = page.locator('[data-speech-setting]');
    await expect(setting).toHaveAttribute('data-ondevice', 'available', { timeout: 15_000 });
    await expect(setting.locator('[data-ondevice-status]')).toContainText('밖으로 나가지 않아요');

    await openSpeechLab(page, F044);
    await expect(panel(page)).toHaveAttribute('data-speech-ondevice', 'available', { timeout: 30_000 });
    await expect(panel(page).locator('option[value="ondevice"]')).toHaveCount(1);
    // 교사가 켜지 않았으므로 서버 인식은 여전히 없다.
    await expect(panel(page).locator('option[value="server"]')).toHaveCount(0);
  });

  test('[이 컴퓨터에서 내 기록 지우기]를 누르면 서버 음성 인식 허용도 꺼짐으로 돌아간다', async ({ page }) => {
    await fakeSpeechRecognition(page, 'unavailable');
    await page.goto(SETTINGS_PATH);
    const setting = page.locator('[data-speech-setting]');
    await setting.locator('[data-server-speech]').check();
    await expect(setting).toHaveAttribute('data-speech-allowed', 'on');

    await page.locator('[data-clear-records] [data-clear-records-open]').click();
    await page.locator('[data-clear-records] [data-clear-records-confirm]').click();
    await expect(setting).toHaveAttribute('data-speech-allowed', 'off');
    await expect(setting.locator('[data-server-speech]')).not.toBeChecked();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), SERVER_RECOGNITION_KEY)).toBeNull();
  });

  test('좁은 화면(휴대폰)에서도 설정 페이지가 넘치지 않는다', async ({ page, isMobile }) => {
    test.skip(!isMobile, '좁은 화면 배치는 모바일 project에서만 본다');
    await page.goto(SETTINGS_PATH);
    await expect(page.locator('[data-speech-setting]')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
