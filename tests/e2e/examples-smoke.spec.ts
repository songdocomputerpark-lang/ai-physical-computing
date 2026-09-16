/**
 * 이관 예제 전부(scripts/examples-manifest.yaml 기준)를 실습실에서 한 번씩 돌려 보는 스모크 테스트(P2-14).
 *
 * 왜: 예제 49개는 원본 코드를 한 글자도 고치지 않고 옮긴 것이라(PD-10·PD-33), 흉내 모듈이 하나라도 어긋나면
 * 학생 화면에서 영어 트레이스백이 난다. 사람이 49개를 눌러 볼 수 없으니 한 번에 돌려 결과를 대조한다.
 *
 * 무엇을 보나(예제 하나마다)
 *   1. [예제 불러오기]로 코드를 올리고 [실행] → 잠깐 기다린 뒤 [정지]
 *   2. 결과(data-outcome)가 error가 아니어야 한다 — 기대와 다르면 실패하고 콘솔 마지막 줄을 함께 보여 준다.
 *   3. 원본이 원래 오류로 끝나는 예제(예: f024의 pyautogui.enter)는 사이드카의 smoke 칸에 적어 둔다.
 *
 * 사이드카(<이름>.meta.yaml)의 선택 칸 — src/lab/controls/example-sidecar.ts
 *   smoke:
 *     input: sample | replay | webcam   (적지 않으면 tags로 고른다: 손·얼굴·자세·mediapipe면 replay, 아니면 sample)
 *     outcome: ok | stopped | error     (적지 않으면 "error만 아니면 통과")
 *     error: AttributeError             (outcome이 error일 때 콘솔에 보여야 하는 오류 이름)
 *     seconds: 4                        (실행을 지켜보는 시간, 기본 3.5초)
 *     skip: "이유"                      (지금은 돌리지 않는 예제. 이유를 반드시 적는다)
 *
 * 돌리는 법: npx playwright test tests/e2e/examples-smoke.spec.ts --project=desktop
 * (모바일에서는 건너뛴다 — 같은 파이썬·같은 흉내 모듈이라 결과가 같고 시간만 두 배로 든다.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import YAML from 'yaml';
import { parseExampleSidecar } from '../../src/lab/controls/example-sidecar.ts';
import { exampleIdFromFile } from '../../src/lab/vision/examples.ts';
import { labRoot } from './helpers/lab.ts';
import { openVisionLab } from './helpers/vision.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const MANIFEST = path.join(REPO_ROOT, 'scripts', 'examples-manifest.yaml');
const REPLAY_TAGS = ['손', '얼굴', '자세', 'mediapipe', '랜드마크', '포즈'];
const DEFAULT_WATCH_MS = 3500;

interface SmokeCase {
  /** examples/ 뒤의 경로. 실습실 ?example= 값과 같다. */
  file: string;
  id: string;
  title: string;
  input: string;
  outcome: 'any' | 'ok' | 'stopped' | 'error';
  error: string | null;
  watchMs: number;
  skip: string | null;
}

function smokeSettings(sidecarPath: string): Record<string, unknown> {
  if (!fs.existsSync(sidecarPath)) {
    return {};
  }
  const raw: unknown = YAML.parse(fs.readFileSync(sidecarPath, 'utf8'));
  const smoke = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).smoke : undefined;
  return smoke && typeof smoke === 'object' && !Array.isArray(smoke) ? (smoke as Record<string, unknown>) : {};
}

function readCases(): SmokeCase[] {
  const manifest = YAML.parse(fs.readFileSync(MANIFEST, 'utf8')) as { examples?: { target?: string }[] };
  const cases: SmokeCase[] = [];
  for (const entry of manifest.examples ?? []) {
    const target = entry.target;
    if (typeof target !== 'string' || !target.startsWith('examples/') || !target.endsWith('.py')) {
      continue;
    }
    const file = target.slice('examples/'.length);
    const sidecarPath = path.join(REPO_ROOT, target.replace(/\.py$/u, '.meta.yaml'));
    const sidecar = fs.existsSync(sidecarPath) ? parseExampleSidecar(fs.readFileSync(sidecarPath, 'utf8')) : null;
    const smoke = smokeSettings(sidecarPath);
    const tags = sidecar?.tags ?? [];
    const guessed = tags.some((tag) => REPLAY_TAGS.includes(tag)) ? 'replay' : 'sample';
    cases.push({
      file,
      id: exampleIdFromFile(file),
      title: sidecar?.title ?? file,
      input: typeof smoke.input === 'string' ? smoke.input : guessed,
      outcome: typeof smoke.outcome === 'string' && ['ok', 'stopped', 'error'].includes(smoke.outcome) ? (smoke.outcome as SmokeCase['outcome']) : 'any',
      error: typeof smoke.error === 'string' ? smoke.error : null,
      watchMs: typeof smoke.seconds === 'number' ? Math.round(smoke.seconds * 1000) : DEFAULT_WATCH_MS,
      skip: typeof smoke.skip === 'string' ? smoke.skip : null,
    });
  }
  return cases;
}

const cases = readCases();

