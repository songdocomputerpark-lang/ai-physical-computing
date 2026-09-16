// 채집본(tests/unit/errors/fixtures/tracebacks.json)이 **지금의 실제 Pyodide**와 여전히 같은지 검사한다(PLAN §8.2 P2-06, PD-14).
//
// traceback.test.ts·explain.test.ts는 커밋해 둔 채집본으로 빠르게 돌고, 이 파일만 Node.js에서 진짜 Pyodide 314.0.7(+ opencv-python,
// Pillow)을 띄워 같은 오류를 다시 내 본다(tests/unit/errors/helpers/pyodide-traceback-run.mjs). Pyodide 판을 올렸을 때
// 트레이스백 모양이 달라지면 여기서 먼저 실패하고, 채집본을 다시 만들라고 알려 준다:
//   node --experimental-wasm-jspi tests/unit/errors/helpers/pyodide-traceback-run.mjs . --write
//
// 건너뛰는 경우(테스트를 멈추지 않는다): Node에 JSPI가 없음(--experimental-wasm-jspi 확인), pyodide 패키지가 설치되지 않음,
// 네트워크가 없어 opencv 휠을 받지 못함(도우미가 skipped에 이유를 적는다). 휠은 .cache/pyodide-packages/에 저장된다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromYaml, CATALOG_FILE } from '../../../src/lab/errors/catalog-build.ts';
import { explain } from '../../../src/lab/errors/explain.ts';
import { parseTraceback } from '../../../src/lab/errors/traceback.ts';
import { PYODIDE_VERSION } from '../../../src/lab/runtime/config.ts';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'errors', 'helpers', 'pyodide-traceback-run.mjs');
const FIXTURE_FILE = path.join(ROOT, 'tests', 'unit', 'errors', 'fixtures', 'tracebacks.json');
const REDO = `채집본을 다시 만들어요: node --experimental-wasm-jspi tests/unit/errors/helpers/pyodide-traceback-run.mjs . --write`;

interface Collected {
  pyodideVersion: string;
  pythonVersion: string;
  skipped: string | null;
  cases: Record<string, { code: string; type: string | null; message: string | null; traceback: string | null; note?: string }>;
}

const saved = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8')) as Collected;
const catalog = loadCatalogFromYaml(fs.readFileSync(path.join(ROOT, CATALOG_FILE), 'utf8'));

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

/** 도우미를 한 번만 돌려 결과를 나눠 쓴다(Pyodide·휠 받기가 가장 오래 걸린다). */
let live: Collected | null = null;
function collect(): Collected {
  if (live) {
    return live;
  }
  const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', SCRIPT, ROOT], { encoding: 'utf8', timeout: 300_000, cwd: ROOT });
  expect(result.status, `${result.stderr.slice(-3000)}\n${result.stdout.slice(-2000)}`).toBe(0);
  const lines = result.stdout.trim().split('\n');
  live = JSON.parse(lines[lines.length - 1] ?? '{}') as Collected;
  return live;
}

describe.runIf(nodeHasJspi && pyodideInstalled)('실제 Pyodide 트레이스백 대조', () => {
  it(
    '오류 사례를 다시 내 봐도 채집본과 같은 트레이스백이 나온다',
    () => {
      const now = collect();
      if (now.skipped) {
        // 네트워크가 없어 opencv 휠을 받지 못한 경우: 판만 확인하고 넘어간다(오프라인에서도 테스트가 멈추지 않게).
        expect(now.pyodideVersion).toBe(PYODIDE_VERSION);
        return;
      }
      expect(now.pyodideVersion, `Pyodide 판이 달라요. ${REDO}`).toBe(PYODIDE_VERSION);
      expect(now.pythonVersion, `파이썬 판이 달라요. ${REDO}`).toBe(saved.pythonVersion);

      const changed: string[] = [];
      for (const [id, savedCase] of Object.entries(saved.cases)) {
        const nowCase = now.cases[id];
        if (!nowCase) {
          changed.push(`${id}: 이번에는 채집되지 않았어요`);
          continue;
        }
        if (nowCase.type !== savedCase.type || nowCase.message !== savedCase.message || nowCase.traceback !== savedCase.traceback) {
          changed.push(`${id}: ${savedCase.message} → ${nowCase.message}`);
        }
      }
      expect(changed, `트레이스백이 달라진 사례가 있어요. ${REDO}\n${changed.join('\n')}`).toEqual([]);
    },
    360_000,
  );

  it(
    '실제 트레이스백으로도 같은 한국어 풀이와 줄 번호가 나온다',
    () => {
      const now = collect();
      const ids = Object.keys(now.cases).filter((id) => now.cases[id]?.traceback);
      expect(ids.length).toBeGreaterThanOrEqual(15);
      const mismatched: string[] = [];
      for (const id of ids) {
        const nowCase = now.cases[id]!;
        const savedCase = saved.cases[id];
        const pick = (item: { type: string | null; message: string | null; traceback: string | null }): string | null => {
          const explanation = explain(catalog, {
            outcome: 'error',
            error: { type: item.type ?? '', message: item.message ?? '', traceback: item.traceback ?? '' },
          });
          return explanation?.entry.id ?? null;
        };
        const nowEntry = pick(nowCase);
        if (savedCase?.traceback && nowEntry !== pick(savedCase)) {
          mismatched.push(`${id}: ${pick(savedCase)} → ${nowEntry}`);
        }
        // 학생 코드 줄을 찾지 못하면 카드가 "?번째 줄"을 보이므로 여기서 잡는다(문법 오류·이어진 예외 포함).
        const parsed = parseTraceback(nowCase.traceback ?? '');
        if (id !== 'stop-iteration' && parsed.location === null) {
          mismatched.push(`${id}: 학생 코드 줄을 찾지 못했어요`);
        }
      }
      expect(mismatched, `${REDO}\n${mismatched.join('\n')}`).toEqual([]);
    },
    360_000,
  );
});
