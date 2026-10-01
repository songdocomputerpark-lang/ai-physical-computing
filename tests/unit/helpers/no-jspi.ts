// JSPI 없는 브라우저(실습실 "제한 모드")를 Node에서 흉내 내는 실행 인자와 확인 — 까닭은 미리 불러오기 모듈 no-jspi.mjs 머리말.
// 2026-09-30 최종 점검 TD-05: 전에는 --no-experimental-wasm-jspi로 JSPI를 껐는데, JSPI가 기본으로 켜진 Node(CI 24.20 이상)는 그 플래그로 끌 수 없어
// 제한 모드 검사가 CI에서 조용히 건너뛰어졌다. 이제는 JSPI를 켠 채(엔진은 JSPI를 아는 새 Node처럼) Pyodide가 알아보는 이름만 지운다 —
// 운영자 PC(24.19 — 기본 꺼짐)와 CI(24.21 — 기본 켜짐)에서 똑같이 돈다.
//
//   import { NO_JSPI_NODE_ARGS, nodeCanHideJspi, noJspiProblem } from '../helpers/no-jspi.ts';
//   spawnSync(process.execPath, [...NO_JSPI_NODE_ARGS, 도우미스크립트, 뿌리]);
//   expect(nodeCanHideJspi, noJspiProblem).toBe(true); // 흉내를 못 내면 건너뛰지 않고 실패한다
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 미리 불러오기 모듈의 file:// 주소(--import는 Windows 경로가 아닌 주소를 받는다 — 한글·공백은 퍼센트 인코딩된다) */
export const NO_JSPI_PRELOAD_URL = pathToFileURL(path.join(import.meta.dirname, 'no-jspi.mjs')).href;

/** 제한 모드로 띄울 Node 인자(스크립트 경로 앞에 둔다) */
export const NO_JSPI_NODE_ARGS: readonly string[] = Object.freeze(['--experimental-wasm-jspi', '--import', NO_JSPI_PRELOAD_URL]);

const probe = spawnSync(
  process.execPath,
  [...NO_JSPI_NODE_ARGS, '-e', "process.stdout.write([typeof WebAssembly.Suspending, typeof WebAssembly.Suspender, typeof WebAssembly.promising].join(' '))"],
  { encoding: 'utf8', timeout: 20_000 },
);

/** 이 Node에서 JSPI 이름을 숨길 수 있는지 — 늘 참이어야 한다. 거짓이면 까닭은 noJspiProblem */
export const nodeCanHideJspi = probe.status === 0 && probe.stdout === 'undefined undefined undefined';

/** 숨기지 못했을 때의 까닭(검사 실패 메시지에 넣는다). 숨겼으면 빈 글 */
export const noJspiProblem = nodeCanHideJspi
  ? ''
  : `JSPI 없는 브라우저를 흉내 내지 못했어요(tests/unit/helpers/no-jspi.mjs, 종료 코드 ${String(probe.status)}): ${String(probe.stderr || probe.stdout).slice(-500)}`;
