// 용어 표시 문법(PLAN §8.1 P1-07) — 지금은 스텁(자리만 잡은 모양)이다. 용어사전 담당이 이 파일 안에서 기능을 구현한다.
//
// 문법(공통 기반 단계에서 정함. PLAN §2.6에 정해진 문법이 없었다)
//   :용어[픽셀]              본문의 "픽셀"을 용어사전 항목과 잇는다. content/glossary/*.md의 title 또는 aliases와 같은 말을 찾는다.
//   :용어[화소]{항목=pixel}   보이는 말과 항목이 다를 때 항목 id(content/glossary/pixel.md → pixel)를 적는다.
//   :용어[화소]{#pixel}       위와 같은 뜻의 짧은 모양(id 속성).
//   :term[pixel]            영어 이름도 같은 뜻이다.
//   조사는 대괄호 밖에 붙인다: ":용어[픽셀]은", ":용어[센서]를"
//
// 근거
// - 상자 문법(:::교사용)과 같은 remark-directive 문법이라 새 파서가 필요 없다.
//   한글 지시문 이름과 한글 속성 이름({항목=pixel})이 읽히는 것을 확인했다(2026-09-16, micromark-extension-directive 4).
// - 코드 블록과 인라인 코드 안에서는 바뀌지 않아 예제 코드와 섞이지 않는다.
// - SPEC §7.1 "용어 첫 등장 시 굵게 + 툴팁 + 용어사전 링크": 굵게 보이는 모양·툴팁·링크는 구현이 정한다.
//
// 다른 플러그인과의 약속(src/lib/remark-boxes.mjs 머리말과 같다)
// - astro.config.mjs에서 remarkDirective → remarkGlossary(이 파일) → remarkBoxes 순서로 돈다.
// - 처리한 지시문 노드는 다른 노드로 바꾸거나 node.data.hName을 채운다.
//   remark-boxes는 hName이 없는 지시문을 "문법으로 쓴 것이 아닌 글자"(예: 10:30)로 보고 원래 글자로 되돌린다.
//
// 스텁 동작: 툴팁·링크 없이 대괄호 안 글자만 남긴다. 그래서 이 문법으로 먼저 쓴 글도 자연스럽게 읽힌다.
// 대괄호가 없는 ":용어"는 건드리지 않는다(remark-boxes가 원래 글자로 되돌린다).
//
// Node.js가 직접 읽으므로(astro.config.mjs) JavaScript(JSDoc 타입 표기)로 쓴다.

/** 용어 표시 지시문 이름 */
export const GLOSSARY_DIRECTIVE_NAMES = Object.freeze(['용어', 'term']);

/** 항목 id를 적는 속성 이름(앞에서부터 찾는다). {#pixel}은 id 속성이 된다. */
export const GLOSSARY_ENTRY_ATTRIBUTES = Object.freeze(['항목', 'id']);

/**
 * 용어 표시 지시문인지 알려 준다.
 * @param {{ type?: string, name?: string }} node mdast 노드
 * @returns {boolean}
 */
export function isGlossaryDirective(node) {
  return (
    node.type === 'textDirective' &&
    typeof node.name === 'string' &&
    GLOSSARY_DIRECTIVE_NAMES.includes(node.name.normalize('NFC'))
  );
}

/**
 * remark 플러그인(스텁)
 * @returns {(tree: any) => void}
 */
export default function remarkGlossary() {
  return (tree) => {
    unwrapGlossaryDirectives(tree);
  };
}

/**
 * :용어[글자]를 글자만 남기고 푼다.
 * @param {any} parent
 */
function unwrapGlossaryDirectives(parent) {
  if (!Array.isArray(parent?.children)) {
    return;
  }
  for (let index = 0; index < parent.children.length; index += 1) {
    const node = parent.children[index];
    unwrapGlossaryDirectives(node);
    if (isGlossaryDirective(node) && node.children.length > 0) {
      parent.children.splice(index, 1, ...node.children);
      index += node.children.length - 1;
    }
  }
}
