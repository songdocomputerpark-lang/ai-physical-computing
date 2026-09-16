/**
 * lz-string 1.5.0 감싸기(PLAN §3.1 "공유 링크").
 *
 * lz-string은 CommonJS/UMD 한 가지로만 배포되고(libs/lz-string.js: `module.exports = LZString`, 이름 있는 내보내기가 없음),
 * 타입 선언(typings/lz-string.d.ts)은 이름 있는 내보내기로 적혀 있다. 그래서
 * - Node.js(Vitest)와 Rollup(Vite 빌드)이 이름 있는 가져오기(`import { compressToEncodedURIComponent }`)를 찾지 못할 수 있고,
 * - 기본 가져오기(`import LZString from`)는 타입 검사가 거절한다.
 * 이름 공간 가져오기로 받아 `default`(module.exports)가 있으면 그것을, 없으면 이름 공간 자체를 쓴다. 다른 파일은 이 파일만 쓴다.
 */
import * as lzNamespace from 'lz-string';

type LzModule = typeof lzNamespace;

const lz: LzModule = (lzNamespace as unknown as { default?: LzModule }).default ?? lzNamespace;

/** 글자를 주소에 넣을 수 있는 글자(A-Z a-z 0-9 + - $)로 압축한다. */
export function compressForUrl(text: string): string {
  return lz.compressToEncodedURIComponent(text);
}

/** compressForUrl의 반대. 망가진 값이면 null(빈 글자를 압축한 값은 빈 글자). */
export function decompressFromUrl(packed: string): string | null {
  const result: unknown = lz.decompressFromEncodedURIComponent(packed);
  return typeof result === 'string' ? result : null;
}
