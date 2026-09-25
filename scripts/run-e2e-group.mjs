// 브라우저 테스트 무리 하나만 돌리기 — npm run test:a11y(접근성, Phase 6 구역 B)·npm run perf:measure(성능 측정, 구역 A).
// Phase 6 병렬 제작 준비(2026-09-26)에서 package.json 명령 자리를 먼저 만들 때 더했다(package.json은 공유 파일이라 구역이 못 고친다).
//
// 쓰는 법
//   node scripts/run-e2e-group.mjs <무리> [Playwright 인자…]
//   예: node scripts/run-e2e-group.mjs a11y --project=desktop
// - 무리 = tests/e2e/<무리>*.spec.ts 파일들(예: a11y → a11y.spec.ts·a11y-pages.spec.ts). 파일이 아직 없으면 "아직 없어요"를
//   한국어로 알리고 종료 코드 0으로 끝난다(구역이 파일을 만들기 전에도 명령이 깨지지 않게).
// - 있으면 `playwright test <그 파일들> <인자>`를 돌린다. 설정은 playwright.config.ts 그대로다 — PW_BASE_URL이 없으면 npm run build 뒤
//   미리 보기 서버를 띄우고, 있으면 그 주소(각자 띄운 개발 서버)를 시험한다.
// - 환경 변수 APC_E2E_GROUP=<무리>를 넘긴다. spec은 이 값으로 "이 명령으로 돌 때만" 도는 검사를 고를 수 있다
//   (예: 오래 걸리는 성능 측정은 `test.skip(process.env.APC_E2E_GROUP !== 'perf', …)`로 전체 실행(npm run test:e2e)에서 뺀다).
//   무리 파일은 tests/e2e/에 있으므로 따로 빼지 않으면 npm run test:e2e(CI 포함)에서도 함께 돈다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const E2E_DIR = path.join(rootDir, 'tests', 'e2e');
const PLAYWRIGHT_CLI = path.join(rootDir, 'node_modules', '@playwright', 'test', 'cli.js');

/** 무리 이름 → 만드는 구역(안내 문장용). 새 무리를 더하면 package.json 명령 한 줄과 여기 한 줄 */
export const E2E_GROUPS = Object.freeze({
  a11y: { command: 'npm run test:a11y', owner: 'Phase 6 구역 B(접근성, P6-03)' },
  perf: { command: 'npm run perf:measure', owner: 'Phase 6 구역 A(성능, P6-02)' },
});

/**
 * tests/e2e/ 바로 아래에서 <무리>*.spec.ts 파일을 찾는다(저장소 뿌리 기준, / 구분, 이름 차례).
 * @param {string} group
 * @param {string} [dir]
 * @returns {string[]}
 */
export function findGroupSpecs(group, dir = E2E_DIR) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(group) && entry.name.endsWith('.spec.ts'))
    .map((entry) => path.relative(rootDir, path.join(dir, entry.name)).split(path.sep).join('/'))
    .sort();
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [group, ...playwrightArgs] = process.argv.slice(2);
  const known = group ? /** @type {Record<string, { command: string, owner: string }>} */ (E2E_GROUPS)[group] : undefined;
  if (!group || !/^[a-z][a-z\d-]*$/u.test(group)) {
    console.error('[브라우저 테스트 무리] 무리 이름을 적어요. 예: node scripts/run-e2e-group.mjs a11y');
    process.exit(1);
  }
  const specs = findGroupSpecs(group);
  if (specs.length === 0) {
    const who = known ? ` ${known.owner}가 만들어요.` : '';
    console.log(`[브라우저 테스트 무리] 아직 없어요: tests/e2e/${group}*.spec.ts 파일이 없어서 돌릴 검사가 없어요.${who}`);
    process.exit(0);
  }
  console.log(`[브라우저 테스트 무리] ${group}: ${specs.join(', ')}`);
  const result = spawnSync(process.execPath, [PLAYWRIGHT_CLI, 'test', ...specs, ...playwrightArgs], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, APC_E2E_GROUP: group },
    windowsHide: true,
  });
  if (result.error) {
    console.error(`[브라우저 테스트 무리] Playwright를 실행하지 못했어요: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
