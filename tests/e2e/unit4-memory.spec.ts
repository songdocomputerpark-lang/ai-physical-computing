/**
 * 4단원 통합 화면을 오래 켜 둘 때 메모리가 **어디서** 느는지 가르는 개발용 측정(판 1.1.0, PROGRESS 미해결 136).
 * 판 1.1.0 결론(2026-09-29, 빌드 결과 660초): WebAssembly(영상처리 87MB·보드 30MB)와 워커 힙은 평평하고, 느는 것은 쪽의 Blink 힙(Oilpan)이
 * 잡아 둔 페이지다(살아 있는 객체 10~13MB인데 +310MB) — 콘솔에 오래 남는 출력 조각이 짧은 객체 사이에 흩어져 페이지를 붙잡는 조각남.
 * 표본마다 [콘솔 지우기]면 +57MB, 접힌 조각을 글자로만 두면(흉내) +56MB. 표와 고칠 곳은 PROGRESS 미해결 136 칸.
 * 통합이 console-fold.ts를 그렇게 고친 뒤(결정 C47) 같은 조건으로 다시 잰 값(2026-09-29, 판 1.1.0 빌드): 크롬 전용 메모리 652 → 729MB(+77MB,
 * 고치기 전 +332~335MB), Blink 힙 잡아 둔 크기 77.9 → 129.0MB(살아 있는 객체 10.7 → 11.8MB), [정지] 뒤 렌더러 692MB.
 *
 * `UNIT4_MEMORY_SECONDS=660`처럼 잴 시간을 줄 때만 돈다(`npm run test:e2e`·CI에서는 건너뛴다 — 10분 넘게 걸리는 측정이라).
 * 개발 서버가 아니라 **빌드 결과**로 잰다(PROGRESS 136 "빌드 결과로 10분 이상"): 예) 결과 폴더를 따로 빌드해 미리 보기 서버로 띄우고
 *   PW_BASE_URL=http://127.0.0.1:5012/ai-physical-computing/ UNIT4_MEMORY_SECONDS=660 npx playwright test tests/e2e/unit4-memory.spec.ts --project=desktop --workers=1
 *
 * 재는 것(helpers/memory-probe.ts — 사이트 코드를 고치지 않고 CDP로): 렌더러·GPU 프로세스 전용 메모리, 쪽과 **파이썬 워커마다**
 * WebAssembly.Memory 크기·자바스크립트 힙·힙 바깥 저장(ArrayBuffer)·Blink 힙, DOM 수, 캔버스 수·면적. UNIT4_MEMORY_EVERY초(기본 30)마다.
 *
 * 경우(UNIT4_MEMORY_MODE)
 *   both(기본) — [함께 실행]: 보드 f110 사이트판 → 블루투스 [연결] → 컴퓨터 f104(재생 입력 face-turn). 1.0.0 측정에서 늘던 경우.
 *   pc         — 컴퓨터 칸만 f104(보드는 멈춤 — 좌표는 "이어지지 않음"으로 보내지 않는다).
 * UNIT4_MEMORY_DUMP=1이면 첫 [실행 중] 표본과 끝에 크롬 메모리 덤프(할당기별 — helpers/memory-probe.ts memoryInfraDump)를 떠서 차이를 적는다.
 * UNIT4_MEMORY_CLEAR_CONSOLE=1이면(가르기 실험) 표본마다 두 칸의 [콘솔 지우기]를 누른다 — 콘솔에 오래 남는 줄이 늘어남의 까닭인지 본다.
 * UNIT4_MEMORY_FOLD_CAP=<조각 수>이면(고친 뒤 흉내) 콘솔마다 남기는 조각(보이는 것 + 접힌 것)을 그 수로 줄인 것처럼 1초마다 가장 오래된
 * 접힌 조각을 지운다 — 사이트 코드(runtime-extras console-fold.ts의 FOLD_TOTAL_MAX)를 고치지 않고 "상한을 낮추면"의 수치를 미리 잰다.
 * UNIT4_MEMORY_FOLD_TEXT=1이면(고친 뒤 흉내 2) 1초마다 접힌 조각을 DOM에서 빼 글자로만(자바스크립트 배열, 콘솔마다 2,700개까지) 모아 둔다 —
 * "접힌 줄은 DOM 노드가 아니라 글자로 두고 [펼치기] 때만 그린다"로 고쳤을 때의 수치를 미리 잰다.
 * 판 1.1.0 통합(결정 C47)에서 console-fold.ts가 바로 그렇게 고쳐져, 지금 사이트에서는 접힌 상자가 늘 비어 있어 FOLD_CAP·FOLD_TEXT가
 * 아무것도 하지 않는다 — 두 흉내는 고치기 전 판(1.0.0 빌드)을 잴 때만 뜻이 있다. 지금 판은 스위치 없이(경우 ①) 잰다.
 * 결과 표는 testInfo 첨부·표준 출력, UNIT4_MEMORY_OUT=<파일>이면 그 파일에도.
 */
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { MemoryProbe, diffAllocatorDumps, formatMemorySample, gpuMb, memoryInfraDump, workersByRole, type AllocatorDump, type MemorySample } from './helpers/memory-probe.ts';