test.describe('이관 예제 스모크(실습실에서 한 번씩 실행)', () => {
  // 예제 49개를 한 페이지에서 이어 돌린다(Pyodide·OpenCV는 한 번만 받는다).
  test.skip(({ isMobile }) => Boolean(isMobile), '같은 파이썬·같은 흉내 모듈이라 데스크톱에서 한 번만 돌린다.');
  test.describe.configure({ timeout: 20 * 60_000 });

  test('예제를 모두 실행해도 파이썬 오류로 끝나지 않는다', async ({ page, context }) => {
    expect(cases.length, '이관 목록(scripts/examples-manifest.yaml)에서 예제를 읽지 못했어요').toBeGreaterThan(40);

    // 한 페이지에서 49개를 이어 돌리면 예제마다 남긴 것(창·캔버스·인식 엔진)이 쌓여 메모리가 는다.
    // 저사양 CI에서는 그러다 탭이 죽으므로(2026-09-16 확인) 몇 개마다 페이지를 새로 연다(Pyodide는 브라우저 캐시에서 온다).
    const RELOAD_EVERY = 10;
    let activePage = page;
    const pageErrors: string[] = [];
    const watchErrors = (target: Page) => target.on('pageerror', (error) => pageErrors.push(error.message));
    watchErrors(activePage);

    const parts = () => ({
      root: labRoot(activePage),
      select: activePage.locator('[data-lab-example-select]'),
      loadButton: activePage.locator('[data-lab-example-load]'),
      runButton: activePage.getByRole('button', { name: '실행', exact: true }),
      stopButton: activePage.locator('[data-lab-stop]'),
      consoleBox: activePage.locator('[data-lab-console]'),
    });

    /** 실습실을 새 페이지로 다시 연다(탭이 죽었을 때도 이 길로 되살린다). */
    async function reopenLab(): Promise<void> {
      if (!activePage.isClosed()) {
        await activePage.close().catch(() => undefined);
      }
      activePage = await context.newPage();
      watchErrors(activePage);
      await openVisionLab(activePage);
    }

    await openVisionLab(activePage);

    const failures: string[] = [];
    let ran = 0;
    let sinceReload = 0;

    for (const item of cases) {
      if (item.skip) {
        continue;
      }
      if (sinceReload >= RELOAD_EVERY) {
        sinceReload = 0;
        await reopenLab();
      }
      sinceReload += 1;
      const { root, select, loadButton, runButton, stopButton, consoleBox } = parts();
      const page = activePage;
      try {
      // 입력 소스를 예제에 맞게 고른다(재생 입력은 카메라 없이 손·얼굴·자세 좌표를 준다).
      const options = await select.locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
      if (!options.includes(item.id)) {
        failures.push(`${item.file}: [예제 불러오기] 목록에 없어요(id ${item.id})`);
        continue;
      }
      const sourceOptions = await page
        .locator('[data-vision-source-select] option')
        .evaluateAll((nodes) => nodes.filter((node) => !(node as HTMLOptionElement).disabled).map((node) => (node as HTMLOptionElement).value));
      if (sourceOptions.includes(item.input)) {
        await page.locator('[data-vision-source-select]').selectOption(item.input);
      }

      await select.selectOption(item.id);
      await loadButton.click();
      await expect(root).toHaveAttribute('data-example', item.id);

      await page.locator('[data-lab-console-clear]').click().catch(() => undefined);
      const runsBefore = Number((await root.getAttribute('data-run-count')) ?? '0');
      await runButton.click();
      await expect.poll(async () => Number((await root.getAttribute('data-run-count')) ?? '0'), { timeout: 30_000 }).toBeGreaterThan(runsBefore);

      // 스스로 끝나면 그때까지만 기다리고, 반복문이면 지켜본 뒤 [정지].
      const finished = await root
        .evaluate(
          (element, ms) =>
            new Promise<boolean>((resolve) => {
              const done = () => element.getAttribute('data-state') === 'idle';
              if (done()) {
                resolve(true);
                return;
              }
              const observer = new MutationObserver(() => {
                if (done()) {
                  observer.disconnect();
                  resolve(true);
                }
              });
              observer.observe(element, { attributes: true, attributeFilter: ['data-state'] });
              setTimeout(() => {
                observer.disconnect();
                resolve(done());
              }, ms);
            }),
          item.watchMs,
        )
        .catch(() => false);

      if (!finished) {
        await stopButton.click();
      }
      await expect(root).toHaveAttribute('data-state', 'idle', { timeout: 30_000 });
      const outcome = (await root.getAttribute('data-outcome')) ?? '';
      const consoleText = ((await consoleBox.textContent()) ?? '').replace(/\s+/gu, ' ').trim();
      const tail = consoleText.slice(-300);
      ran += 1;

      if (item.outcome === 'any') {
        if (outcome === 'error') {
          failures.push(`${item.file}(${item.title}): 파이썬 오류로 끝났어요 — ${tail}`);
        }
      } else if (outcome !== item.outcome) {
        failures.push(`${item.file}(${item.title}): 결과가 ${item.outcome}이어야 하는데 ${outcome}이에요 — ${tail}`);
      } else if (item.error && !consoleText.includes(item.error)) {
        failures.push(`${item.file}(${item.title}): 콘솔에 ${item.error}이(가) 없어요 — ${tail}`);
      }
      } catch (error) {
        // 어느 예제에서 멈췄는지 남기고, 페이지를 되살려 남은 예제를 계속 본다.
        failures.push(`${item.file}(${item.title}): 실행 도중 멈췄어요 — ${error instanceof Error ? error.message : String(error)}`);
        sinceReload = 0;
        await reopenLab();
      }
    }

    console.log(`[예제 스모크] ${ran}개 실행(건너뜀 ${cases.filter((item) => item.skip).length}개), 문제 ${failures.length}개`);
    expect(failures, `예제 스모크 실패:\n${failures.join('\n')}`).toEqual([]);
    expect(pageErrors, '페이지 오류').toEqual([]);
  });
});
