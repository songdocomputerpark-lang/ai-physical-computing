/**
 * 같은 사이트에서 내보내는 외부 자산(public/vendor/)의 주소 — 병렬 제작 준비(2026-09-17, PLAN §8.3 P3-06 앞).
 *
 * 파일은 scripts/vendor-assets.mjs가 npm 패키지에서 public/vendor/<이름>/<판>/으로 복사한다(npm run dev·build 앞, 커밋하지 않음 — PD-02).
 * 판(버전)이 주소에 들어가서 서비스 워커가 캐시 우선으로 받을 수 있다(src/sw/sw.js의 vendor/ 규칙).
 * package.json의 설치 판과 같은지는 tests/unit/vendor-paths.test.ts가 확인한다(패키지를 올리면 이 파일의 판도 함께 고친다).
 */
import { withBase } from '../lib/url.ts';

/** npm 패키지 blockly의 판(package.json과 같아야 한다) */
export const BLOCKLY_VERSION = '13.3.0';

/**
 * Blockly.inject(div, { media: blocklyMediaPath() })에 넘길 주소(끝이 /). 효과음·커서·아이콘을 같은 사이트에서 받는다.
 * media 옵션을 주지 않으면 Blockly가 외부 주소(blockly-demo.appspot.com)에서 받으려 해서 원칙 2·PD-02에 어긋난다.
 */
export function blocklyMediaPath(): string {
  return `${withBase(`vendor/blockly/${BLOCKLY_VERSION}/media/`)}`;
}
