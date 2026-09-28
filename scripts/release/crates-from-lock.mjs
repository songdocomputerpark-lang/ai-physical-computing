// Cargo.lock → 대응 소스 목록(scripts/release/sources-manifest.json)의 크레이트 항목(운영자 할 일 26 — 유지보수 도구).
//
// 사이트 검색 엔진 wasm(Pagefind)의 대응 소스에는 pagefind_web/Cargo.lock에 적힌 crates.io 크레이트가 모두 들어간다(cargo vendor가 받는
// 범위 — wasm에 함께 컴파일되는 것과 wasm을 만들 때만 쓰는 매크로). Cargo.lock의 checksum이 곧 .crate 파일의 SHA-256이라 공식 값이다.
// Pagefind 판을 올리면(MAINTENANCE.md 8절) 그 판 태그의 pagefind_web/Cargo.lock 원문을 받아 이 도구로 항목을 다시 만들고,
// 크레이트마다 라이선스(crates.io의 license 칸)와 쓰임(wasm | build — Pagefind 고지 파일 pagefind-wasm-3rd-party.txt의 표)을 채운다.
// 채우지 않으면 "TODO"로 남아 목록 검사(npm test)가 막는다.
//
// 쓰는 법
//   node scripts/release/crates-from-lock.mjs <Cargo.lock 파일> [--source "<어디서 받은 잠금 파일인지>"] [--group gpl-pagefind]
//   → 표준 출력에 JSON 배열(목록 items에 붙여 넣을 것)
import fs from 'node:fs';
import { crateSourceItem, cratesFromCargoLock } from '../lib/offline-sources.mjs';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

const file = process.argv[2];
if (!file || file.startsWith('--')) {
  console.error('쓰는 법: node scripts/release/crates-from-lock.mjs <Cargo.lock 파일> [--source "<출처>"] [--group gpl-pagefind]');
  process.exit(2);
}
const hashSource = option('--source', `checksum in ${file.replace(/\\/gu, '/').split('/').slice(-2).join('/')}`);
const group = option('--group', 'gpl-pagefind');
const crates = cratesFromCargoLock(fs.readFileSync(file, 'utf8'));
const items = crates.map((crate) => crateSourceItem(crate, { hashSource, group }));
console.log(JSON.stringify(items, null, 2));
console.error(`크레이트 ${items.length}개 — license와 use(wasm | build)를 crates.io·고지 파일로 확인해 채워요(비우면 목록 검사가 막아요).`);
