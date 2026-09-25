// 마크다운 처리 플러그인 목록 한 곳(2026-09-26 Phase 6 병렬 제작 준비).
// 빌드(astro.config.mjs의 markdown.processor)와 차시 틀 검사(scripts/lib/check-lessons.mjs)가 이 목록을 함께 써서 두 곳의 순서가 어긋나지 않는다.
//
// remark 순서가 중요하다(src/lib/remark-boxes.mjs 머리말):
//   remarkDirective(: 문법 읽기) → remarkGlossary(:용어[…]) → remarkBoxes(:::상자, 처리 안 된 지시문을 원래 글자로 되돌림)
// rehype는 Shiki 코드 색 다음에 돈다(자리와 캐시 주의는 src/lib/rehype-lesson-polish.mjs 머리말).
//
// Node.js가 직접 읽으므로 JavaScript(JSDoc 타입 표기)로 쓴다.
import remarkDirective from 'remark-directive';
import rehypeLessonPolish, { REHYPE_LESSON_POLISH_VERSION } from './rehype-lesson-polish.mjs';
import remarkBoxes from './remark-boxes.mjs';
import remarkGlossary from './remark-glossary.mjs';

/** @type {import('@astrojs/markdown-remark').RemarkPlugins} */
export const remarkPlugins = [remarkDirective, remarkGlossary, remarkBoxes];

/**
 * 판 번호를 설정으로 넘기는 까닭: 플러그인 동작이 바뀌면 Astro 설정 JSON이 바뀌어 콘텐츠 캐시가 비워진다(rehype-lesson-polish.mjs 머리말).
 * @type {import('@astrojs/markdown-remark').RehypePlugins}
 */
export const rehypePlugins = [[rehypeLessonPolish, { version: REHYPE_LESSON_POLISH_VERSION }]];
