// 배포 번들 의존성 목록(PLAN §8.1 P1-04).
//
// 무엇을 하나
// - 브라우저로 가는 코드(Vite의 client 환경)를 만들 때 Vite의 build.license 옵션을 켜서,
//   번들에 실제로 들어간 npm 패키지의 이름·버전·라이선스를 dist/bundle-licenses.json에 JSON 배열로 남긴다.
//   파일 이름이 .json으로 끝나면 Vite는 이 형식으로 쓴다(공식 문서: https://vite.dev/config/build-options#build-license).
// - 빌드가 끝나면 scripts/check-sources.mjs --bundle(npm의 postbuild)이 이 파일을 sources.yaml과 대조하고 지운다.
//
// 이렇게 만든 이유(2026-09-15 Astro 7.3.2 · Vite 8.3.0에서 실험으로 확인)
// - Astro는 client 환경의 build 설정을 새로 만들어서 astro.config.mjs의 vite.environments.client.build.license가 전달되지 않는다.
// - 맨 위 vite.build.license는 전달되지만, Astro가 client 빌드 결과의 .vite/ 폴더를 지워서 기본 위치(.vite/license.md)에 남지 않는다.
// - 그래서 Vite 플러그인의 configEnvironment 훅으로 client 환경에만 옵션을 넣고, 파일은 .vite/ 밖에 둔다.
//   (서버 쪽 prerender 환경에는 넣지 않는다. 그 목록에는 빌드할 때만 쓰는 패키지가 섞인다.)
//
// 이 파일은 다른 모듈을 불러오지 않는다. astro.config.mjs가 가볍게 불러오게 하기 위해서다.

/** 빌드 결과 폴더(Astro outDir 기본값, withastro/action의 out-dir 기본값과 같다) */
export const BUILD_OUTPUT_DIR = 'dist';

/** 빌드 결과 폴더 기준 번들 의존성 목록 파일 */
export const BUNDLE_LICENSE_FILE = 'bundle-licenses.json';

/** 브라우저용 코드를 만드는 Vite 환경 이름(Astro 7) */
const CLIENT_ENVIRONMENT_NAME = 'client';

/**
 * client 환경에만 Vite build.license를 켜는 플러그인.
 * astro.config.mjs의 vite.plugins에 넣는다.
 * @returns {{ name: string, configEnvironment: (name: string) => ({ build: { license: { fileName: string } } } | undefined) }}
 */
export function clientBundleLicensePlugin() {
  return {
    name: 'apc:client-bundle-license',
    configEnvironment(name) {
      if (name !== CLIENT_ENVIRONMENT_NAME) {
        return undefined;
      }
      return { build: { license: { fileName: BUNDLE_LICENSE_FILE } } };
    },
  };
}
