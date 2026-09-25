// YAML 주석 함정 찾기 — 따옴표 없는 글 값 안의 " #"부터는 주석이 되어 글이 잘린다(2026-09-25 Phase 5 검토 중요 1:
// 4-2-2 퀴즈 풀이 "…세 줄 앞에 #이 붙어 있어요…"가 "…세 줄 앞에"에서 끊겨 실사이트에 반쪽 문장으로 나갔다).
//
// yaml 라이브러리는 같은 줄 끝 주석을 그 값(node.comment)에 붙인다. 여기서는 그런 값 가운데
//   ① 글을 적는 칸(PROSE_KEYS — 문제·풀이·제목·설명·보기·실습 방법 등)의 값이거나
//   ② "#" 바로 뒤에 빈칸이 없는 주석("#이 붙어", "#1") — 일부러 단 주석은 거의 "# 설명"처럼 빈칸을 둔다
// 이면 함정으로 알린다. 숫자·참거짓·목록 뒤의 주석(answer: 1  # 순번)은 글이 잘리지 않으니 괜찮다.
// 고치는 법: 값을 큰따옴표로 감싼다(안의 큰따옴표는 \" 또는 작은따옴표로).
//
// 쓰는 곳: npm run check:lessons(차시 frontmatter와 그 차시 예제의 사이드카 — scripts/lib/check-lessons.mjs),
// 저장소 전체 훑기 단위 테스트(tests/unit/lesson/yaml-comment-traps.test.ts).
import { isPair, isScalar, parseDocument, visit } from 'yaml';

/** 글(문장)을 적는 칸 이름 — 여기의 값에 붙은 같은 줄 주석은 모두 함정으로 본다 */
export const PROSE_KEYS = new Set([
  'title',
  'description',
  'q',
  'explain',
  'choices',
  'note',
  'materials',
  'tags',
  'practice',
  'label',
  'summary',
  'alt',
  'use',
  'result',
  'cause',
  'fix',
  'message',
  'text',
]);

/**
 * @typedef {object} YamlCommentTrap
 * @property {number} line 1부터 세는 줄 번호(주어진 글 기준)
 * @property {string | undefined} key 값이 속한 칸 이름
 * @property {string} value 잘린 뒤 남은 값
 * @property {string} comment 주석이 되어 사라진 글
 */

/**
 * @param {string} text YAML 글(frontmatter는 --- 사이만)
 * @returns {YamlCommentTrap[]}
 */
export function findYamlCommentTraps(text) {
  const document = parseDocument(text);
  /** @type {YamlCommentTrap[]} */
  const traps = [];
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') lineStarts.push(index + 1);
  }
  const lineOf = (/** @type {number} */ offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
  visit(document, {
    Scalar(key, node, path) {
      if (!node.comment || node.type !== 'PLAIN' || typeof node.value !== 'string' || key === 'key') {
        return;
      }
      /** @type {string | undefined} */
      let owner;
      for (let index = path.length - 1; index >= 0; index -= 1) {
        const ancestor = path[index];
        if (isPair(ancestor)) {
          owner = isScalar(ancestor.key) ? String(ancestor.key.value) : undefined;
          break;
        }
      }
      const noSpace = !/^\s/u.test(node.comment);
      if ((owner && PROSE_KEYS.has(owner)) || noSpace) {
        traps.push({ line: lineOf(node.range?.[0] ?? 0), key: owner, value: node.value, comment: node.comment.trim() });
      }
    },
  });
  return traps;
}

/**
 * 사람이 읽는 한 줄(검사 결과용)
 * @param {YamlCommentTrap} trap
 * @param {string} where 파일 이름 등
 */
export function describeYamlCommentTrap(trap, where) {
  return (
    `${where} ${trap.line}행${trap.key ? `(${trap.key})` : ''}: 따옴표 없는 값 안의 " #"부터 주석이 되어 글이 "${trap.value.slice(-20)}"에서 잘려요` +
    `(사라진 글: "#${trap.comment.slice(0, 24)}…"). 값을 큰따옴표로 감싸요.`
  );
}
