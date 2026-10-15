#!/usr/bin/env node
// 교과서 쪽 검사(엄격 모드) — npm run check:book (판 1.4.0, DECISIONS C131·C134)
//
//   npm run check:book                 content/book의 모든 쪽(초안 draft: true는 건너뜀)
//   npm run check:book -- 2-1-2         몇 개만(쪽 id·파일 경로)
//   npm run check:book -- --drafts      초안도 함께 검사
//
// 오류가 하나라도 있으면 종료 코드 1. 규칙은 src/components/book/book-rules.ts(빌드도 같은 규칙을 경고로 씀)와 scripts/lib/check-book.mjs(파일을 여는 검사)에 있다.
// 출판본 글자와의 같음은 npm run book:fidelity(원본 PDF가 있는 운영자 PC에서만)가 본다. CI "테스트" 워크플로는 이 검사만 돈다(원본이 저장소에 없다 — C138).
import { formatBookCheck, reportFailed, runBookCheck } from './lib/check-book.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      '교과서 쪽 검사(엄격 모드)',
      '  npm run check:book                 모든 쪽(초안 제외)',
      '  npm run check:book -- 2-1-2        몇 개만(쪽 id·파일 경로)',
      '  npm run check:book -- --drafts     초안(draft: true)도 검사',
    ].join('\n'),
  );
  process.exit(0);
}

const unknown = args.filter((arg) => arg.startsWith('--') && !['--drafts'].includes(arg));
if (unknown.length > 0) {
  console.error(`[교과서 쪽 검사] 모르는 옵션: ${unknown.join(', ')} (--help로 쓰는 법을 봐요)`);
  process.exit(2);
}

const only = args.filter((arg) => !arg.startsWith('--'));
const report = await runBookCheck({ rootDir: process.cwd(), only, includeDrafts: args.includes('--drafts') });
if (report.books.length === 0 && only.length > 0) {
  console.error(`[교과서 쪽 검사] 찾는 쪽이 없어요: ${only.join(', ')}`);
  process.exit(1);
}
console.log(formatBookCheck(report));
process.exit(reportFailed(report) ? 1 : 0);
