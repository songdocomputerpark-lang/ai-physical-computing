#!/usr/bin/env node
// 차시 틀 검사(엄격 모드) — npm run check:lessons (PLAN §8.5 P5-02·P5-14, PD-35)
//
//   npm run check:lessons                          content/lessons의 모든 차시(초안 draft: true는 건너뜀) + 아직 없는 차시 목록
//   npm run check:lessons -- 1-2-1                 차시 번호·파일 이름·경로로 몇 개만(구역 작업 중에는 자기 차시만)
//   npm run check:lessons -- --drafts              초안도 함께 검사
//   npm run check:lessons -- --complete            차례표의 차시가 모두 있어야 통과(Phase 5 완료 기준 — P5-14)
//
// 오류가 하나라도 있으면 종료 코드 1. 규칙은 src/components/lesson/lesson-rules.ts(빌드도 같은 규칙을 경고로 씀)와
// scripts/lib/check-lessons.mjs(파일을 여는 검사)에 있고, 규칙 표는 MAINTENANCE.md 1-6.
//
// 왜 npm test에 넣지 않나(PD-35): 여러 구역이 한 작업 폴더에서 동시에 차시를 쓰는 동안, 다른 구역의 쓰다 만 차시 때문에
// 내 단위 테스트가 깨지지 않게 하려는 것이다. 규칙 자체는 단위 테스트(tests/unit/lesson/lesson-rules.test.ts·check-lessons.test.ts)가 지키고,
// 올라간 차시 전체는 CI "테스트" 워크플로의 이 검사가 본다(배포는 막지 않음 — 새 차시는 경고만 나고 바로 배포된다, 시나리오 E).
import { formatLessonCheck, reportFailed, runLessonCheck } from './lib/check-lessons.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      '차시 틀 검사(엄격 모드)',
      '  npm run check:lessons                 모든 차시(초안 제외) + 아직 없는 차시 목록',
      '  npm run check:lessons -- 1-2-1 v4     몇 개만(차시 번호·파일 이름·경로)',
      '  npm run check:lessons -- --drafts     초안(draft: true)도 검사',
      '  npm run check:lessons -- --complete   차례표의 차시가 모두 있어야 통과(Phase 5 완료 기준)',
    ].join('\n'),
  );
  process.exit(0);
}

const unknown = args.filter((arg) => arg.startsWith('--') && !['--drafts', '--complete'].includes(arg));
if (unknown.length > 0) {
  console.error(`[차시 틀 검사] 모르는 옵션: ${unknown.join(', ')} (--help로 쓰는 법을 봐요)`);
  process.exit(2);
}

const report = await runLessonCheck({
  rootDir: process.cwd(),
  only: args.filter((arg) => !arg.startsWith('--')),
  includeDrafts: args.includes('--drafts'),
  complete: args.includes('--complete'),
});
if (report.lessons.length === 0 && args.some((arg) => !arg.startsWith('--'))) {
  console.error(`[차시 틀 검사] 찾는 차시가 없어요: ${args.filter((arg) => !arg.startsWith('--')).join(', ')}`);
  process.exit(1);
}
console.log(formatLessonCheck(report));
process.exit(reportFailed(report) ? 1 : 0);
