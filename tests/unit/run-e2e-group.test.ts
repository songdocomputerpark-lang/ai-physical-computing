// 브라우저 테스트 무리 명령(npm run test:a11y·perf:measure — scripts/run-e2e-group.mjs)과 Phase 6 명령 자리(2026-09-26 병렬 제작 준비).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { findGroupSpecs } from '../../scripts/run-e2e-group.mjs';
import { makeTempDir, removeDir, writeFiles } from './helpers/fixture.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeDir(dir);
  }
});

describe('브라우저 테스트 무리 명령(npm run test:a11y·perf:measure)', () => {
  it('tests/e2e/<무리>*.spec.ts만 고른다', () => {
    const dir = makeTempDir('e2e-group-');
    tempDirs.push(dir);
    writeFiles(dir, { 'a11y.spec.ts': '', 'a11y-lab.spec.ts': '', 'lab-a11y.spec.ts': '', 'a11y-notes.md': '', 'perf.spec.ts': '' });
    expect(findGroupSpecs('a11y', dir).map((file) => path.basename(file))).toEqual(['a11y-lab.spec.ts', 'a11y.spec.ts']);
    expect(findGroupSpecs('none', dir)).toEqual([]);
  });

  it('파일이 아직 없으면 "아직 없어요"를 알리고 종료 코드 0으로 끝난다', () => {
    const result = spawnSync(process.execPath, [path.resolve('scripts/run-e2e-group.mjs'), 'phase6-empty-group'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('아직 없어요: tests/e2e/phase6-empty-group*.spec.ts');
  });

  it('package.json 명령 자리가 있다(접근성 검사 도구는 정확한 판으로 고정)', () => {
    const scripts = packageJson.scripts as Record<string, string>;
    expect(scripts['test:a11y']).toMatch(/^node scripts\/run-e2e-group\.mjs a11y/u);
    expect(scripts['perf:measure']).toMatch(/^node scripts\/run-e2e-group\.mjs perf/u);
    expect(scripts['build:offline']).toMatch(/scripts\/build-offline\.mjs/u);
    expect(scripts.postbuild).toContain('node scripts/search-index.mjs');
    expect(packageJson.devDependencies['@axe-core/playwright']).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});
