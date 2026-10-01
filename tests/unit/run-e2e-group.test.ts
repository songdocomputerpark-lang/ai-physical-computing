// 브라우저 테스트 무리 명령(npm run test:a11y·perf:measure — scripts/run-e2e-group.mjs)과 Phase 6 명령 자리(2026-09-26 병렬 제작 준비).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { E2E_GROUPS, findGroupSpecs, missingGroupMessage } from '../../scripts/run-e2e-group.mjs';
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

  // 판 1.1.3(최종 전수 점검 2바퀴 TD2-01, C74 ④): 전에는 "아직 없어요"를 찍고 종료 코드 0이라, 파일 이름이 바뀌거나 지워지면 연 1회 점검이 "통과"로 읽혔다.
  it('파일이 없으면 실패(종료 코드 1)로 끝나고 무엇을 볼지 알린다', () => {
    const result = spawnSync(process.execPath, [path.resolve('scripts/run-e2e-group.mjs'), 'phase6-empty-group'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('tests/e2e/phase6-empty-group*.spec.ts 파일이 없어요');
    expect(result.stderr).toContain('실패로 끝내요');
    expect(result.stderr).toContain('파일 이름이 바뀌었거나 지워졌는지 봐요');
    expect(`${result.stdout}${result.stderr}`).not.toContain('아직 없어요');
  });

  it('알려진 무리는 명령과 무엇을 보는 검사인지 알리고, 개발 중 구역 이름은 쓰지 않는다', () => {
    const message = missingGroupMessage('a11y', E2E_GROUPS.a11y);
    expect(message).toContain('axe 접근성 검사(npm run test:a11y)');
    for (const group of Object.values(E2E_GROUPS) as { command: string; about: string }[]) {
      expect(group.about).not.toMatch(/구역|Phase|P6-/u);
    }
    expect(missingGroupMessage('zz', undefined)).toContain('돌릴 검사가 없어 실패로 끝내요');
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
