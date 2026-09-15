// 사이트 안 링크 검사(PLAN §8.1 P1-09) — npm run check:links
//
// npm run build로 만든 dist/를 읽어, 페이지·그림·글꼴·스크립트와 주소 뒤 #위치가 모두 실제로 있는지 본다.
// 사이트 주소(도메인과 base)는 package.json의 homepage에서 읽는다(src/config/site.ts와 같은 값인지 단위 테스트가 확인).
// 문제가 있으면 한국어로 알리고 종료 코드 1로 끝난다. 검사 규칙은 scripts/lib/link-check.mjs 머리말에 있다.
//
// 옵션: --dist <폴더>  검사할 빌드 결과 폴더(기본: 저장소 뿌리의 dist)
// 테스트 워크플로(.github/workflows/e2e.yml)가 브라우저 테스트 뒤에 돌린다. 사이트 배포는 막지 않는다(PD-35).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinks, formatLinkReport, siteFromHomepage } from './lib/link-check.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const distIndex = args.indexOf('--dist');
const distDir = path.resolve(distIndex >= 0 && args[distIndex + 1] ? args[distIndex + 1] : path.join(repoRoot, 'dist'));

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const site = siteFromHomepage(packageJson.homepage);

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error(`[링크 검사] 빌드 결과를 찾지 못했어요(${path.relative(repoRoot, distDir) || distDir}/index.html 없음). 먼저 npm run build를 실행해요.`);
  process.exit(1);
}

const report = checkLinks(distDir, site);
const message = formatLinkReport(report, site);
if (report.problems.length > 0) {
  console.error(message);
  process.exit(1);
}
console.log(message);
