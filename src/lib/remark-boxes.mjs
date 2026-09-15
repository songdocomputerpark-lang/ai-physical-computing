// 상자 문법(PLAN §2.6·§8.1 P1-06, PD-10) — 차시 마크다운의 :::교사용 … ::: 을 HTML 상자로 바꾸는 remark 플러그인.
//
// 쓰는 법(마크다운)
//   :::왜그럴까
//   임계값보다 밝은 픽셀만 흰색이 되기 때문이에요.
//   :::
//
//   :::도전[도전 과제 2: 더 빠르게]      ← 대괄호 안 글자는 상자 제목이 된다(없으면 기본 제목)
//   글자를 더 빨리 움직여 보세요.
//   :::
//
//   ::::도전                             ← 상자 안에 상자를 넣을 때는 "바깥" 상자의 콜론을 하나 더(4개) 쓴다
//   글자를 더 빨리 움직여 보세요.
//
//   :::힌트
//   기다리는 시간을 줄여 보세요.
//   :::
//   ::::
//   (바깥 3개·안쪽 4개로 쓰면 안쪽이 끝난 뒤 바깥 상자가 일찍 닫힌다 — 2026-09-16 확인)
//
//   :::교사용{open}                       ← 접는 상자를 처음부터 펼쳐 둔다
//
// 상자 종류는 아래 BOX_TYPES에 있다. 영어 이름(:::teacher 등)도 같은 뜻이다.
// 모르는 이름(:::교사욯 같은 오타)은 상자로 바꾸지 않고 글자를 그대로 보여 주며, 빌드 로그에 경고를 남긴다(PD-35: 빌드는 멈추지 않음).
//
// 콜론 바로 뒤에 글자가 오는 보통 글("10:30", "예:픽셀", "16:9")도 remark-directive는 지시문으로 읽는다(2026-09-16 확인).
// 그래서 이 플러그인은 어떤 플러그인도 처리하지 않은 지시문(node.data.hName이 없는 것)을 원래 글자로 되돌려 글이 사라지지 않게 한다.
// astro.config.mjs에서는 지시문을 쓰는 다른 플러그인(remark-glossary.mjs)보다 뒤에 둔다.
//
// 만드는 HTML(스타일: src/styles/boxes.css, 같은 HTML을 만드는 컴포넌트: src/components/common/Callout.astro)
//   <div class="box box--why" data-box="why" role="note"><p class="box__title">왜 이런 결과가 나올까?</p>…</div>
//   <details class="box box--teacher" data-box="teacher"><summary class="box__title">교사용 안내</summary>…</details>
//
// Node.js가 직접 읽으므로(astro.config.mjs) JavaScript(JSDoc 타입 표기)로 쓴다.

import path from 'node:path';

/**
 * @typedef {object} BoxType
 * @property {string} name 마크다운에 적는 이름
 * @property {readonly string[]} aliases 같은 뜻의 영어 이름
 * @property {string} variant CSS 클래스(box--이름)와 data-box 값
 * @property {string} title 기본 제목
 * @property {boolean} collapsible 접는 상자(<details>)인지
 * @property {string} use 쓰임새와 근거
 */

/** 상자 종류(적힌 순서가 문서·검사 목록의 순서) */
export const BOX_TYPES = Object.freeze([
  boxType('왜그럴까', ['why'], 'why', '왜 이런 결과가 나올까?', false, '예제 결과가 왜 그렇게 나오는지 풀이(SPEC §6.1)'),
  boxType('바꿔보기', ['try'], 'try', '바꿔 보기', false, '값이나 코드를 바꿔 보는 과제 3가지(SPEC §6.1, §7.2 5번)'),
  boxType('도전', ['challenge'], 'challenge', '도전 과제', false, '도전 과제 1~2개(SPEC §7.2 6번)'),
  boxType('힌트', ['hint'], 'hint', '힌트 보기', true, '도전 과제의 힌트 접기(SPEC §7.2 6번)'),
  boxType('정답', ['answer'], 'answer', '정답과 풀이 보기', true, '문제의 정답과 풀이 접기(대단원 마무리 등)'),
  boxType('확인', ['check'], 'check', '확인해 보세요', false, '단계 끝 체크리스트(SPEC §7.1)'),
  boxType('오류', ['trouble'], 'trouble', '이런 오류가 나면', false, '예상 오류와 해결 방법(SPEC §7.1)'),
  boxType('주의', ['caution'], 'caution', '주의하세요', false, '안전과 주의(레이저·팬 모터 등, PLAN §10)'),
  boxType('참고', ['note'], 'note', '참고', false, '덧붙이는 설명'),
  boxType('교사용', ['teacher'], 'teacher', '교사용 안내', true, '지도 요약·평가 포인트·자주 막히는 곳(SPEC §7.2 8번)'),
]);

/**
 * @param {string} name
 * @param {string[]} aliases
 * @param {string} variant
 * @param {string} title
 * @param {boolean} collapsible
 * @param {string} use
 * @returns {BoxType}
 */
function boxType(name, aliases, variant, title, collapsible, use) {
  return Object.freeze({ name, aliases: Object.freeze(aliases), variant, title, collapsible, use });
}

/** @type {Map<string, BoxType>} */
const BOX_BY_NAME = new Map();
for (const type of BOX_TYPES) {
  for (const name of [type.name, ...type.aliases]) {
    BOX_BY_NAME.set(name, type);
  }
}