const UNIT4_PATH = withBase('labs/unit4/');
const READY_TIMEOUT = 300_000;
const SECONDS = Number(process.env.UNIT4_MEMORY_SECONDS ?? 0) || 0;
const EVERY = Math.max(10, Number(process.env.UNIT4_MEMORY_EVERY ?? 30) || 30);
const MODE = process.env.UNIT4_MEMORY_MODE === 'pc' ? 'pc' : 'both';
const DUMP = process.env.UNIT4_MEMORY_DUMP === '1';
const CLEAR_CONSOLE = process.env.UNIT4_MEMORY_CLEAR_CONSOLE === '1';
const FOLD_CAP = Math.max(0, Math.floor(Number(process.env.UNIT4_MEMORY_FOLD_CAP ?? 0) || 0));
const FOLD_TEXT = process.env.UNIT4_MEMORY_FOLD_TEXT === '1';

function bar(page: Page) {
  return page.locator('[data-unit4]');
}

function lab(page: Page, id: 'vision' | 'esp32') {
  return page.locator(`[data-lab][data-lab-id="${id}"]`);
}

async function chooseReplay(page: Page, sequence: string): Promise<void> {
  const select = bar(page).locator('[data-unit4-input]');
  await expect(select.locator('option[value="replay"]')).toHaveCount(1, { timeout: READY_TIMEOUT });
  await select.selectOption('replay');
  const sequenceSelect = lab(page, 'vision').locator('[data-mediapipe-sequence]');
  await expect(sequenceSelect.locator(`option[value="${sequence}"]`)).toHaveCount(1, { timeout: 120_000 });
  await sequenceSelect.selectOption(sequence);
}

