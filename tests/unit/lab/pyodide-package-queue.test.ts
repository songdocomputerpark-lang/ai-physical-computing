// 패키지 받기 줄 세우기(src/lab/runtime/package-queue.ts)를 Node.js의 실제 Pyodide 314.0.7로 확인한다.
// 2026-09-26 Phase 6 사용성 검토 지적 4: 준비 직후(numpy·OpenCV 미리 받기가 도는 동안) [실행]을 누르면 콘솔 첫 줄에
// 영어 "Loading numpy, opencv-python"이 결과처럼 나왔다. 워커가 받기를 줄 세우면 알림은 각자 알림 함수로만 간다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPackageQueue } from '../../../src/lab/runtime/package-queue.ts';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'lab', 'helpers', 'pyodide-package-queue-run.mjs');
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

interface Side {
  stdout: string;
}
interface RunOutput {
  skipped?: string;
  queued: Side & { prefetch: string[]; runSide: string[] };
  unqueued: Side & { first: string[]; second: string[] };
  loadedPackages: string[];
}

describe('패키지 받기 줄 세우기(순수)', () => {
  it('앞의 일이 끝난 뒤에 다음 일을 부르고, 앞이 실패해도 다음은 돈다', async () => {
    const queue = createPackageQueue();
    const order: string[] = [];
    let release: () => void = () => undefined;
    const first = queue.run(
      () =>
        new Promise<void>((resolve) => {
          order.push('first:start');
          release = () => {
            order.push('first:end');
            resolve();
          };
        }),
    );
    const failing = queue.run(async () => {
      order.push('second');
      throw new Error('받기 실패');
    });
    const third = queue.run(async () => {
      order.push('third');
      return 3;
    });
    await Promise.resolve();
    expect(order).toEqual(['first:start']);
    release();
    await first;
    await expect(failing).rejects.toThrow('받기 실패');
    await expect(third).resolves.toBe(3);
    expect(order).toEqual(['first:start', 'first:end', 'second', 'third']);
  });
});

describe.skipIf(!pyodideInstalled)('패키지 받기 줄 세우기(실제 Pyodide 314.0.7)', () => {
  it('미리 받기와 실행 쪽 받기가 겹쳐도 "Loading …"이 학생 콘솔(stdout)로 새지 않는다 — 줄 세우지 않으면 샌다(대조)', () => {
    const result = spawnSync(process.execPath, [SCRIPT, ROOT], { encoding: 'utf8', timeout: 240_000, cwd: ROOT });
    expect(result.status, result.stderr).toBe(0);
    const lines = result.stdout.trim().split('\n');
    const out = JSON.parse(lines[lines.length - 1] ?? '{}') as RunOutput;
    if (out.skipped) {
      console.warn(`[건너뜀] ${out.skipped}`);
      return;
    }
    // 줄 세움: 진짜 stdout은 비어 있고, 알림은 자기 알림 함수로
    expect(out.queued.stdout).toBe('');
    expect(out.queued.prefetch.join('\n')).toMatch(/^Loading numpy/mu);
    expect(out.queued.runSide.join('\n')).toMatch(/No new packages to load|already loaded/u);
    expect(out.queued.runSide.join('\n')).not.toMatch(/^Loading/mu);
    // 대조: Pyodide 314.0.7은 겹친 받기에서 "Loading …"을 진짜 stdout에 쓴다(판을 올려 이 대조가 틀리면 Pyodide가 고친 것 — 줄 세우기는 그대로 둬도 된다)
    // (lock 파일의 이름은 "Pillow" — 2026-09-26 실측 "Loading Pillow")
    expect(out.unqueued.stdout).toMatch(/Loading pillow/iu);
    expect(out.loadedPackages.map((name) => name.toLowerCase())).toEqual(expect.arrayContaining(['numpy', 'pillow']));
  }, 300_000);
});
