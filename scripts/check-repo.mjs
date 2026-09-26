// 저장소 검사(PLAN §8.0 PD-32) — 커밋 전 훅(.githooks/pre-commit)과 CI(.github/workflows/deploy.yml)가 부른다.
//
// 스테이징된 내용(= 커밋될 내용)에 공개 저장소에 올리면 안 되는 것이 있으면 한국어로 알리고
// 종료 코드 1로 끝나서 커밋과 배포를 막는다. 검사 항목은 scripts/lib/repo-check.mjs 머리말에 있다.
// 직접 돌리기: npm run check:repo
//
// 선택(손으로 돌리는 훑기 — 2026-09-26 P6-05 개인정보 최종 점검, MAINTENANCE.md 연 1회 점검):
//   --worktree       스테이징 전 작업 폴더 전체(추적 파일 + git이 무시하지 않는 새 파일)를 같은 규칙으로 본다
//   --history        git 기록 전체(지운 파일 포함)를 개인정보·그림 규칙으로 훑는다. 확인해 둔 것은 repo-allowlist.yaml history_reviewed
//   --dist <폴더>    빌드 결과 폴더(dist, 오프라인판 폴더 등)에 이 컴퓨터의 절대 경로·개인정보 모양·그림 메타데이터가 없는지 본다
//   --root <폴더>    다른 git 저장소를 검사한다(단위 테스트용)
// npm으로: npm run check:repo -- --history

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatBuildOutputReport,
  formatHistoryReport,
  formatRepoReport,
  runBuildOutputCheck,
  runHistoryCheck,
  runRepoCheck,
} from './lib/repo-check.mjs';

const args = process.argv.slice(2);
/** @param {string} name */
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const rootOption = valueOf('--root');
const rootDir = rootOption ? path.resolve(rootOption) : fileURLToPath(new URL('..', import.meta.url));

try {
  if (args.includes('--history')) {
    const result = runHistoryCheck({ rootDir });
    const report = formatHistoryReport(result);
    if (result.ok) console.log(report);
    else {
      console.error(report);
      process.exitCode = 1;
    }
  } else if (args.includes('--dist')) {
    const outDir = valueOf('--dist');
    if (!outDir) throw new Error('--dist 뒤에 빌드 결과 폴더를 적어요(예: --dist dist).');
    const result = runBuildOutputCheck({ rootDir, outDir });
    const report = formatBuildOutputReport(result);
    if (result.ok) console.log(report);
    else {
      console.error(report);
      process.exitCode = 1;
    }
  } else {
    const result = runRepoCheck({ rootDir, source: args.includes('--worktree') ? 'worktree' : 'index' });
    const report = formatRepoReport(result);
    if (result.ok) {
      console.log(report);
    } else {
      console.error(report);
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(`[저장소 검사] 검사를 끝내지 못해 멈췄어요: ${error instanceof Error ? error.message : String(error)}`);
  console.error('  git 저장소 안에서 실행했는지, git이 설치돼 있는지(--dist면 폴더가 있는지) 확인해요.');
  process.exitCode = 1;
}
