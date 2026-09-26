// @ts-check
// 오프라인 배포판 빌드 설정(PLAN §5.6, P6-07) — scripts/build-offline.mjs가 `npm run build -- --config <이 파일>`로 쓴다.
//
// 보통 설정(저장소 뿌리의 astro.config.mjs)을 그대로 불러와 **한 가지만** 더한다: 브라우저 번들에 `__APC_OFFLINE__ = true`를 새긴다
// (vite.define — 보통 설정이 `__APC_BASE__`를 새기는 것과 같은 방식). 그 표시를 읽는 곳은 src/lab/runtime/config.ts의 OFFLINE_BUILD 하나다:
// 파이썬 엔진(Pyodide)을 jsDelivr 대신 같은 사이트 파일에서만 받고, 미리 받기·캐시 채우기도 같은 사이트 주소를 쓴다.
// 사이트 뿌리 경로(APC_BASE=/)와 결과 폴더(APC_OUT_DIR)는 보통 설정이 환경 변수로 읽는다(src/config/site.ts) — build-offline.mjs가 넘긴다.
//
// 보통 빌드(npm run build)·개발 서버는 이 파일을 쓰지 않으므로 온라인 사이트는 그대로다.
import baseConfig from '../../astro.config.mjs';

const baseVite = baseConfig.vite ?? {};

/** @type {import('astro').AstroUserConfig} */
const offlineConfig = {
  ...baseConfig,
  vite: {
    ...baseVite,
    define: {
      ...(baseVite.define ?? {}),
      __APC_OFFLINE__: 'true',
    },
  },
};

export default offlineConfig;
