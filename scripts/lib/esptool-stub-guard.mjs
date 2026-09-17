// esptool-js의 플래셔 스텁(GPL-2.0-or-later)을 배포 번들에서 빼는 Vite 플러그인(PLAN PD-38, P3-09 준비 — 2026-09-17).
//
// 왜
// - esptool-js 0.6.1(Apache-2.0)은 lib/stubFlasher.js에서 칩마다 import("./targets/stub_flasher/stub_flasher_<칩>.json")을 한다.
//   이 JSON은 esptool.py v4.6.1에서 옮긴 플래셔 스텁 프로그램이고 GPL-2.0-or-later다(esptool-js v0.6.1 src/targets/stub_flasher/README.md,
//   2026-09-17 확인). 사이트 코드가 부르지 않아도 번들러가 동적 import마다 JSON 조각을 만들어 dist/에 싣는다.
// - SPEC §8의 허용 목록(MIT·Apache·BSD·MPL·OFL)에 GPL이 없어 사이트는 스텁을 배포하지 않는다(PD-38). 펌웨어 굽기(P3-09)는 스텁 없이
//   ESP32 ROM 부트로더와 직접 주고받는다(esptool-js의 ESPLoader.main()·runStub()을 부르지 않고 detectChip → writeFlash 순서로).
//
// 무엇을 하나
// - 스텁 JSON을 가리키는 import를 가상 모듈로 바꾼다. 그 모듈은 불러오는 순간 한국어 Error를 던지므로 runStub()은 스텁을 받지 못하고 실패한다
//   (사이트가 스텁을 쓰려고 하면 조용히 GPL 파일을 싣는 대신 이 오류로 드러난다).
// - 개발 서버에서도 같게 돌도록 astro.config.mjs가 esptool-js를 Vite 의존성 미리 묶기(optimizeDeps)에서 뺀다(미리 묶기는 플러그인을 거치지 않는다).
//   esptool-js가 쓰는 CommonJS 패키지 atob-lite는 따로 미리 묶는다.
//
// 이 파일은 astro.config.mjs가 가볍게 부르도록 다른 모듈을 불러오지 않는다. 단위 테스트: tests/unit/esptool-stub-guard.test.ts

/** esptool-js 패키지 안의 플래셔 스텁 JSON 경로(Windows·POSIX 구분자, 뒤의 ?쿼리 허용) */
export const ESPTOOL_STUB_PATTERN = /[\\/]esptool-js[\\/]lib[\\/]targets[\\/]stub_flasher[\\/]stub_flasher_[a-z0-9]+\.json(?:\?.*)?$/u;

/**
 * 바꿔 끼운 가상 모듈 이름의 머리(Rollup 관례: \0으로 시작하는 id는 다른 플러그인이 건드리지 않는다).
 * 가상 id의 끝을 .json으로 두지 않는다 — Vite 8(Rolldown)의 붙박이 JSON 플러그인이 확장자만 보고 이 코드를 JSON으로 읽으려 해서
 * 빌드가 멈춘다(2026-09-17 tests/unit/esptool-stub-guard.test.ts에서 발견). 그래서 가상 id는 "<머리><스텁 이름>.js"다.
 */
export const ESPTOOL_STUB_VIRTUAL_PREFIX = '\0apc-esptool-stub-excluded/';

/** 스텁을 불러오려 할 때 나는 오류 문장 */
export const ESPTOOL_STUB_EXCLUDED_MESSAGE =
  'esptool-js의 플래셔 스텁(GPL-2.0-or-later)은 이 사이트에 싣지 않아요(PLAN PD-38). ESPLoader.main()·runStub() 대신 ROM 부트로더로 굽는 순서(detectChip → writeFlash)를 써요.';

/**
 * 스텁 JSON을 가리키는 id인지
 * @param {string} id
 * @returns {boolean}
 */
export function isEsptoolStubId(id) {
  return typeof id === 'string' && ESPTOOL_STUB_PATTERN.test(id);
}

/**
 * 가상 모듈의 코드(불러오는 순간 오류)
 * @param {string} fileName 원래 JSON 파일 이름(오류 문장에 넣는다)
 * @returns {string}
 */
export function excludedStubModuleCode(fileName) {
  return `throw new Error(${JSON.stringify(`${ESPTOOL_STUB_EXCLUDED_MESSAGE} (${fileName})`)});\n`;
}

/**
 * 스텁 JSON 경로 → 가상 모듈 id("stub_flasher_32.json" → "\0apc-esptool-stub-excluded/stub_flasher_32.js")
 * @param {string} id
 * @returns {string}
 */
export function virtualStubId(id) {
  const fileName = id.replace(/\?.*$/u, '').split(/[\\/]/u).pop() ?? 'stub_flasher.json';
  return `${ESPTOOL_STUB_VIRTUAL_PREFIX}${fileName.replace(/\.json$/u, '')}.js`;
}

/**
 * @returns {{
 *   name: string,
 *   enforce: 'pre',
 *   resolveId: (this: { resolve: (source: string, importer?: string, options?: object) => Promise<{ id: string } | null> }, source: string, importer: string | undefined, options?: object) => Promise<string | null>,
 *   load: (id: string) => string | null,
 * }}
 */
export function esptoolStubGuardPlugin() {
  return {
    name: 'apc:esptool-stub-guard',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (typeof source !== 'string' || !source.includes('stub_flasher')) {
        return null;
      }
      if (isEsptoolStubId(source)) {
        return virtualStubId(source);
      }
      if (!importer) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...(options ?? {}), skipSelf: true });
      return resolved && isEsptoolStubId(resolved.id) ? virtualStubId(resolved.id) : null;
    },
    load(id) {
      if (typeof id !== 'string' || !id.startsWith(ESPTOOL_STUB_VIRTUAL_PREFIX)) {
        return null;
      }
      return excludedStubModuleCode(`${id.slice(ESPTOOL_STUB_VIRTUAL_PREFIX.length).replace(/\.js$/u, '')}.json`);
    },
  };
}
