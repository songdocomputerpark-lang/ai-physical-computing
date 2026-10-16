/**
 * 키트 장치 도감 예제의 코드·설명·배선 JSON(판 1.5.0 — ESP32 실습실에서 고를 때 받는다, src/lab/controls/lazy-examples.ts).
 *
 * 빌드가 예제마다 `<base>/labs/esp32/kit-code/<장>/<이름>.json` 정적 파일을 하나씩 만든다(examples/esp32/kit/<장>/<이름>.py → 이 파일).
 * 실습실 HTML(index.astro)에는 목록 자리만 있어서 첫 방문이 가볍다(DECISIONS C15·C151).
 * - 서비스 워커: 사전 캐시(셸)에 넣지 않는다 — build-sw.mjs는 홈 HTML이 가리키는 셸 파일만 넣는다. 받은 뒤에는 static 규칙
 *   (먼저 주고 뒤에서 새로 받음)으로 남아 다시 열 때·인터넷이 끊겼을 때도 열린다(주소 끝 ?v=<판>이 판마다 열쇠를 나눈다).
 * - 오프라인 배포판: 빌드 결과에 들어 있어 zip에 함께 담긴다(.json MIME — scripts/lib/offline-site.mjs).
 * - 링크 검사: 실습실 HTML의 목록 JSON에 적힌 codeUrl이 이 파일을 가리키는지 본다(scripts/lib/link-check.mjs).
 * 새 키트 예제 = examples/esp32/kit/ 아래 .py + 사이드카 — 이 파일은 고칠 일이 없다(원칙 6).
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import type { LazyExamplePayload } from '../../../../lab/controls/lazy-examples.ts';
import { esp32LabExamples } from '../_lab-examples.ts';

export const getStaticPaths = (async () => {
  const { payloads } = await esp32LabExamples();
  return payloads.map(({ param, payload }) => ({ params: { file: param }, props: { payload } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ payload: LazyExamplePayload }> = ({ props }) =>
  new Response(JSON.stringify(props.payload), { headers: { 'content-type': 'application/json; charset=utf-8' } });
