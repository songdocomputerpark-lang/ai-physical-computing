// 회로 파일 만들기: scripts/circuits/circuits.yaml의 그림 설명 → scripts/circuits/<id>.circuit
//
// 쓰는 법(저장소 뿌리에서)
//   npm run circuits:build                 모든 그림의 .circuit 파일을 다시 쓴다(내용이 같으면 건드리지 않음)
//   npm run circuits:build -- 2-2-1-1      적은 id만
//   npm run circuits:build -- --check      쓰지 않고 파일이 목록과 같은지만 본다(다르면 종료 코드 1 — 테스트가 같은 검사를 한다)
//
// .circuit 파일은 회로 구성 도구(https://circuit.gorillacell.kr/)의 [프로젝트 불러오기]로 열 수 있다 — 눈으로 보고 손으로 고쳐 [프로젝트 저장]한
// 파일을 이 폴더에 덮어써도 내보내기는 되지만, 그러면 circuits.yaml과 달라져 이 검사가 알려 준다(목록을 고치고 다시 만드는 쪽이 원칙).
// 놓는 규칙은 lib/build-circuit.mjs 머리말, 도구의 보드·부품 표는 lib/catalog.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { buildCircuit } from './lib/build-circuit.mjs';

const circuitsDir = fileURLToPath(new URL('.', import.meta.url));
const listPath = path.join(circuitsDir, 'circuits.yaml');

/** circuits.yaml을 읽어 그림 목록을 돌려준다. */
export function readFigureList() {
  const list = YAML.parse(fs.readFileSync(listPath, 'utf8'));
  if (!list || !Array.isArray(list.figures)) {
    throw new Error('[회로] circuits.yaml에 figures 목록이 없어요.');
  }
  return list;
}

/** `.circuit` 파일에 쓸 글(들여쓰기 2칸 JSON, 줄 끝 LF, 맨 끝 줄바꿈 하나). */
export function circuitText(figure) {
  return `${JSON.stringify(buildCircuit(figure), null, 2)}\n`;
}

export function circuitPath(id) {
  return path.join(circuitsDir, `${id}.circuit`);
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const ids = args.filter((arg) => !arg.startsWith('--'));
  const { figures } = readFigureList();
  const targets = ids.length > 0 ? figures.filter((figure) => ids.includes(figure.id)) : figures;
  const unknown = ids.filter((id) => !figures.some((figure) => figure.id === id));
  if (unknown.length > 0) {
    console.error(`[회로] 목록에 없는 id: ${unknown.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  let changed = 0;
  let differs = 0;
  for (const figure of targets) {
    const text = circuitText(figure);
    const file = circuitPath(figure.id);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === text) {
      continue;
    }
    if (check) {
      differs += 1;
      console.error(`[회로] ${figure.id}.circuit이 목록과 달라요(없거나 손으로 고친 파일).`);
    } else {
      fs.writeFileSync(file, text, 'utf8');
      changed += 1;
    }
  }

  if (check) {
    if (differs > 0) {
      console.error(`[회로] ${differs}개가 다르거나 없어요. npm run circuits:build로 다시 만들어요.`);
      process.exitCode = 1;
    } else {
      console.log(`[회로] ${targets.length}개 모두 목록과 같아요.`);
    }
    return;
  }
  console.log(`[회로] ${targets.length}개 중 ${changed}개를 새로 썼어요(나머지는 이미 같아요).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
