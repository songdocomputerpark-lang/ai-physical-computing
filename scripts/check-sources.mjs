// 출처 검사(PLAN §8.1 P1-04 ②, SPEC §8 "등록 안 된 외부 자료는 빌드 실패")
//
// - 빌드 전(npm의 prebuild): node scripts/check-sources.mjs
//     public/·examples/·content/의 모든 파일과 package.json의 dependencies가 sources.yaml에 등록됐는지,
//     한 파일이 저작자가 다른 두 항목에 동시에 걸리지 않았는지 검사한다.
// - 빌드 뒤(npm의 postbuild): node scripts/check-sources.mjs --bundle
//     배포 번들에 실제로 들어간 npm 패키지(dist/bundle-licenses.json, scripts/lib/bundle-license.mjs 참고)가
//     등록됐는지 검사하고, 목록 파일은 배포되지 않게 지운다.
// 문제가 있으면 한국어로 알리고 종료 코드 1로 끝나서 빌드(와 배포)를 멈춘다.
//
// 선택: --root <폴더>  다른 폴더를 검사한다(단위 테스트용).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBundleDependencies, checkSourceFiles } from './lib/sources-check.mjs';

const args = process.argv.slice(2);
const rootOptionIndex = args.indexOf('--root');
const rootDir =
  rootOptionIndex >= 0 && args[rootOptionIndex + 1]
    ? path.resolve(args[rootOptionIndex + 1])
    : fileURLToPath(new URL('..', import.meta.url));

const result = args.includes('--bundle') ? checkBundleDependencies({ rootDir }) : checkSourceFiles({ rootDir });

for (const warning of result.warnings) {
  console.warn(`[출처 검사] 참고: ${warning}`);
}
if (result.ok) {
  console.log(`[출처 검사] ${result.summary}`);
} else {
  console.error(`[출처 검사] 실패 — 아래 문제를 고치기 전에는 빌드를 멈춰요.\n`);
  console.error(result.errors.join('\n\n'));
  process.exitCode = 1;
}
