// 마크다운 출력 다듬기(rehype 플러그인) — Phase 6 구역 A 자리(2026-09-26 병렬 제작 준비). **지금은 아무것도 바꾸지 않는다.**
//
// 구역 A(성능)가 채울 것(PROGRESS 미해결)
//   - 190 원고 그림 크기 속성: `![대체 글](/images/lessons/…webp)`로 넣은 그림의 <img>에 width·height를 붙여 받기 전 높이 0으로 글이
//     밀리지 않게(차시 그림 목록 content/lessons/<단원>/<차시>.images.yaml에 도구가 적은 width·height가 있다)
//   - 174 차시 번호 줄바꿈: 글 속 "2-1-2" 같은 차시 번호가 하이픈 뒤에서 줄이 바뀌지 않게(예: 번호를 <span class="nowrap">으로 감싸기 —
//     클래스는 src/styles/global.css에 미리 있다. 코드 블록(<pre>·<code>) 안과 링크 주소는 건드리지 않는다)
//
// 어디서 도나(@astrojs/markdown-remark 7.3.1 dist/index.js의 순서, 2026-09-26 확인)
//   remark 플러그인(src/lib/markdown-plugins.mjs) → remark-rehype → Shiki 코드 색 → **이 플러그인** → Astro 그림 처리(rehypeImages)
//   → 제목 id(rehypeHeadingIds) → rehype-raw → HTML 글자
//   - 빌드(astro.config.mjs)와 차시 틀 검사(npm run check:lessons — scripts/lib/check-lessons.mjs, 코드 색은 끔)가 **같은 목록**으로 부른다.
//   - 모든 마크다운에 돈다: 차시(content/lessons)·용어사전(content/glossary)·교사용 자료실 문서(content/teacher 등).
//     차시에만 하려면 두 번째 인자 file의 경로(file.path — 파일 주소에서 온 절대 경로, Windows면 \ 구분)를 보고 고른다.
//   - 마크다운 안에 적은 HTML 조각(<figure> 등)은 이 단계에서 아직 raw 노드다(rehype-raw가 뒤에 돈다) — 요소로 보이지 않는다.
//   - 차시 HTML은 이 뒤에 src/components/lesson/lesson-html.ts가 한 번 더 고친다(base 붙이기·예제 자리 등).
//
// 캐시 주의(PROGRESS 미해결 169): Astro 콘텐츠 캐시(.astro/data-store.json, node_modules/.astro/data-store.json)는 md 파일이
// 바뀌지 않으면 옛 HTML을 되살린다. 캐시를 지우는 조건은 "Astro 설정이 바뀜"인데(node_modules/astro/dist/content/content-layer.js —
// vite 설정을 뺀 설정을 JSON으로 비교), 함수 속 코드는 JSON에 들어가지 않는다. 그래서 astro.config.mjs가 이 플러그인을
// [플러그인, { version: REHYPE_LESSON_POLISH_VERSION }]으로 등록한다 — **동작을 바꾸면 아래 판 번호를 올린다**(설정 JSON이 바뀌어
// 다음 빌드·개발 서버가 "Astro config changed → Clearing content store"로 차시를 모두 다시 그린다. 배포 워크플로의 캐시도 같다).
//
// Node.js가 직접 읽으므로(astro.config.mjs·check-lessons) JavaScript(JSDoc 타입 표기)로 쓴다.

/** 이 플러그인의 동작 판. 출력이 바뀌는 수정을 하면 1씩 올린다(위 캐시 주의). */
export const REHYPE_LESSON_POLISH_VERSION = 1;

/**
 * @typedef {object} RehypeLessonPolishOptions
 * @property {number} [version] 동작 판(astro.config.mjs가 REHYPE_LESSON_POLISH_VERSION을 넣는다 — 캐시를 비우는 용도로만 쓴다)
 */

/**
 * rehype 플러그인(unified 규약: 설정을 받아 변환 함수를 돌려준다).
 * @param {RehypeLessonPolishOptions} [_options]
 * @returns {(tree: import('hast').Root, file: import('vfile').VFile) => void}
 */
export default function rehypeLessonPolish(_options = {}) {
  return function transform(_tree, _file) {
    // 구역 A가 채운다(위 머리말). 지금은 HTML을 그대로 둔다.
  };
}
