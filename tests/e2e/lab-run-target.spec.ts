// 실습실 실행 대상(lab.setRunTarget — 병렬 제작 준비 2026-09-17) 브라우저 테스트. 실제 보드 연결(P3-07·P3-08)이 [실행]·[정지]를
// 파이썬 실행기 대신 받는 자리가 공통 조작 줄·콘솔·input() 입력줄·결과 줄·'run'/'done' 이벤트와 맞물리는지, 가짜 대상으로 개발용 시험 페이지에서 본다.
//  1. 대상을 끼우면 파이썬 준비를 기다리지 않고 [실행]이 켜지고 상태 글·data-state·data-run-target이 대상 기준이 된다.
//  2. [실행] → 콘솔 머리줄 + 대상 출력, 결과 줄, 'run' 이벤트의 target 이름.
//  3. 대상의 prompt → 공통 입력줄에 적은 줄이 대상에 돌아간다.
//  4. [정지] → 대상의 stop, 결과 'stopped'·정지 시간. 실행 중에는 대상을 바꿀 수 없다.
//  5. 오류 결과의 트레이스백이 콘솔에 한 번 적힌다. 대상을 떼면 파이썬 실행기로 돌아간다.
import { expect, test, type Page } from '@playwright/test';
import { DEV_LAB_PATH, labRoot, setEditorCode } from './helpers/lab.ts';

interface TargetWindow {
  __apcLab?: {
    setRunTarget(target: unknown): void;
    on(event: string, listener: (payload: { target?: string | null }) => void): () => void;
  };
  __targetLog?: unknown[];
  __setTargetError?: string;
}

async function consoleText(page: Page): Promise<string> {
  return (await page.locator('[data-lab-console]').textContent()) ?? '';
}

