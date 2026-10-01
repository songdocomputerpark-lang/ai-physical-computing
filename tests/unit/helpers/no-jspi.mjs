// JSPI(WebAssembly 스택 전환)가 없는 브라우저 — Safari·Firefox·옛 Chrome에서 실습실이 도는 "제한 모드" — 를 Node에서 흉내 내는 미리 불러오기 모듈.
// `node --experimental-wasm-jspi --import <이 파일의 file:// 주소> <도우미 스크립트>`처럼 가장 먼저 불러, Pyodide가 JSPI를 알아보기 전에 그 이름을 지운다.
// 쓰는 곳: tests/unit/helpers/no-jspi.ts(NO_JSPI_NODE_ARGS·nodeCanHideJspi)를 거쳐 pyodide-node·pyodide-pyautogui·pyodide-mediapipe 단위 테스트의 제한 모드 묶음.
//
// 왜 플래그(--no-experimental-wasm-jspi)가 아닌가(2026-09-30 최종 점검 TD-05): JSPI가 기본으로 켜진 Node(CI의 24.20 이상)에서는 그 플래그로 끌 수 없어
// 제한 모드 검사가 CI에서 조용히 건너뛰어졌다(CI 36563749761 — pyodide-node 1·pyautogui 4·mediapipe 1 건너뜀). 이름을 지우는 방식은 Node 판과 상관없이 같다.
// Pyodide 314.0.7은 `"Suspending" in WebAssembly`(새 JSPI API)와 `"Suspender" in WebAssembly`(옛 API)로 JSPI를 알아본다
// (node_modules/pyodide/pyodide.asm.mjs의 newJspiSupported·oldJspiSupported). 그래서 둘을 지우면 can_run_sync()가 거짓인 제한 모드로 뜬다 —
// 브라우저가 JSPI를 모를 때와 같은 길이다. promising은 새 API의 짝이라 함께 지운다.
// 지우지 못하면(속성을 바꿀 수 없는 앞으로의 Node) 조용히 넘어가지 않고 이 모듈이 실패해, 검사가 건너뛰는 대신 까닭을 보인다.
const NAMES = ['Suspending', 'Suspender', 'promising'];

for (const name of NAMES) {
  if (name in WebAssembly) {
    delete WebAssembly[name];
  }
  if (name in WebAssembly) {
    throw new Error(`no-jspi.mjs: WebAssembly.${name}을(를) 지우지 못했어요 — 이 Node에서는 JSPI 없는 브라우저를 흉내 낼 수 없어요.`);
  }
}
