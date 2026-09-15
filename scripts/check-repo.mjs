// 저장소 검사(PLAN §8.0 PD-32) — 커밋 전 훅(.githooks/pre-commit)과 CI(.github/workflows/deploy.yml)가 부른다.
//
// 스테이징된 내용(= 커밋될 내용)에 공개 저장소에 올리면 안 되는 것이 있으면 한국어로 알리고
// 종료 코드 1로 끝나서 커밋과 배포를 막는다. 검사 항목은 scripts/lib/repo-check.mjs 머리말에 있다.
// 직접 돌리기: npm run check:repo
//
// 선택: --root <폴더>  다른 git 저장소를 검사한다(단위 테스트용).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatRepoReport, runRepoCheck } from './lib/repo-check.mjs';

const args = process.argv.slice(2);
const rootOptionIndex = args.indexOf('--root');
const rootDir =
  rootOptionIndex >= 0 && args[rootOptionIndex + 1]
    ? path.resolve(args[rootOptionIndex + 1])
    : fileURLToPath(new URL('..', import.meta.url));

try {
  const result = runRepoCheck({ rootDir });
  const report = formatRepoReport(result);
  if (result.ok) {
    console.log(report);
  } else {
    console.error(report);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[저장소 검사] 검사를 끝내지 못해 멈췄어요: ${error instanceof Error ? error.message : String(error)}`);
  console.error('  git 저장소 안에서 실행했는지, git이 설치돼 있는지 확인해요.');
  process.exitCode = 1;
}