/**
 * 이름(한국어 또는 영어)으로 상자 종류를 찾는다.
 * @param {string} name
 * @returns {BoxType | undefined}
 */
export function findBoxType(name) {
  return BOX_BY_NAME.get(name.normalize('NFC'));
}

/**
 * 상자 HTML의 class 목록
 * @param {BoxType} type
 * @returns {string[]}
 */
export function boxClassNames(type) {
  return ['box', `box--${type.variant}`];
}

const DIRECTIVE_TYPES = new Set(['textDirective', 'leafDirective', 'containerDirective']);

/**
 * remark 플러그인
 * @returns {(tree: any, file?: { path?: string }) => void}
 */
export default function remarkBoxes() {
  return (tree, file) => {
    transformChildren(tree, file);
  };
}

/**
 * 안쪽부터 차례로 상자를 만들고, 처리되지 않은 지시문은 원래 글자로 되돌린다.
 * @param {any} parent
 * @param {{ path?: string } | undefined} file
 */
function transformChildren(parent, file) {
  if (!Array.isArray(parent?.children)) {
    return;
  }
  for (let index = 0; index < parent.children.length; index += 1) {
    const node = parent.children[index];
    transformChildren(node, file);
    if (!DIRECTIVE_TYPES.has(node.type) || node.data?.hName) {
      continue;
    }
    if (node.type === 'containerDirective') {
      const type = findBoxType(node.name);
      if (type) {
        applyBox(node, type);
        continue;
      }
      warnUnknownBox(node, file);
    }
    const restored = restoreDirective(node);
    parent.children.splice(index, 1, ...restored);
    index += restored.length - 1;
  }
}

/**
 * 컨테이너 지시문 노드를 상자로 바꾼다(mdast의 data.hName·hProperties를 채우면 HTML로 바뀔 때 반영된다).
 * @param {any} node
 * @param {BoxType} type
 */
function applyBox(node, type) {
  const [first, ...rest] = node.children;
  const hasLabel = first?.type === 'paragraph' && first.data?.directiveLabel === true;
  const titleChildren = hasLabel && first.children.length > 0 ? first.children : [textNode(type.title)];
  const body = hasLabel ? rest : node.children;
  const attributes = node.attributes ?? {};

  /** @type {Record<string, unknown>} */
  const properties = { className: boxClassNames(type), dataBox: type.variant };
  if (type.collapsible) {
    if (Object.hasOwn(attributes, 'open') && attributes.open !== 'false') {
      properties.open = true;
    }
  } else {
    properties.role = 'note';
  }

  node.data = { ...node.data, hName: type.collapsible ? 'details' : 'div', hProperties: properties };
  node.children = [
    {
      type: 'paragraph',
      data: { hName: type.collapsible ? 'summary' : 'p', hProperties: { className: ['box__title'] } },
      children: titleChildren,
    },
    ...body,
  ];
}

/**
 * 처리되지 않은 지시문을 사람이 적은 글자 모양으로 되돌린다.
 * @param {any} node
 * @returns {any[]}
 */
function restoreDirective(node) {
  const attributeText = formatAttributes(node.attributes);
  const attributeNodes = attributeText ? [textNode(attributeText)] : [];

  if (node.type === 'textDirective' || node.type === 'leafDirective') {
    const label = node.children.length > 0 ? [textNode('['), ...node.children, textNode(']')] : [];
    const marker = node.type === 'textDirective' ? ':' : '::';
    const restored = [textNode(`${marker}${node.name}`), ...label, ...attributeNodes];
    return node.type === 'textDirective' ? restored : [{ type: 'paragraph', children: restored }];
  }

  const [first, ...rest] = node.children;
  const hasLabel = first?.type === 'paragraph' && first.data?.directiveLabel === true;
  const label = hasLabel ? [textNode('['), ...first.children, textNode(']')] : [];
  return [
    { type: 'paragraph', children: [textNode(`:::${node.name}`), ...label, ...attributeNodes] },
    ...(hasLabel ? rest : node.children),
    { type: 'paragraph', children: [textNode(':::')] },
  ];
}

/**
 * @param {Record<string, string | null | undefined> | null | undefined} attributes
 * @returns {string}
 */
function formatAttributes(attributes) {
  if (!attributes) {
    return '';
  }
  const parts = Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => (value === '' ? key : `${key}="${value}"`));
  return parts.length > 0 ? `{${parts.join(' ')}}` : '';
}

/**
 * @param {string} value
 * @returns {{ type: 'text', value: string }}
 */
function textNode(value) {
  return { type: 'text', value };
}

/**
 * 모르는 상자 이름을 빌드 로그에 알린다. 파일 경로는 저장소 기준으로 줄여서 보인다.
 * @param {any} node
 * @param {{ path?: string } | undefined} file
 */
function warnUnknownBox(node, file) {
  const line = node.position?.start?.line;
  const filePath = file?.path ? path.relative(process.cwd(), file.path).split(path.sep).join('/') : '';
  const where = filePath ? ` (${filePath}${line ? `:${line}` : ''})` : '';
  const names = BOX_TYPES.map((type) => type.name).join(', ');
  console.warn(
    `[상자 문법] 모르는 상자 이름 ":::${node.name}"${where} — 상자로 바꾸지 않고 글자 그대로 보여 줘요. 쓸 수 있는 이름: ${names}`,
  );
}