test.describe('4단원 통합 화면 — 오래 켜 둘 때 메모리 가르기(미해결 136, 개발용)', () => {
  test.skip(SECONDS <= 0, 'UNIT4_MEMORY_SECONDS를 줄 때만 잰다(10분 넘게 걸리는 개발용 측정)');
  test.skip(({ isMobile }) => Boolean(isMobile), '데스크톱에서만');

  test(`경우 ${MODE}: ${SECONDS}초 동안 ${EVERY}초마다`, async ({ page, browser }, testInfo) => {
    test.setTimeout((SECONDS + 600) * 1000);
    // 탐침을 먼저 건다 — 파이썬 워커가 뜨는 순간 멈춰 세우고 WebAssembly 메모리를 기억하는 스크립트를 넣어야 해서(helpers/memory-probe.ts)
    await page.goto(withBase('memory-probe-start/'));
    const probe = new MemoryProbe(page, browser);
    await probe.install();
    if (FOLD_CAP > 0) {
      await page.addInitScript((cap: number) => {
        // 접힌 상자([data-runtime-extras-fold])만 1초마다 본다(문서 전체를 지켜보면 그 자체가 Blink 객체를 만들어 재는 값을 흔든다)
        window.setInterval(() => {
          for (const holder of document.querySelectorAll('[data-runtime-extras-fold]')) {
            const box = holder.parentElement;
            if (!box) {
              continue;
            }
            const visible = [...box.children].filter((element) => !element.matches('[data-runtime-extras-fold], [data-runtime-extras-fold-toggle]')).length;
            let extra = holder.childElementCount + visible - cap;
            while (extra > 0 && holder.firstElementChild) {
              holder.firstElementChild.remove();
              extra -= 1;
            }
          }
        }, 1000);
      }, FOLD_CAP);
    }
    if (FOLD_TEXT) {
      await page.addInitScript(() => {
        const kept = new Map<Element, string[]>();
        window.setInterval(() => {
          for (const holder of document.querySelectorAll('[data-runtime-extras-fold]')) {
            const list = kept.get(holder) ?? [];
            kept.set(holder, list);
            while (holder.firstElementChild) {
              list.push(holder.firstElementChild.textContent ?? '');
              holder.firstElementChild.remove();
            }
            if (list.length > 2700) {
              list.splice(0, list.length - 2700);
            }
          }
        }, 1000);
      });
    }

    const response = await page.goto(UNIT4_PATH);
    expect(response?.status()).toBe(200);
    await expect(bar(page)).toHaveAttribute('data-unit4-ready', 'yes', { timeout: READY_TIMEOUT });
    await expect(lab(page, 'vision')).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
    await expect(lab(page, 'esp32')).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
    await chooseReplay(page, 'face-turn');

    const lines: string[] = [];
    const samples: MemorySample[] = [];
    const startedAt = Date.now();
    const take = async (label: string) => {
      const sample = await probe.sample();
      samples.push(sample);
      const line = `${label} ${formatMemorySample(sample, startedAt)}`;
      lines.push(line);
      console.log(line);
    };
    await take('[준비 끝]');

    if (MODE === 'both') {
      await bar(page).locator('[data-unit4-run]').click();
      await expect(bar(page)).toHaveAttribute('data-unit4-phase', 'running', { timeout: READY_TIMEOUT });
      await expect(bar(page)).toHaveAttribute('data-unit4-connected', 'true', { timeout: 60_000 });
    } else {
      await lab(page, 'vision').getByRole('button', { name: '실행', exact: true }).click();
      await expect(lab(page, 'vision')).toHaveAttribute('data-state', 'running', { timeout: READY_TIMEOUT });
    }
    await take('[실행 시작]');

    const dumps: { label: string; dump: AllocatorDump }[] = [];
    const takeDump = async (label: string) => {
      const pid = samples[samples.length - 1]?.process?.rendererPid ?? 0;
      const dump = await memoryInfraDump(browser, pid);
      if (dump) {
        dumps.push({ label, dump });
        const line = `${label} 메모리 덤프: 크롬 전용 메모리 ${(dump.footprint / (1024 * 1024)).toFixed(0)}MB · 할당기 ${Object.keys(dump.sizes).length}개`;
        lines.push(line);
        console.log(line);
      } else {
        lines.push(`${label} 메모리 덤프를 뜨지 못했어요.`);
      }
    };

    const until = Date.now() + SECONDS * 1000;
    while (Date.now() < until) {
      await page.waitForTimeout(Math.min(EVERY * 1000, Math.max(0, until - Date.now())));
      await take('[실행 중]');
      if (CLEAR_CONSOLE) {
        await page.evaluate(() => {
          for (const button of document.querySelectorAll<HTMLButtonElement>('[data-lab-console-clear]')) {
            button.click();
          }
        });
      }
      if (DUMP && dumps.length === 0) {
        await takeDump('[첫 덤프]');
      }
      // 실행이 멈췄으면(오류 등) 더 재지 않는다
      if ((await lab(page, 'vision').getAttribute('data-state')) !== 'running') {
        lines.push('컴퓨터 칸이 멈춰서 측정을 끝냈어요.');
        break;
      }
    }
    if (DUMP) {
      await takeDump('[끝 덤프]');
    }

    if (MODE === 'both') {
      await bar(page).locator('[data-unit4-stop]').click();
      await expect(bar(page)).toHaveAttribute('data-unit4-phase', 'idle', { timeout: 60_000 });
    } else {
      await lab(page, 'vision').getByRole('button', { name: '정지', exact: true }).click();
    }
    await page.waitForTimeout(3000);
    await take('[정지 뒤]');
    await probe.stop();

    // 비교는 실행을 시작한 뒤 프로세스 값까지 읽은 첫 표본 ↔ [정지] 직전 표본
    const first = samples.slice(1).find((sample) => sample.process !== null) ?? samples[0]!;
    const last = samples[samples.length - 2] ?? samples[samples.length - 1]!;
    const growth = (pick: (sample: MemorySample) => number) => ((pick(last) - pick(first)) / (1024 * 1024)).toFixed(1);
    const workerPick = (rank: number, field: 'wasmBytes' | 'heapUsed' | 'backing') => (sample: MemorySample) => workersByRole(sample)[rank]?.[field] ?? 0;
    const pagePick = (field: 'heapUsed' | 'backing' | 'embedder' | 'wasmBytes') => (sample: MemorySample) => sample.targets.find((item) => item.kind === 'page')?.[field] ?? 0;
    const summary = [
      `### 4단원 통합 화면 메모리(경우 ${MODE}${CLEAR_CONSOLE ? ' · 표본마다 [콘솔 지우기]' : ''}${FOLD_CAP > 0 ? ` · 콘솔마다 조각 ${FOLD_CAP}개까지(흉내)` : ''}${FOLD_TEXT ? ' · 접힌 조각을 글자로만(흉내)' : ''}, 실행 시작부터 ${Math.round((last.at - first.at) / 1000)}초)`,
      '',
      `- 렌더러: ${first.process?.rendererMb.toFixed(0) ?? '—'} → ${last.process?.rendererMb.toFixed(0) ?? '—'}MB · GPU 프로세스: ${gpuMb(first.process).toFixed(0)} → ${gpuMb(last.process).toFixed(0)}MB · 브라우저 전체: ${first.process?.totalMb.toFixed(0) ?? '—'} → ${last.process?.totalMb.toFixed(0) ?? '—'}MB (프로세스 종류: ${Object.keys(last.process?.byType ?? {}).join(', ') || '—'})`,
      `- 워커1(영상처리 — 인스턴스 많은 쪽) WebAssembly +${growth(workerPick(0, 'wasmBytes'))}MB · 힙 +${growth(workerPick(0, 'heapUsed'))}MB · 바깥 +${growth(workerPick(0, 'backing'))}MB`,
      `- 워커2(보드) WebAssembly +${growth(workerPick(1, 'wasmBytes'))}MB · 힙 +${growth(workerPick(1, 'heapUsed'))}MB · 바깥 +${growth(workerPick(1, 'backing'))}MB`,
      `- 쪽: 힙 +${growth(pagePick('heapUsed'))}MB · 바깥 +${growth(pagePick('backing'))}MB · Blink +${growth(pagePick('embedder'))}MB · WebAssembly +${growth(pagePick('wasmBytes'))}MB`,
      `- DOM: ${first.dom?.nodes ?? '—'} → ${last.dom?.nodes ?? '—'} · 리스너 ${first.dom?.listeners ?? '—'} → ${last.dom?.listeners ?? '—'}`,
      ...(dumps.length >= 2 ? ['', `#### 크롬 메모리 덤프 차이(${dumps[0]!.label} → ${dumps[dumps.length - 1]!.label}, 렌더러)`, '', '```', ...diffAllocatorDumps(dumps[0]!.dump, dumps[dumps.length - 1]!.dump, 30), '```'] : []),
      '',
      '```',
      ...lines,
      '```',
    ].join('\n');
    console.log(summary);
    await testInfo.attach(`unit4-memory-${MODE}.md`, { body: summary, contentType: 'text/markdown' });
    const out = process.env.UNIT4_MEMORY_OUT;
    if (out) {
      fs.writeFileSync(out, `${summary}\n`, 'utf8');
    }
  });
});