test.describe('실습실 실행 대상(실제 보드 자리)', () => {
  test.describe.configure({ timeout: 90_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '공통 조작 줄 이음만 보는 검사라 데스크톱에서 한 번 돌린다.');

  test('대상을 끼우면 [실행]·[정지]·입력줄·결과가 대상으로 가고, 떼면 파이썬 실행기로 돌아온다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // 컨트롤러는 뿌리 요소에 보내는 apc:lab-ready 이벤트로 받는다(문서의 capture 단계에서 — 페이지 스크립트보다 먼저 듣게 init script로)
    await page.addInitScript(() => {
      document.addEventListener(
        'apc:lab-ready',
        (event) => {
          (window as unknown as TargetWindow).__apcLab = (event as CustomEvent<{ controller: TargetWindow['__apcLab'] }>).detail.controller;
        },
        true,
      );
    });
    const response = await page.goto(DEV_LAB_PATH);
    expect(response?.status()).toBe(200);
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as TargetWindow).__apcLab))).toBe(true);

    await page.evaluate(() => {
      const scope = window as unknown as TargetWindow & { __stopRun?: () => void };
      const lab = scope.__apcLab!;
      const log: unknown[] = [];
      scope.__targetLog = log;
      lab.on('run', (payload) => log.push(['run-event', payload.target]));
      lab.setRunTarget({
        label: '시험 보드',
        async run(code: string, context: { runCount: number; write(text: string, kind?: string): void; prompt(label: string): Promise<string | null> }) {
          log.push(['run', code.trim(), context.runCount]);
          context.write('보드 출력 1\n');
          if (code.includes('input')) {
            const line = await context.prompt('이름? ');
            context.write(`받은 줄: ${line}\n`);
          }
          if (code.includes('loop')) {
            await new Promise<void>((resolve) => {
              scope.__stopRun = resolve;
            });
            try {
              lab.setRunTarget(null);
            } catch (error) {
              scope.__setTargetError = (error as Error).message;
            }
            return { runId: context.runCount, outcome: 'stopped', durationMs: 5 };
          }
          if (code.includes('boom')) {
            return {
              runId: context.runCount,
              outcome: 'error',
              durationMs: 5,
              error: {
                type: 'ZeroDivisionError',
                message: 'ZeroDivisionError: divide by zero',
                traceback: 'Traceback (most recent call last):\n  File "<stdin>", line 1, in <module>\nZeroDivisionError: divide by zero',
              },
            };
          }
          return { runId: context.runCount, outcome: 'ok', durationMs: 5 };
        },
        stop() {
          log.push(['stop']);
          scope.__stopRun?.();
        },
      });
    });

    const root = labRoot(page);
    const runButton = page.getByRole('button', { name: '실행', exact: true });
    const stopButton = page.getByRole('button', { name: '정지', exact: true });
    await expect(root).toHaveAttribute('data-run-target', '시험 보드');
    await expect(root).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('[data-lab-status]')).toHaveText('시험 보드에서 실행할 수 있어요. [실행]을 누르세요.');
    await expect(runButton).toBeEnabled();

    // 2. 보통 실행
    await setEditorCode(page, "print('hi')");
    await runButton.click();
    await expect(root).toHaveAttribute('data-outcome', 'ok');
    await expect(page.locator('[data-lab-result]')).toHaveText('실행이 끝났어요.');
    expect(await consoleText(page)).toContain('보드 출력 1');

    // 3. 입력줄
    await setEditorCode(page, "name = input('이름? ')");
    await runButton.click();
    const inputForm = page.locator('[data-lab-input-form]');
    await expect(inputForm).toBeVisible();
    await expect(page.locator('[data-lab-input-label]')).toHaveText('이름?');
    await page.locator('[data-lab-input]').fill('철수');
    await page.locator('[data-lab-input]').press('Enter');
    await expect(root).toHaveAttribute('data-outcome', 'ok');
    await expect(inputForm).toBeHidden();
    expect(await consoleText(page)).toContain('받은 줄: 철수');

    // 4. [정지]
    await setEditorCode(page, 'while True: pass  # loop');
    await runButton.click();
    await expect(root).toHaveAttribute('data-state', 'running');
    await expect(page.locator('[data-lab-status]')).toHaveText('시험 보드에서 실행 중이에요.');
    await expect(runButton).toBeDisabled();
    await expect(stopButton).toBeEnabled();
    await stopButton.click();
    await expect(root).toHaveAttribute('data-outcome', 'stopped');
    await expect(root).toHaveAttribute('data-stop-ms', /^\d+$/u);
    await expect(page.locator('[data-lab-result]')).toHaveText('[정지]를 눌러 멈췄어요(KeyboardInterrupt).');
    await expect(root).toHaveAttribute('data-state', 'idle');
    await expect(stopButton).toBeDisabled();
    expect(await page.evaluate(() => (window as unknown as TargetWindow).__setTargetError)).toBe('실행 중에는 실행 대상을 바꿀 수 없어요. [정지]한 뒤에 바꿔요.');

    // 5. 오류 결과: 트레이스백은 콘솔에 한 번
    await setEditorCode(page, 'boom = 1/0');
    await runButton.click();
    await expect(root).toHaveAttribute('data-outcome', 'error');
    await expect(page.locator('[data-lab-result]')).toHaveText('오류로 끝났어요: ZeroDivisionError: divide by zero');
    const text = await consoleText(page);
    expect(text.split('File "<stdin>", line 1, in <module>').length - 1).toBe(1);

    const log = await page.evaluate(() => (window as unknown as TargetWindow).__targetLog);
    expect(log).toEqual([
      ['run-event', '시험 보드'],
      ['run', "print('hi')", 1],
      ['run-event', '시험 보드'],
      ['run', "name = input('이름? ')", 2],
      ['run-event', '시험 보드'],
      ['run', 'while True: pass  # loop', 3],
      ['stop'],
      ['run-event', '시험 보드'],
      ['run', 'boom = 1/0', 4],
    ]);

    // 떼면 파이썬 실행기 상태로 돌아간다(준비 중이면 loading, 끝났으면 idle)
    await page.evaluate(() => (window as unknown as TargetWindow).__apcLab!.setRunTarget(null));
    await expect(root).toHaveAttribute('data-run-target', '');
    await expect(root).toHaveAttribute('data-state', /^(unloaded|loading|idle)$/u);
    expect(errors).toEqual([]);
  });
});
