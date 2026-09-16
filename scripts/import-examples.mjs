// 예제 이관 도구(PLAN §8.0 PD-33) — 원본 zip의 코드를 examples/로 옮기고 줄 수·구문을 대조해 목록 파일에 기록한다.
//
// 쓰는 법(저장소 뿌리에서)
//   node scripts/import-examples.mjs                  목록(scripts/examples-manifest.yaml)의 모든 항목을 옮긴다
//   node scripts/import-examples.mjs f026 f027        적은 id만 옮긴다
//   node scripts/import-examples.mjs --verify         원본 없이 examples/의 파일이 기록(sha256·줄 수·LF·사이드카)과 같은지 본다
//   node scripts/import-examples.mjs --materials <폴더>   원본 폴더 위치(기본: 목록의 materials_root — 운영자 PC는 저장소 뿌리)
//   node scripts/import-examples.mjs --no-python      파이썬 없이 가벼운 구문 검사만(파이썬 3이 있으면 ast.parse를 쓴다)
//   node scripts/import-examples.mjs --dry-run        쓰지 않고 검사만
// 원본 코드 파일은 줄 끝(CRLF → LF)만 바뀌고, 제목·설명은 옆의 <이름>.meta.yaml(사이드카)에 적는다(src/lab/README.md 3절).
// 자세한 규칙은 scripts/lib/import-examples.mjs 머리말.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPython, importExamples, verifyExamples } from './lib/import-examples.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);

function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

const materials = readOption('--materials');
const verify = args.includes('--verify');
const noPython = args.includes('--no-python');
const dryRun = args.includes('--dry-run');
const ids = args.filter((arg) => !arg.startsWith('--'));

if (verify) {
  const result = verifyExamples({ rootDir });
  if (result.ok) {
    console.log(`[예제 대조] ${result.checked}/${result.total}개가 기록과 같아요.`);
  } else {
    console.error(`[예제 대조] 실패 — ${result.problems.length}개 문제`);
    for (const problem of result.problems) {
      console.error(`- ${problem}`);
    }
    process.exitCode = 1;
  }
} else {
  const python = noPython ? null : findPython();
  if (!python) {
    console.warn('[예제 이관] 참고: 파이썬 3을 찾지 못해 가벼운 구문 검사(node-light)만 해요. 정확한 검사는 파이썬 3을 설치한 뒤 다시 실행해요.');
  }
  const result = importExamples({
    rootDir,
    ids,
    python,
    write: !dryRun,
    ...(materials ? { materialsRoot: path.resolve(materials) } : {}),
  });
  for (const item of result.results) {
    const mark = item.ok ? '옮김' : '실패';
    const detail = item.ok ? `${item.lines}줄, 구문 ${item.syntax}(${item.syntaxChecker}), 사이드카 ${item.sidecar === 'created' ? '새로 만듦' : item.sidecar === 'kept' ? '그대로' : '안 씀'}` : item.problems[0] ?? '';
    console.log(`[예제 이관] ${mark} ${item.id} → ${item.target} — ${detail}`);
  }
  if (result.ok) {
    console.log(`[예제 이관] ${result.summary}`);
  } else {
    console.error(`[예제 이관] 실패 — ${result.summary}\n`);
    console.error(result.errors.join('\n\n'));
    process.exitCode = 1;
  }
}
